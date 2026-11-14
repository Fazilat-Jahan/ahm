/**
 * PIN hashing via WebCrypto PBKDF2 (SPEC §13: "optional app PIN lock (hash
 * with PBKDF2/WebCrypto)"). The PIN is a convenience lock, not strong
 * security (SPEC §5.1 item 7) — this is deliberately not a vault.
 */

const ITERATIONS = 150_000;
const HASH_ALGORITHM = "SHA-256";
const KEY_LENGTH_BITS = 256;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return toBase64(derived);
}

export interface PinHash {
  hash: string;
  salt: string;
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  return { hash, salt: toBase64(salt) };
}

export async function verifyPin(
  pin: string,
  stored: PinHash,
): Promise<boolean> {
  const salt = fromBase64(stored.salt);
  const hash = await derive(pin, salt);
  return hash === stored.hash;
}
