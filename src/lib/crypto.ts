/**
 * AES-256-GCM secret encryption built on the Web Crypto API.
 *
 * Works everywhere the app runs: Cloudflare Workers, Node (>=19) and browsers.
 * Key derivation and payload format stay compatible with the previous
 * node:crypto implementation (sha256(secret) key, "iv:tag:data" base64).
 */

export interface CryptoEnv {
  APP_SECRET?: string;
  DATABASE_URL?: string;
}

const FALLBACK_SECRET = "recap-script-studio";

function getSecret(env?: CryptoEnv): string {
  return env?.APP_SECRET || env?.DATABASE_URL || FALLBACK_SECRET;
}

async function getAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptSecret(
  plain: string,
  env?: CryptoEnv
): Promise<string> {
  const key = await getAesKey(getSecret(env));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain)
  );

  // subtle.encrypt appends the 16-byte auth tag to the ciphertext
  const full = new Uint8Array(encrypted);
  const cipherBytes = full.slice(0, -16);
  const tagBytes = full.slice(-16);

  return `${bytesToBase64(iv)}:${bytesToBase64(tagBytes)}:${bytesToBase64(
    cipherBytes
  )}`;
}

export async function decryptSecret(
  payload: string,
  env?: CryptoEnv
): Promise<string> {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }

  const key = await getAesKey(getSecret(env));
  const iv = base64ToBytes(ivB64);
  const tag = base64ToBytes(tagB64);
  const data = base64ToBytes(dataB64);

  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data, 0);
  combined.set(tag, data.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      combined
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Decryption failed");
  }
}

export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "••••••••";
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
