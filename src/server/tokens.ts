import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appSecret } from "./config";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Signs a JSON payload: <base64url(json)>.<hmac>. */
export function sign(kind: string, payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify({ k: kind, ...payload }));
  const mac = createHmac("sha256", appSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T extends Record<string, unknown>>(kind: string, token: string | undefined | null): T | null {
  if (!token || typeof token !== "string") return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", appSecret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.k !== kind) return null;
    if (typeof data.exp === "number" && data.exp < Date.now()) return null;
    return data as T;
  } catch {
    return null;
  }
}

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export function randomId(length = 10): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const hashKey = (key: string) => createHmac("sha256", appSecret()).update(`manage:${key}`).digest("hex");
