import "server-only";
import { VerifyError } from "./verify";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown, init?: ResponseInit) =>
  Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });

export function fail(error: unknown) {
  if (error instanceof HttpError) return ok({ error: error.message }, { status: error.status });
  if (error instanceof VerifyError) return ok({ error: error.message }, { status: 400 });
  console.error(error);
  const message = error instanceof Error ? error.message : "Something went wrong";
  return ok({ error: message }, { status: 500 });
}

export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
