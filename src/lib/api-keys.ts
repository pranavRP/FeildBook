import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const KEY_PATTERN = /^rig_([a-z0-9]{8})_([A-Za-z0-9]{32})$/;
const SECRET_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(alphabet: string, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** New rig key `rig_<8-char prefix>_<32-char secret>`. The plaintext is shown once and never stored. */
export function generateApiKey() {
  const prefix = randomString(ALPHABET, 8);
  const key = `rig_${prefix}_${randomString(SECRET_ALPHABET, 32)}`;
  return { key, prefix, hash: hashApiKey(key) };
}

export function parseApiKey(key: string): { prefix: string } | null {
  const m = KEY_PATTERN.exec(key);
  return m ? { prefix: m[1] } : null;
}

/** Constant-time comparison of a presented key against a stored sha256 hex digest. */
export function verifyApiKey(presented: string, storedHash: string) {
  const a = Buffer.from(hashApiKey(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
