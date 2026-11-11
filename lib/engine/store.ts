import "server-only";
/** The engine's store on Postgres (Drizzle). admit() is the policy transaction: licence and mandate locked FOR UPDATE. */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Db } from "../db";
import { putBlob, renderKey } from "../blobs";
import { creators, licences, mandates, paypalOrders, paypalPayouts, receipts, refusals, renders } from "../db/schema";
import { newId } from "../errors";
import type { SignedReceipt } from "../receipts";
import type { EngineStore, RenderContext, RenderRow, RenderStatus } from "./render-and-pay";
import { promptHash } from "./render-and-pay";

const asRow = (r: typeof renders.$inferSelect): RenderRow => r as unknown as RenderRow;

export class DrizzleStore implements EngineStore {
  constructor(private readonly database: () => Db = db) {}

  async getRender(id: string) {
    const [r] = await this.database().select().from(renders).where(eq(renders.id, id));
    return r ? asRow(r) : null;
  }

  admit: EngineStore["admit"] = async (req, opts, decide) =>
    this.database().transaction(async (tx) => {
      // Lock order (licence, then mandate) is the same everywhere, so concurrent renders queue instead of deadlocking.
      const [l] = await tx.select().from(licences).where(eq(licences.id, req.licenceId)).for("update");
      const [m] = await tx.select().from(mandates).where(eq(mandates.id, req.mandateId)).for("update");
      if (!l || !m) throw new Error(!l ? "no such licence" : "no such mandate");
      if (l.brandId !== m.brandId) throw new Error("the licence and the mandate belong to different brands");
      const [existing] = await tx.select().from(renders).where(eq(renders.id, req.renderId)).for("update");
      if (existing && existing.status !== "needs_brand_approval") return { render: asRow(existing), created: false };
      if (existing && !opts.stepUpApproved) return { render: asRow(existing), created: false };

      const [{ spent }] = await tx
        .select({ spent: sql<number>`coalesce(sum(${renders.amountCents}), 0)::int` })
        .from(renders)
        .where(and(eq(renders.mandateId, m.id), eq(renders.reserved, true), gte(renders.createdAt, opts.dayStart)));
      const a = decide(l, m, spent);
      const reserve = a.status === "authorizing";
      const values = { status: a.status, amountCents: a.amountCents, reserved: reserve, error: a.status === "refused" ? a.refusal.detail : null, updatedAt: new Date() };
      let row;
      if (existing) {
        [row] = await tx.update(renders).set(values).where(eq(renders.id, req.renderId)).returning();
      } else {
        [row] = await tx
          .insert(renders)
          .values({ id: req.renderId, licenceId: req.licenceId, mandateId: req.mandateId, kind: req.kind, fromRenderId: req.fromRenderId ?? null, aspect: req.aspect ?? null, use: req.use, prompt: req.prompt, promptSha256: promptHash(req.prompt), ...values })
          .returning();
      }
      if (reserve) {
        await tx.update(licences).set({ rendersUsed: sql`${licences.rendersUsed} + 1` }).where(eq(licences.id, l.id));
        await tx.update(mandates).set({ spentCents: sql`${mandates.spentCents} + ${a.amountCents}` }).where(eq(mandates.id, m.id));
      }
      if (a.status === "refused") await tx.insert(refusals).values({ id: newId("ref"), renderId: req.renderId, licenceId: l.id, mandateId: m.id, reason: a.refusal.reason, detail: a.refusal.detail });
      return { render: asRow(row), created: !existing };
    });

  async context(renderId: string): Promise<RenderContext> {
    const [x] = await this.database()
      .select({ render: renders, creator: { id: creators.id, photoRef: creators.photoRef, payoutPaypalEmail: creators.payoutPaypalEmail, workspaceId: creators.workspaceId }, brandId: licences.brandId, paymentTokenId: mandates.paymentTokenId })
      .from(renders)
      .innerJoin(licences, eq(licences.id, renders.licenceId))
      .innerJoin(creators, eq(creators.id, licences.creatorId))
      .innerJoin(mandates, eq(mandates.id, renders.mandateId))
      .where(eq(renders.id, renderId));
    if (!x) throw new Error(`render ${renderId} not found`);
    return { render: asRow(x.render), creator: x.creator, brandId: x.brandId, paymentTokenId: x.paymentTokenId };
  }

