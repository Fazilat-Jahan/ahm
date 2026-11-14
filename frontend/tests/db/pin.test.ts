import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/db/pin";

describe("PIN hashing (PBKDF2 via WebCrypto)", () => {
  it("verifies the correct PIN", async () => {
    const stored = await hashPin("1234");
    expect(await verifyPin("1234", stored)).toBe(true);
  });

  it("rejects an incorrect PIN", async () => {
    const stored = await hashPin("1234");
    expect(await verifyPin("4321", stored)).toBe(false);
  });

  it("never stores the PIN itself", async () => {
    const stored = await hashPin("123456");
    expect(stored.hash).not.toContain("123456");
    expect(stored.salt).not.toContain("123456");
  });

  it("produces a different hash each time due to random salt", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
