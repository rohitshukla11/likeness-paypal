/** C2PA with a locally made test chain: sign a JPEG, read the manifest back. No network, no cloud project. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { embedManifest, readManifest, type LicenceAssertion } from "../lib/ai/c2pa";

const dir = mkdtempSync(path.join(tmpdir(), "c2pa-test-"));

const assertion: LicenceAssertion = {
  protocol: "likeness-paypal/1",
  licenceId: "lic_test",
  renderId: "rnd_test",
  renderType: "image",
  use: "advertising",
  payment: { provider: "PayPal", orderId: "ORDER1", authorizationId: "AUTH1" },
  receipt: { store: "Postgres receipts, by render id", signedBy: "Ed25519 (GET /api/receipts/public-key)", verify: "http://localhost:3000/verify" },
  renderer: { provider: "Gemini API", model: "gemini-nano-banana-2.1" },
  promptSha256: "0".repeat(64),
  createdAt: "2026-11-11T00:00:00.000Z",
};

describe("C2PA content credentials", () => {
  before(() => {
    execFileSync("sh", ["scripts/c2pa-testcert.sh"], { env: { ...process.env, C2PA_DIR: dir }, stdio: "ignore" });
    process.env.C2PA_CERT_FILE = path.join(dir, "signer.pem");
    process.env.C2PA_KEY_FILE = path.join(dir, "signer.key");
  });
  after(() => {
    delete process.env.C2PA_CERT_FILE;
    delete process.env.C2PA_KEY_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  it("signs a JPEG and reads the licence assertion back; the test signer is reported untrusted", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 320, height: 320, channels: 3, background: "#dcf37b" } }).jpeg().toBuffer());
    const signed = embedManifest(jpeg, "image/jpeg", assertion);
    assert.ok(signed.length > jpeg.length, "the manifest is embedded");
    const m = await readManifest(signed, "image/jpeg");
    assert.equal(m.present, true);
    if (!m.present) return;
    assert.equal(m.signatureValid, true);
    assert.equal(m.trustedSigner, false, "a local test certificate is not on the C2PA trust list");
    assert.deepEqual(m.licence?.payment, { provider: "PayPal", orderId: "ORDER1", authorizationId: "AUTH1" });
    assert.equal(m.licence?.renderer.model, "gemini-nano-banana-2.1");
  });

  it("a file changed after signing no longer validates", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 320, height: 320, channels: 3, background: "#8b5cf6" } }).jpeg().toBuffer());
    const signed = Buffer.from(embedManifest(jpeg, "image/jpeg", assertion));
    signed[signed.length - 10] ^= 0xff; // flip a byte of the image data
    const m = await readManifest(new Uint8Array(signed), "image/jpeg");
    assert.ok(!m.present || !m.signatureValid);
  });

  it("an unsigned file has no manifest", async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).jpeg().toBuffer());
    assert.equal((await readManifest(jpeg, "image/jpeg")).present, false);
  });
});
