// Tiny isomorphic Nostr relay client (browser, Node 22+, Vercel functions).
// Uses the global WebSocket; crypto comes from nostr-tools.
import type { Event, Filter } from "nostr-tools";

export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://relay.snort.social",
  "wss://offchain.pub",
];

function open(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return reject(e);
    }
    const t = setTimeout(() => {
      ws.onopen = ws.onerror = null;
      try {
        ws.close();
      } catch {}
      reject(new Error(`${url}: timeout`));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(t);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`${url}: connection failed`));
    };
  });
}

const closeQuietly = (ws: WebSocket) => {
  ws.onmessage = ws.onerror = ws.onclose = null;
  try {
    ws.close();
  } catch {}
};

export interface QueryResult {
  events: Event[];
  /** Relays that answered (sent EOSE or at least one event). */
  relaysAnswered: string[];
  /** Relay URLs each event id was seen on. */
  seenOn: Record<string, string[]>;
}

/**
 * Ask every relay for `filter`, gather until each relay says EOSE (or timeout). Deduplicates by id.
 * Once the first relay has finished, slower relays get only `graceMs` more, so one dead relay
 * doesn't stall the lookup.
 */
export async function query(filter: Filter, { relays = RELAYS, timeoutMs = 5000, graceMs = 1500 } = {}): Promise<QueryResult> {
  const byId = new Map<string, Event>();
  const seenOn: Record<string, string[]> = {};
  const answered = new Set<string>();
  let releaseGrace: () => void = () => {};
  const grace = new Promise<void>((r) => (releaseGrace = r));
  let graceStarted = false;
  const firstDone = () => {
    if (graceStarted) return;
    graceStarted = true;
    setTimeout(releaseGrace, graceMs);
  };
  const all = Promise.all(
    relays.map(async (url) => {
      let ws: WebSocket;
      try {
        ws = await open(url, timeoutMs);
      } catch {
        return;
      }
      await new Promise<void>((resolve) => {
        const sub = Math.random().toString(36).slice(2, 10);
        const done = () => {
          clearTimeout(t);
          closeQuietly(ws);
          resolve();
        };
        const t = setTimeout(done, timeoutMs);
        ws.onmessage = (m) => {
          let msg: unknown[];
          try {
            msg = JSON.parse(String(m.data));
          } catch {
            return;
          }
          if (msg[1] !== sub) return;
          if (msg[0] === "EVENT" && msg[2] && typeof msg[2] === "object") {
            const ev = msg[2] as Event;
            answered.add(url);
            if (!byId.has(ev.id)) byId.set(ev.id, ev);
            (seenOn[ev.id] ??= []).includes(url) || seenOn[ev.id].push(url);
          } else if (msg[0] === "EOSE" || msg[0] === "CLOSED") {
            if (msg[0] === "EOSE") {
              answered.add(url);
              firstDone();
            }
            done();
          }
        };
        ws.onerror = ws.onclose = done;
        ws.send(JSON.stringify(["REQ", sub, filter]));
      });
    }),
  );
  await Promise.race([all, grace]);
  return { events: [...byId.values()], relaysAnswered: [...answered], seenOn };
}

export interface PublishResult {
  url: string;
  ok: boolean;
  message: string;
}

/** Publish a signed event to every relay; resolves with each relay's OK/failure. */
export async function publish(event: Event, { relays = RELAYS, timeoutMs = 6000 } = {}): Promise<PublishResult[]> {
  return Promise.all(
    relays.map(async (url): Promise<PublishResult> => {
      let ws: WebSocket;
      try {
        ws = await open(url, timeoutMs);
      } catch (e) {
        return { url, ok: false, message: (e as Error).message };
      }
      return new Promise((resolve) => {
        const finish = (ok: boolean, message: string) => {
          clearTimeout(t);
          closeQuietly(ws);
          resolve({ url, ok, message });
        };
        const t = setTimeout(() => finish(false, "timeout"), timeoutMs);
        ws.onmessage = (m) => {
          try {
            const msg = JSON.parse(String(m.data));
            if (msg[0] === "OK" && msg[1] === event.id) finish(Boolean(msg[2]), String(msg[3] ?? ""));
          } catch {}
        };
        ws.onerror = () => finish(false, "connection error");
        ws.send(JSON.stringify(["EVENT", event]));
      });
    }),
  );
}

/** Newest event per (pubkey, kind) — for replaceable kinds like 0 and 10011. */
export function latestPerAuthor(events: Event[]): Event[] {
  const best = new Map<string, Event>();
  for (const e of events) {
    const k = `${e.pubkey}:${e.kind}`;
    const cur = best.get(k);
    if (!cur || e.created_at > cur.created_at || (e.created_at === cur.created_at && e.id < cur.id)) best.set(k, e);
  }
  return [...best.values()];
}
