import { randomBytes } from "node:crypto";

/** An error with an HTTP status, shown to the user as is. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A random id with a readable prefix: lic_…, rnd_…, rcp_… (16 random bytes, base64url). */
export const newId = (prefix: string) => `${prefix}_${randomBytes(16).toString("base64url")}`;
