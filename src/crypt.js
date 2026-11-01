// Cryptext-logik uden DOM: navn → de cifre, man ser, når tegningen står "tal-vejen op".
// Bruges af Noter+ og (samme fil) af Lommeregneren. Ret her og kopiér filen til Calcplus/src/.
//
// Tegningen beskrives i "tal-visning": tegnene står fra venstre mod højre, som man læser
// tallet. Drejes telefonen 180°, vendes rækkefølgen, og hvert tegn drejes – så læses navnet.

// Cifre, der vendt 180° ligner et bogstav (klassisk "lommeregner-ord" + Cryptext-skemaet).
// strong = læses tydeligt, weak = kan bruges, men ser mindre overbevisende ud.
export const DIGIT_FOR = {
  O: ['0', 'strong'], o: ['0', 'strong'], D: ['0', 'weak'],
  I: ['1', 'strong'], l: ['1', 'strong'], i: ['1', 'weak'],
  Z: ['2', 'strong'], z: ['2', 'strong'],
  E: ['3', 'strong'], e: ['3', 'weak'],
  h: ['4', 'strong'], H: ['4', 'weak'],
  S: ['5', 'strong'], s: ['5', 'strong'],
  g: ['6', 'strong'],
  L: ['7', 'strong'], t: ['7', 'strong'], T: ['7', 'weak'],
  B: ['8', 'strong'], A: ['8', 'weak'],
  b: ['9', 'strong'], G: ['9', 'strong'],
};

// Det et ciffer ligner, når det vendes (til forhåndsvisning)
export const LETTER_FOR = { 0: 'O', 1: 'I', 2: 'Z', 3: 'E', 4: 'h', 5: 'S', 6: 'g', 7: 'L', 8: 'B', 9: 'G' };

export const MAX_DIGITS = 16; // lommeregnerens grænse for et tal

