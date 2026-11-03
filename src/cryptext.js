// Ord → Cryptext-cifre. Ejes af Noter+, kopieres UÆNDRET til Calcplus og Stopwatchplus.
// Samme tabel og samme valg af store/små bogstaver som Noter+'s forudsigelse
// (Cryptext 2.5, bogstav-tegn drejet 180°). Store/små vælges pr. bogstav: tydeligst, og helst ikke 0.
// Noter+ tegner forudsigelsen med præcis det returnerede `name`, så tal og tegning altid passer.
// Bogstaver uden Cryptext-tegn (æ, ø, å, tal, tegn) springes over og listes i `unsupported`.

const STRONG = 'A8 B8 D0 E3 F1 G9 I1 L7 N4 O0 Q0 R21 S5 T1 V1 Y3 Z2 a0 b9 f8 g6 h4 i1 k71 l1 m41 n4 o0 q6 r1 s5 t7 u0 v1 y5 z2';
const WEAK = 'C0 H4 J1 K71 M41 P0 U0 W14 X4 c0 d9 e2 j1 p0 w14 x4';

export const CRYPTEXT = {};
export const CRYPTEXT_SCORE = {};
for (const [list, score] of [[STRONG, 0.9], [WEAK, 0.5]]) {
  for (const item of list.split(' ')) { CRYPTEXT[item[0]] = item.slice(1); CRYPTEXT_SCORE[item[0]] = score; }
}

const rate = (c) => CRYPTEXT_SCORE[c] ?? 0;

/**
 * @param {string} word
 * @returns {{ digits: string, name: string, unsupported: string[] }}
 *   digits: tallet som det læses (navnets sidste bogstav = første ciffer)
 *   name:   ordet med de valgte store/små bogstaver (kun understøttede tegn)
 */
export function wordToDigits(word) {
  const unsupported = [];
  const kept = [];
  for (const ch of String(word || '').normalize('NFC')) {
    if (ch === ' ' || ch === '-') { if (kept.length && kept[kept.length - 1] !== ' ') kept.push(' '); continue; }
    if (CRYPTEXT[ch.toUpperCase()] || CRYPTEXT[ch.toLowerCase()]) kept.push(ch);
    else if (!unsupported.includes(ch)) unsupported.push(ch);
  }
  while (kept[kept.length - 1] === ' ') kept.pop();
  const cased = kept.map((c) => {
    if (c === ' ') return c;
    const up = c.toUpperCase();
    const lo = c.toLowerCase();
    let ru = rate(up);
    let rl = rate(lo);
    // 0 ligner et o og kan ikke stå forrest i et tal: vælg den anden form, hvis den ikke er 0
    if (CRYPTEXT[up] === '0') ru -= 0.6;
    if (CRYPTEXT[lo] === '0') rl -= 0.6;
    if (ru === rl) return CRYPTEXT[c] ? c : (ru > 0 ? up : lo);
    return ru > rl ? up : lo;
  });
  const name = cased.join('');
  const digits = [...name].reverse().map((c) => CRYPTEXT[c] || '').join('');
  return { digits, name, unsupported };
}

/** Til test: læs cifrene tilbage som det ord, de ligner vendt (første mulige bogstav pr. ciffer-gruppe). */
export function digitsToWord(digits) {
  const byDigits = {};
  for (const [ch, d] of Object.entries(CRYPTEXT)) if (!byDigits[d] || CRYPTEXT_SCORE[ch] > CRYPTEXT_SCORE[byDigits[d]]) byDigits[d] = ch;
  const out = [];
  let s = String(digits || '').replace(/\D/g, '');
  while (s) {
    const two = s.slice(0, 2);
    if (s.length > 1 && byDigits[two]) { out.push(byDigits[two]); s = s.slice(2); }
    else { out.push(byDigits[s[0]] || '?'); s = s.slice(1); }
  }
  return out.reverse().join('');
}