  async update(renderId: string, patch: Partial<RenderRow>, fromStatus?: RenderStatus[]) {
    const where = fromStatus ? and(eq(renders.id, renderId), inArray(renders.status, fromStatus)) : eq(renders.id, renderId);
    const [r] = await this.database()
      .update(renders)
      .set({ ...(patch as Partial<typeof renders.$inferInsert>), updatedAt: new Date() })
      .where(where)
      .returning();
    return r ? asRow(r) : null;
  }

  async release(renderId: string, opts: { render: boolean }) {
    await this.database().transaction(async (tx) => {
      const [r] = await tx.select().from(renders).where(eq(renders.id, renderId)).for("update");
      if (!r || !r.reserved) return;
      // Same lock order as admit(): licence, then mandate.
      await tx.select({ id: licences.id }).from(licences).where(eq(licences.id, r.licenceId)).for("update");
      if (opts.render) await tx.update(licences).set({ rendersUsed: sql`greatest(${licences.rendersUsed} - 1, 0)` }).where(eq(licences.id, r.licenceId));
      await tx.update(mandates).set({ spentCents: sql`greatest(${mandates.spentCents} - ${r.amountCents}, 0)` }).where(eq(mandates.id, r.mandateId));
      await tx.update(renders).set({ reserved: false, updatedAt: new Date() }).where(eq(renders.id, renderId));
    });
  }

  async refuse(r: { renderId: string | null; licenceId: string | null; mandateId: string | null; reason: string; detail: string }) {
    await this.database().insert(refusals).values({ id: newId("ref"), ...r });
  }

  async recordOrder(o: Parameters<EngineStore["recordOrder"]>[0]) {
    const set = Object.fromEntries(Object.entries({ status: o.status, authorizationId: o.authorizationId, authorizationStatus: o.authorizationStatus, captureId: o.captureId, refundId: o.refundId }).filter(([, v]) => v !== undefined && v !== null));
    await this.database()
      .insert(paypalOrders)
      .values({ orderId: o.orderId, paymentTokenId: o.paymentTokenId, status: o.status, authorizationId: o.authorizationId ?? null, authorizationStatus: o.authorizationStatus ?? null, captureId: o.captureId ?? null, refundId: o.refundId ?? null, amountCents: o.amountCents, customId: o.customId })
      .onConflictDoUpdate({ target: paypalOrders.orderId, set: { ...set, updatedAt: new Date() } });
  }

  async recordPayout(p: Parameters<EngineStore["recordPayout"]>[0]) {
    await this.database().insert(paypalPayouts).values(p).onConflictDoUpdate({ target: paypalPayouts.senderBatchId, set: { payoutBatchId: p.payoutBatchId, status: p.status } });
  }

  async saveReceipt(renderId: string, r: SignedReceipt) {
    await this.database()
      .insert(receipts)
      .values({ id: r.payload.receiptId, renderId, canonicalPayload: r.canonical, payloadSha256: r.payloadSha256, signature: r.signature, alg: r.alg, keyId: r.keyId, status: r.payload.status, outputSha256: r.payload.outputSha256 || null })
      .onConflictDoNothing({ target: receipts.renderId });
  }

  async saveMedia(renderId: string, m: { bytes: Uint8Array; mime: string; sha256: string }) {
    await putBlob(renderKey(renderId), { kind: "render", mime: m.mime, bytes: m.bytes, sha256: m.sha256 });
  }

  async due(now: Date, staleMs: number) {
    const stale = new Date(now.getTime() - staleMs);
    const rows = await this.database()
      .select({ id: renders.id })
      .from(renders)
      .leftJoin(receipts, eq(receipts.renderId, renders.id))
      .where(
        or(
          and(eq(renders.status, "in_review"), lt(renders.reviewDeadline, now)),
          and(inArray(renders.status, ["settling", "refunding"]), lt(renders.updatedAt, stale)),
          and(inArray(renders.status, ["accepted", "rejected"]), isNull(receipts.id)),
        ),
      )
      .limit(50);
    return rows.map((r) => r.id);
  }
}
