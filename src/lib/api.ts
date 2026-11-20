"use client";

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json !== undefined ? "POST" : "GET"),
    headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface PublicListing {
  id: string;
  title: string;
  description: string;
  priceUsd: number;
  sellerAddress: string;
  sellerName: string | null;
  sellerNostr: { npub: string; name: string | null; picture: string | null; nip05: string | null } | null;
  kind: "text" | "link" | "file";
  emoji: string;
  hue: number;
  createdAt: number;
  sales: number;
}

export interface Secret {
  text?: string;
  url?: string;
  file?: { url: string; name: string; size: number; type: string };
}

export interface Quote {
  token: string;
  sellerSats: number;
  feeSats: number;
  totalSats: number;
  feeAddress: string;
  sellerAddress: string;
  usdPerBch: number;
  feeUsd: number;
  expiresAt: number;
}

export interface AppConfig {
  minting: boolean;
  category: string | null;
  feeAddress: string | null;
  uploads: boolean;
}

// ---- local, per-device memory (safe if storage is unavailable) ----
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const accessStore = {
  get: (id: string) => read<string | null>(`unlock:access:${id}`, null),
  set: (id: string, token: string) => write(`unlock:access:${id}`, token),
};

export interface MyListing {
  id: string;
  title: string;
  key: string;
  createdAt: number;
}
export const myListings = {
  all: () => read<MyListing[]>("unlock:mine", []),
  add: (l: MyListing) => write("unlock:mine", [l, ...myListings.all().filter((x) => x.id !== l.id)]),
};
