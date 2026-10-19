import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, parseApiKey, verifyApiKey } from "../api-keys";

describe("api keys", () => {
  it("generates rig_<8>_<32> keys with a sha256 hash", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^rig_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(parseApiKey(key)).toEqual({ prefix });
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("verifies only the exact key", () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey(`${key.slice(0, -1)}x`, hash)).toBe(false);
    expect(verifyApiKey(key, "00")).toBe(false);
  });
  it("rejects malformed keys", () => {
    expect(parseApiKey("rig_short_x")).toBeNull();
    expect(parseApiKey("Bearer rig_abcdefgh_" + "a".repeat(32))).toBeNull();
  });
});
