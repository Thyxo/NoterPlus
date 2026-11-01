// Forbindelse mellem magi-apps via relæet på Railway (samme fil i Noter+ og Lommeregneren).
// Ret her og kopiér filen til Calcplus/src/.
//
// Et "rum" er en kort kode, som skrives ind i begge apps. Rummet har ét lille JSON-objekt.
// Hver app skriver sine egne felter (fx force, result) med et tidsstempel "at", og lytter
// efter de andres. iOS sætter hjemmeskærm-apps på pause i baggrunden, så appen henter
// altid den seneste tilstand, når den kommer frem igen.

export const RELAY = 'https://relay-production-03f5.up.railway.app';

export function cleanRoom(code) {
  return String(code || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
}

export function newRoomCode() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/**
 * @param {object} o
 * @param {string} o.room        rum-kode (min. 3 tegn); tom = ingen forbindelse
 * @param {(state: object) => void} o.onState  kaldes med hele rummets tilstand
 * @param {(status: string) => void} [o.onStatus] 'off' | 'connecting' | 'online' | 'offline'
 * @param {string} [o.relay]
 * @param {string} [o.storeKey]  localStorage-nøgle til ikke-sendte ændringer
 */
export function createLink({ room, onState, onStatus, relay = RELAY, storeKey = 'link.pending' }) {
  room = cleanRoom(room);
  let es = null;
  let status = 'off';
  let pending = {};
  let lastState = null;
  let closed = false;
  let retry = null;
  try { pending = JSON.parse(localStorage.getItem(storeKey + ':' + room) || '{}'); } catch { pending = {}; }

  const base = () => `${relay}/r/${room}`;
  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s); } };
  const savePending = () => { try { localStorage.setItem(storeKey + ':' + room, JSON.stringify(pending)); } catch { /* ok */ } };

  function handle(data) {
    if (!data || typeof data !== 'object' || !data.state) return;
    lastState = data.state;
    try { onState(data.state); } catch (e) { console.error(e); }
  }

  function connect() {
    if (closed || room.length < 3) { setStatus('off'); return; }
    if (es) es.close();
    setStatus('connecting');
    if (typeof EventSource === 'undefined') { refresh(); return; }
    es = new EventSource(base() + '/events');
    es.onopen = () => { setStatus('online'); flush(); };
    es.onmessage = (e) => {
      setStatus('online');
      try { handle(JSON.parse(e.data)); } catch { /* ignorer */ }
    };
    es.onerror = () => {
      setStatus(navigator.onLine === false ? 'offline' : 'connecting');
      // EventSource prøver selv igen; lukker den helt, starter vi forfra om lidt
      if (es && es.readyState === 2) {
        clearTimeout(retry);
        retry = setTimeout(connect, 4000);
      }
    };
  }

  async function refresh() {
    if (closed || room.length < 3) return;
    try {
      const r = await fetch(base(), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      handle(await r.json());
      if (!es || es.readyState !== 1) setStatus('online');
      await flush();
    } catch {
      setStatus('offline');
    }
  }

  async function flush() {
    if (closed || room.length < 3 || !Object.keys(pending).length) return;
    const sent = pending;
    try {
      // text/plain = "simpel" forespørgsel uden CORS-preflight (hurtigere på mobil)
      const r = await fetch(base(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(sent), keepalive: true });
      if (!r.ok) throw new Error(String(r.status));
      for (const k of Object.keys(sent)) if (pending[k] === sent[k]) delete pending[k];
      savePending();
      handle(await r.json());
    } catch {
      setStatus('offline');
    }
  }

  /** Skriv felter til rummet. Gemmes og sendes igen, hvis nettet er væk. */
  function publish(patch) {
    pending = { ...pending, ...patch };
    savePending();
    return flush();
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') { connect(); refresh(); } else if (es) { es.close(); es = null; }
  };
  const onOnline = () => { connect(); refresh(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  if (typeof window !== 'undefined') { window.addEventListener('online', onOnline); window.addEventListener('pageshow', onOnline); }

  connect();

  return {
    room,
    publish,
    refresh,
    get status() { return status; },
    get state() { return lastState; },
    close() {
      closed = true;
      clearTimeout(retry);
      if (es) es.close();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') { window.removeEventListener('online', onOnline); window.removeEventListener('pageshow', onOnline); }
      setStatus('off');
    },
  };
}
