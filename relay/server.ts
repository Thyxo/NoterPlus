// Magic relay: en lille "postkasse" mellem mine magi-apps (Noter+, Lommeregner, Stopur …).
// Hvert rum (en kort kode) har ét lille JSON-objekt. Apps skriver felter med POST og
// lytter med Server-Sent Events. Alt ligger i hukommelsen; apps sender selv deres
// seneste tilstand igen, hvis serveren er startet forfra.
//
//   GET  /r/:rum          -> { rev, state }
//   POST /r/:rum          body { felt: værdi, ... }  (værdi null sletter feltet)
//   GET  /r/:rum/events   -> text/event-stream, sender { rev, state } ved hver ændring
//
// Et felt, der er et objekt med "at" (ms), overskrives kun af en nyere værdi.

type Room = { state: Record<string, unknown>; rev: number; touched: number; subs: Set<(s: string) => void> };

const rooms = new Map<string, Room>();
const MAX_BODY = 16_000;
const MAX_KEYS = 32;
const TTL = 7 * 24 * 3600_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    r = { state: {}, rev: 0, touched: Date.now(), subs: new Set() };
    rooms.set(id, r);
  }
  r.touched = Date.now();
  return r;
}

function sweep() {
  const now = Date.now();
  for (const [id, r] of rooms) if (!r.subs.size && now - r.touched > TTL) rooms.delete(id);
}

const atOf = (v: unknown) => (v && typeof v === 'object' && typeof (v as { at?: unknown }).at === 'number' ? (v as { at: number }).at : null);

function apply(r: Room, patch: Record<string, unknown>) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (!/^[a-zA-Z0-9_]{1,32}$/.test(k)) continue;
    if (v === null) {
      if (k in r.state) { delete r.state[k]; changed = true; }
      continue;
    }
    const oldAt = atOf(r.state[k]);
    const newAt = atOf(v);
    if (oldAt !== null && newAt !== null && newAt < oldAt) continue; // ældre end det vi har
    if (!(k in r.state) && Object.keys(r.state).length >= MAX_KEYS) continue;
    r.state[k] = v;
    changed = true;
  }
  if (changed) {
    r.rev++;
    const msg = `data: ${JSON.stringify({ rev: r.rev, state: r.state })}\n\n`;
    for (const send of r.subs) send(msg);
  }
}

function events(req: Request, r: Room) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(c) {
      const send = (s: string) => { try { c.enqueue(enc.encode(s)); } catch { cleanup(); } };
      send(`retry: 2000\n\ndata: ${JSON.stringify({ rev: r.rev, state: r.state })}\n\n`);
      r.subs.add(send);
      const ping = setInterval(() => send(': ping\n\n'), 15_000);
      cleanup = () => { clearInterval(ping); r.subs.delete(send); r.touched = Date.now(); };
      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, rooms: rooms.size });
  const m = url.pathname.match(/^\/r\/([a-zA-Z0-9-]{3,40})(\/events)?\/?$/);
  if (!m) return json({ error: 'not found' }, 404);
  const r = getRoom(m[1].toLowerCase());
  if (m[2]) return events(req, r);
  if (req.method === 'GET') return json({ rev: r.rev, state: r.state });
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too big' }, 413);
    let patch: unknown;
    try { patch = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json({ error: 'expected object' }, 400);
    apply(r, patch as Record<string, unknown>);
    if (Math.random() < 0.05) sweep();
    return json({ rev: r.rev, state: r.state });
  }
  return json({ error: 'method' }, 405);
}

Bun.serve({ port: Number(Bun.env.PORT || 3000), idleTimeout: 255, fetch: handle });
console.log('magic relay klar på port', Bun.env.PORT || 3000);
