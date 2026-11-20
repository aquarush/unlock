import "server-only";
import { Redis } from "@upstash/redis";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Minimal KV used by the app. Upstash Redis in production, a JSON file locally. */
interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  incrby(key: string, by: number): Promise<number>;
  lpush(key: string, value: unknown, cap?: number): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
}

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}
function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

class RedisKV implements KV {
  constructor(private r: Redis) {}
  async get<T>(key: string) {
    return (await this.r.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, opts: { ex?: number; nx?: boolean } = {}) {
    const args: any = {};
    if (opts.ex) args.ex = opts.ex;
    if (opts.nx) args.nx = true;
    const res = await this.r.set(key, value as any, args);
    return res === "OK";
  }
  async del(key: string) {
    await this.r.del(key);
  }
  incrby(key: string, by: number) {
    return this.r.incrby(key, by);
  }
  async lpush(key: string, value: unknown, cap = 500) {
    await this.r.lpush(key, value as any);
    await this.r.ltrim(key, 0, cap - 1);
  }
  async lrange<T>(key: string, start: number, stop: number) {
    return (await this.r.lrange<T>(key, start, stop)) ?? [];
  }
}

/** Local development store: persisted to .data/db.json. Not for serverless. */
class FileKV implements KV {
  private data: Record<string, { v: any; exp?: number }> | null = null;
  private file = path.join(process.cwd(), ".data", "db.json");
  private chain: Promise<unknown> = Promise.resolve();

  private async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {
      this.data = {};
    }
    return this.data!;
  }
  private async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data));
  }
  private op<T>(fn: (d: Record<string, { v: any; exp?: number }>) => T | Promise<T>, write = false): Promise<T> {
    const run = this.chain.then(async () => {
      const d = await this.load();
      const now = Date.now();
      for (const [k, e] of Object.entries(d)) if (e.exp && e.exp < now) delete d[k];
      const r = await fn(d);
      if (write) await this.save();
      return r;
    });
    this.chain = run.catch(() => {});
    return run;
  }
  get<T>(key: string) {
    return this.op((d) => (d[key] ? (structuredClone(d[key].v) as T) : null));
  }
  set(key: string, value: unknown, opts: { ex?: number; nx?: boolean } = {}) {
    return this.op((d) => {
      if (opts.nx && d[key]) return false;
      d[key] = { v: structuredClone(value), exp: opts.ex ? Date.now() + opts.ex * 1000 : undefined };
      return true;
    }, true);
  }
  del(key: string) {
    return this.op((d) => {
      delete d[key];
    }, true);
  }
  incrby(key: string, by: number) {
    return this.op((d) => {
      const v = Number(d[key]?.v ?? 0) + by;
      d[key] = { v };
      return v;
    }, true);
  }
  lpush(key: string, value: unknown, cap = 500) {
    return this.op((d) => {
      const list = (d[key]?.v as unknown[]) ?? [];
      list.unshift(structuredClone(value));
      d[key] = { v: list.slice(0, cap) };
    }, true);
  }
  lrange<T>(key: string, start: number, stop: number) {
    return this.op((d) => {
      const list = (d[key]?.v as T[]) ?? [];
      return structuredClone(list.slice(start, stop === -1 ? undefined : stop + 1));
    });
  }
}

let kv: KV | null = null;
export function db(): KV {
  kv ??= namespaced(rawDb());
  return kv;
}

/** On chipnet, prefix every key so test data never mixes with mainnet data in a shared database. */
function namespaced(inner: KV): KV {
  if (process.env.NEXT_PUBLIC_BCH_NETWORK !== "chipnet") return inner;
  const k = (key: string) => `chipnet:${key}`;
  return {
    get: (key) => inner.get(k(key)),
    set: (key, value, opts) => inner.set(k(key), value, opts),
    del: (key) => inner.del(k(key)),
    incrby: (key, by) => inner.incrby(k(key), by),
    lpush: (key, value, cap) => inner.lpush(k(key), value, cap),
    lrange: (key, start, stop) => inner.lrange(k(key), start, stop),
  };
}

function rawDb(): KV {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    return new RedisKV(new Redis({ url, token }));
  } else {
    if (process.env.VERCEL) {
      throw new Error("Database not configured: add Upstash Redis (UPSTASH_REDIS_REST_URL / _TOKEN) in Vercel.");
    }
    return new FileKV();
  }
}

/** Simple distributed lock (used to serialise NFT mints that share one minting baton). */
export async function withLock<T>(name: string, fn: () => Promise<T>, ttlSeconds = 45): Promise<T> {
  const key = `lock:${name}`;
  const owner = Math.random().toString(36).slice(2);
  const deadline = Date.now() + 40_000;
  while (!(await db().set(key, owner, { nx: true, ex: ttlSeconds }))) {
    if (Date.now() > deadline) throw new Error("Busy, please retry");
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  }
  try {
    return await fn();
  } finally {
    if ((await db().get<string>(key)) === owner) await db().del(key);
  }
}
