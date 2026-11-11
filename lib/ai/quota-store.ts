import "server-only";
/** The AI caps on Postgres: one transaction, one conditional UPDATE per key (count < limit), all or nothing. */
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { aiQuota } from "../db/schema";
import type { Quota, QuotaKey } from "./quota";

class Full extends Error {}

export class DrizzleQuota implements Quota {
  async reserve(keys: QuotaKey[]): Promise<boolean> {
    try {
      await db().transaction(async (tx) => {
        for (const k of keys) {
          await tx.insert(aiQuota).values({ key: k.key, count: 0 }).onConflictDoNothing();
          const took = await tx
            .update(aiQuota)
            .set({ count: sql`${aiQuota.count} + 1`, updatedAt: new Date() })
            .where(and(eq(aiQuota.key, k.key), lt(aiQuota.count, k.limit)))
            .returning({ count: aiQuota.count });
          if (!took.length) throw new Full();
        }
      });
      return true;
    } catch (e) {
      if (e instanceof Full) return false;
      throw e;
    }
  }
}