/** Fjern æøå og accenter som Cryptext ikke har (æ→ae, ø→oe, å→aa), behold bogstaver og mellemrum. */
export function normalizeName(text) {
  return String(text || '')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/ø/g, 'oe').replace(/Ø/g, 'Oe')
    .replace(/å/g, 'aa').replace(/Å/g, 'Aa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/[^A-Za-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Skriv navnet med stort begyndelsesbogstav, KUN STORE eller som skrevet. */
export function applyCase(name, mode) {
  if (mode === 'upper') return name.toUpperCase();
  if (mode === 'lower') return name.toLowerCase();
  if (mode === 'title') return name.toLowerCase().replace(/(^|\s)([a-z])/g, (m, s, c) => s + c.toUpperCase());
  return name;
}

/**
 * Planlæg tegningen for et navn.
 * @param {string} name                  navnet (rå tekst)
 * @param {object} o
 * @param {boolean} o.font               er Cryptext-fonten indlæst?
 * @param {object}  o.map                bogstav → cifre (fra kalibreringen/egne rettelser)
 * @param {'rotated'|'upright'} o.letterRot hvordan fontens bogstav-tegn skal stå i tal-visning
 * @param {boolean} o.preferDigits       brug fontens tal-tegn for O I Z E h S g L t B b G
 * @param {string}  o.caseMode           'asTyped' | 'title' | 'upper' | 'lower'
 * @returns {{ name, glyphs: Array<{ch, rot, digit, src, weak}>, digits, reads, warnings: string[] }}
 */
export function planName(name, o = {}) {
  const { font = false, map = {}, letterRot = 'rotated', preferDigits = true, caseMode = 'asTyped', scores = {} } = o;
  let clean = applyCase(normalizeName(name), caseMode === 'best' ? 'asTyped' : caseMode);
  if (caseMode === 'best') clean = bestCase(clean, { font, map, preferDigits, scores });
  const chars = [...clean].reverse(); // tal-visning: sidste bogstav står først
  const glyphs = [];
  const unknown = new Set();
  const weak = new Set();
  for (const c of chars) {
    if (c === ' ') { glyphs.push({ ch: ' ', rot: 0, digit: '', src: 'space', weak: false }); continue; }
    const classic = DIGIT_FOR[c];
    const fontDigit = font && map[c] ? String(map[c]).replace(/\D/g, '') : '';
    if (classic && (!font || (preferDigits && classic[1] === 'strong'))) {
      glyphs.push({ ch: classic[0], rot: 0, digit: classic[0], src: 'digit', weak: classic[1] === 'weak' });
      if (classic[1] === 'weak') weak.add(c);
    } else if (fontDigit) {
      const isWeak = scores[c] !== undefined && scores[c] < 0.7;
      glyphs.push({ ch: c, rot: letterRot === 'rotated' ? 180 : 0, digit: fontDigit, src: 'font', weak: isWeak });
      if (isWeak) weak.add(c);
    } else if (classic) {
      glyphs.push({ ch: classic[0], rot: 0, digit: classic[0], src: 'digit', weak: true });
      weak.add(c);
    } else {
      glyphs.push({ ch: font ? c : '?', rot: font && letterRot === 'rotated' ? 180 : 0, digit: '?', src: 'none', weak: true });
      unknown.add(c);
    }
  }
  const digits = glyphs.map((g) => g.digit).join('');
  const warnings = [];
  if (!clean) warnings.push('Skriv et navn.');
  if (unknown.size) {
    warnings.push(font
      ? `Intet tal for: ${[...unknown].join(' ')} – ret det i bogstav-tabellen.`
      : `Uden Cryptext-fonten kan ${[...unknown].join(' ')} ikke laves. Brug O I L Z E h S g B G t b – eller indlæs fonten.`);
  }
  if (weak.size) warnings.push(`Svage bogstaver: ${[...weak].join(' ')} (læses mindre tydeligt vendt).`);
  if (digits.startsWith('0') && digits.length > 1) warnings.push('Tallet starter med 0 – lommeregneren viser ikke et foranstillet nul.');
  if (digits.replace(/\D/g, '').length > MAX_DIGITS) warnings.push(`Over ${MAX_DIGITS} cifre – lommeregneren kan ikke vise hele tallet.`);
  return { name: clean, glyphs, digits: digits.replace(/\?/g, ''), complete: !digits.includes('?') && !!clean, reads: clean, warnings };
}

// Vælg stort eller lille bogstav for hvert tegn ud fra hvilket der ligner et tal bedst
export function bestCase(text, { font = false, map = {}, preferDigits = false, scores = {} } = {}) {
  const rate = (c) => {
    const classic = DIGIT_FOR[c];
    if (classic && (!font || preferDigits)) return classic[1] === 'strong' ? 1 : 0.5;
    if (font && map[c]) return scores[c] ?? 0.6;
    return classic ? 0.4 : 0;
  };
  const digitOf = (c) => (font && map[c] ? String(map[c]) : DIGIT_FOR[c]?.[0] || '');
  const chars = [...text];
  const lastLetter = chars.map((c) => c !== ' ').lastIndexOf(true);
  return chars.map((c, i) => {
    const up = c.toUpperCase();
    const lo = c.toLowerCase();
    if (up === lo) return c;
    let ru = rate(up);
    let rl = rate(lo);
    // Navnets sidste bogstav bliver tallets første ciffer: undgå 0 dér
    if (i === lastLetter) {
      if (digitOf(up).startsWith('0')) ru -= 0.6;
      if (digitOf(lo).startsWith('0')) rl -= 0.6;
    }
    if (ru === rl) return c;
    return ru > rl ? up : lo;
  }).join('');
}

/** Tegningen for et rent tal (fast tal eller lommeregnerens resultat). */
export function planNumber(text) {
  const s = String(text || '').replace(/\./g, '').replace(/\s+/g, '');
  const glyphs = [...s].map((ch) => ({ ch, rot: 0, digit: /\d/.test(ch) ? ch : '', src: /\d/.test(ch) ? 'digit' : 'punct', weak: false }));
  return { glyphs, digits: s.replace(/\D/g, ''), reads: readUpsideDown(s), warnings: [] };
}

/** Hvad et tal (skrevet med almindelige cifre) ligner vendt 180°. */
export function readUpsideDown(digits) {
  return [...String(digits).replace(/\D/g, '')].reverse().map((d) => LETTER_FOR[d] || '?').join('');
}

/** Lommeregnerens visning af et heltal med dansk tusindtalsseparator (til forhåndsvisning). */
export function danishGroup(digits) {
  const d = String(digits).replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
