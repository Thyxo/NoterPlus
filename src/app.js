/* =========================================================
   Noter+ — falsk Noter-app med Cryptext-forudsigelse
   Skallen (lister, editor, glas-design, hjemmeskærm) er fra notes-app.
   ========================================================= */
import { planName, planNumber, danishGroup, normalizeName, bestCase, applyCase } from './crypt.js';
import { createLink, cleanRoom, newRoomCode } from './link.js';
import {
  installFont, restoreFont, removeFont, isFontReady, loadedFontName,
  renderInk, renderGlyph, calibrate, LETTERS,
} from './font.js';
import { KNOWN_FONTS } from './known.js';

/* ---------------- tilstand ---------------- */

const storageKey = 'noterplus.v1';

const fallbackState = {
  source: 'name', // name | number | calc
  name: 'Lise',
  caseMode: 'best',
  number: '2100',
  capSearch: true,
  capNote: true,
  newNoteMode: 'ink', // ink = du taster navnet, det vises som håndskrift · capture = tilskueren skriver · plain
  inkLie: 'left', // up | left | right – liggende = skrevet på langs af skærmen
  showPrediction: true,
  nameExact: false, // navnet kom fra en håndskrift-note: brug præcis de store/små bogstaver
  noteTitle: 'Forudsigelse',
  noteText: '',
  noteWhen: 'yesterday',
  inkColor: 'auto',
  inkSize: '96',
  startSide: 'number',
  flipCorner: 'tr',
  flipStyle: 'instant',
  tellDot: true,
  letterRot: 'auto',
  preferDigits: false,
  manualMap: {},
  calib: null,
  room: '',
  force: null, // { digits, name, by, at }
  calcResult: null, // { value, at }
  selectedNote: 'prediction',
  userNotes: [],
  images: {},
};

let state = loadState();
let flipped = state.startSide === 'name';
let tapTimes = [];
let settingsOpenedAt = 0;
let link = null;
let linkStatus = 'off';

function loadState() {
  try {
    return { ...fallbackState, ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
  } catch {
    return { ...fallbackState };
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* fuld kvote — tricket virker stadig i hukommelsen */
  }
}

/* ---------------- forudsigelsen ---------------- */

function knownFont() {
  const name = loadedFontName().toLowerCase();
  return KNOWN_FONTS.find((k) => k.match.test(name)) || null;
}

function effectiveRot() {
  if (state.letterRot !== 'auto') return state.letterRot;
  return knownFont()?.letterRot || state.calib?.letterRot || 'rotated';
}

/** Bogstav → cifre: kendt tabel for fonten (eller kalibrering) + egne rettelser. */
function currentMap() {
  const rot = effectiveRot();
  const known = knownFont();
  const base = known && rot === known.letterRot ? known.map : state.calib?.auto?.[rot] || {};
  return { ...base, ...state.manualMap };
}

function planOptions() {
  const known = knownFont();
  return {
    font: isFontReady(),
    map: currentMap(),
    letterRot: effectiveRot(),
    preferDigits: state.preferDigits,
    caseMode: state.caseMode,
    scores: known?.scores || state.calib?.scores?.[effectiveRot()] || {},
  };
}

function currentPlan() {
  if (state.source === 'number') return planNumber(state.number);
  if (state.source === 'calc') return planNumber(state.calcResult?.value || '');
  return planName(state.name, { ...planOptions(), caseMode: state.nameExact ? 'asTyped' : state.caseMode });
}

/* Forcetallet sendes til lommeregneren, når navn eller tal ændres her */
let publishTimer = null;
// det der allerede er sendt (så åbning af appen ikke sender og nulstiller lommeregneren igen)
let lastSentKey = state.force && state.force.by === 'notes' ? `${state.force.digits}|${state.force.name}` : '';
function publishForce({ now = false } = {}) {
  if (state.source === 'calc') return;
  const plan = currentPlan();
  if (!plan.digits) return;
  const force = {
    digits: plan.digits,
    name: state.source === 'name' ? plan.name : null,
    by: 'notes',
    at: Date.now(),
  };
  // Samme navn og tal som sidst: send ikke igen (lommeregneren ville nulstille sin tæller)
  const key = `${force.digits}|${force.name}`;
  if (key === lastSentKey && !publishTimer) return;
  state.force = force;
  saveState();
  clearTimeout(publishTimer);
  const send = () => { publishTimer = null; lastSentKey = key; link?.publish({ force, cmap: cmapPayload() }); };
  if (now) send();
  else publishTimer = setTimeout(send, 500);
}

/* Lommeregneren kan selv regne et navn om til tal med samme tabel */
function cmapPayload() {
  const o = planOptions();
  return { font: o.font, map: o.map, scores: o.scores, preferDigits: o.preferDigits, caseMode: o.caseMode, at: Date.now() };
}

function setName(raw, exact = false) {
  const clean = normalizeName(raw);
  if (!clean) return;
  state.name = clean;
  state.nameExact = exact;
  state.source = 'name';
  saveState();
  publishForce({ now: true });
  renderAll();
}

/* ---------------- forbindelse ---------------- */

function onRemote(remote) {
  let changed = false;
  const f = remote.force;
  if (f && f.by !== 'notes' && f.at > (state.force?.at || 0)) {
    state.force = f;
    if (f.name) {
      state.source = 'name';
      state.name = f.name;
      state.nameExact = false;
    } else if (f.digits) {
      state.source = 'number';
      state.number = f.digits;
    }
    changed = true;
  }
  const r = remote.result;
  if (r && r.at > (state.calcResult?.at || 0)) {
    state.calcResult = r;
    changed = true;
  }
  // Serveren er startet forfra: send vores egen seneste værdi igen
  if (!f && state.force && state.force.by === 'notes') link?.publish({ force: state.force, cmap: cmapPayload() });
  // Navn fra lommeregneren: regnet med Noters egen tabel. Er tallet et andet, sendes rettelsen tilbage.
  if (changed && f && f.by !== 'notes' && f.name && state.source === 'name' && currentPlan().digits !== f.digits) {
    saveState();
    publishForce({ now: true });
  }
  if (changed) {
    saveState();
    renderAll();
    if (settingsSheet.classList.contains('open')) syncPanel();
  }
}

function startLink() {
  link?.close();
  link = null;
  const room = cleanRoom(state.room);
  if (room.length < 3) {
    linkStatus = 'off';
    syncLinkStatus();
    return;
  }
  link = createLink({
    room,
    storeKey: 'noterplus.pending',
    onState: onRemote,
    onStatus: (s) => {
      linkStatus = s;
      syncLinkStatus();
    },
  });
}

const STATUS_TEXT = { off: 'Ingen kode', connecting: 'Forbinder …', online: 'Forbundet', offline: 'Offline – sender senere' };
function syncLinkStatus() {
  const el = document.querySelector('#linkStatus');
  if (!el) return;
  el.textContent = STATUS_TEXT[linkStatus] || linkStatus;
  el.dataset.s = linkStatus;
  syncStatusLine();
}

/* ---------------- indhold ---------------- */

const folderGroups = [
  { rows: [['Alle iCloud', 31]] },
  {
    title: 'iCloud',
    rows: [
      ['Noter', 14],
      ['Familie', 8],
      ['Opskrifter', 5],
      ['Arbejde', 4],
      ['Nyligt slettet', 0],
    ],
  },
];

const groupOrder = [
  ['pinned', 'Fastgjort', true],
  ['today', 'I dag', false],
  ['yesterday', 'I går', false],
  ['week', 'Sidste 7 dage', false],
  ['month', 'Sidste 30 dage', false],
];

const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const two = (n) => String(n).padStart(2, '0');
const clock = (d) => `${two(d.getHours())}.${two(d.getMinutes())}`;

function daysAgo(n, h, m) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}

function listDate(d) {
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff <= 0) return clock(d);
  if (diff === 1) return 'i går';
  if (diff < 7) return DAYS[d.getDay()];
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function stampText(d) {
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff <= 0) return `I dag kl. ${clock(d)}`;
  if (diff === 1) return `I går kl. ${clock(d)}`;
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()} kl. ${clock(d)}`;
}

function groupFor(d) {
  const diff = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  return 'month';
}

function predictionDate() {
  if (state.noteWhen === 'today') return daysAgo(0, 7, 52);
  if (state.noteWhen === 'days') return daysAgo(3, 21, 17);
  return daysAgo(1, 22, 41);
}

function getNotes() {
  const pd = predictionDate();
  const notes = [
    state.showPrediction && {
      id: 'prediction',
      title: state.noteTitle || 'Forudsigelse',
      when: pd,
      preview: state.noteText || 'Håndskrift',
      group: 'pinned',
      ink: true,
      body: state.noteText ? [state.noteText] : [],
    },
    {
      id: 'shopping',
      title: 'Indkøb',
      when: daysAgo(0, 8, 14),
      preview: 'Rugbrød, mælk, æg',
      group: 'pinned',
      body: ['Rugbrød', 'Mælk (let)', 'Æg', 'Kaffe', 'Agurk + peberfrugt', 'Pålæg til drengenes madpakker', 'Opvasketabs', 'Pant – tag poserne med'],
    },
    {
      id: 'football',
      title: 'Fodbold – tider',
      when: daysAgo(1, 17, 3),
      preview: 'Tirsdag 16.30 Fælledparken',
      body: ['Tirsdag 16.30 Fælledparken', 'Torsdag 17.00 (hent kl. 18.30)', 'Lørdag kamp kl. 10 i Valby', '', 'Husk benskinner og vandflaske'],
    },
    {
      id: 'christmas',
      title: 'Julegaver 2026',
      when: daysAgo(2, 21, 48),
      preview: 'Mor: tørklæde',
      body: ['Mor: tørklæde (det grå fra Magasin)', 'Far: bog om København', 'Den store: høretelefoner', 'Den lille: nye fodboldstøvler str. 38', 'Hyggegaver til skoen 1.–24.'],
    },
    {
      id: 'winter',
      title: 'Vinterferie uge 7',
      when: daysAgo(4, 20, 11),
      preview: 'Sommerhus i Skagen?',
      body: ['Sommerhus i Skagen?', 'Alternativ: Lalandia', 'Spørg Mette om de vil med', '', 'Book senest 1. december'],
    },
    {
      id: 'recipe',
      title: 'Boller i karry',
      when: daysAgo(5, 18, 30),
      preview: '500 g hakket svinekød',
      body: ['500 g hakket svinekød', '1 løg', '1 æg', '3 spsk mel', '1 dl mælk', '', 'Karrysauce: smør, karry, mel, bouillon, fløde', 'Ris og agurkesalat ved siden af'],
    },
    {
      id: 'magic',
      title: 'Ideer til magi',
      when: daysAgo(6, 23, 5),
      preview: 'Lad dem vælge højt',
      body: ['Lad dem vælge højt.', 'Sæt farten ned lige før afsløringen.', 'Aldrig samme effekt to gange.'],
    },
    {
      id: 'codes',
      title: 'Cykelkælder',
      when: daysAgo(12, 9, 26),
      preview: 'Nøgle til kælderen hos viceværten',
      body: ['Nøgle til kælderen hos viceværten', 'Dæk til den lilles cykel: 24"', 'Lappegrej i skuffen'],
    },
  ].filter(Boolean);
  for (const u of state.userNotes) {
    if (u.ink) {
      // iOS bruger den genkendte håndskrift som titel
      notes.push({ id: u.id, title: applyCase(normalizeName(u.cased || ''), 'title') || 'Ny note', when: new Date(u.at), preview: 'Håndskrift', user: true, ink: true, inkUser: true });
      continue;
    }
    const lines = (u.text || '').split('\n');
    notes.push({
      id: u.id,
      title: lines[0] || 'Ny note',
      when: new Date(u.at),
      preview: lines.slice(1).find((l) => l.trim()) || 'Ingen yderligere tekst',
      user: true,
    });
  }
  for (const n of notes) {
    n.group = n.group || groupFor(n.when);
    n.date = listDate(n.when);
    n.stamp = stampText(n.when);
  }
  return notes.sort((a, b) => b.when - a.when);
}

/* ---------------- ikoner ---------------- */

const ICON = {
  chevronDown: '<path d="M5.6 9 12 15.4 18.4 9"/>',
  chevronRight: '<path d="M8.8 4.8 16 12l-7.2 7.2"/>',
  folder:
    '<path d="M3.4 7.4a2.1 2.1 0 0 1 2.1-2.1h3.2l2 2.2h8a2.1 2.1 0 0 1 2.1 2.1v8.9a2.1 2.1 0 0 1-2.1 2.1H5.5a2.1 2.1 0 0 1-2.1-2.1z" fill="currentColor" stroke="none"/>',
};

function svg(name, cls) {
  return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------- DOM ---------------- */

const $ = (s) => document.querySelector(s);
const app = $('#app');
const folderGroupsEl = $('#folderGroups');
const noteGroupsEl = $('#noteGroups');
const notePage = $('#notePage');
const navTitleEditor = $('#navTitleEditor');
const settingsSheet = $('#settingsSheet');
const scrim = $('#scrim');
const flipSpot = $('#flipSpot');
const imagePicker = $('#imagePicker');

/* ---------------- render ---------------- */

function renderFolders() {
  folderGroupsEl.innerHTML = folderGroups
    .map(
      (group) => `
      <section class="sec">
        ${group.title ? `<h2 class="sec-head"><span>${esc(group.title)}</span></h2>` : ''}
        <div class="card">
          ${group.rows
            .map(
              ([name, count]) => `
              <button class="row folder" type="button" data-open-notes="${esc(name)}">
                ${svg('folder', 'fi')}
                <span class="name">${esc(name)}</span>
                <span class="count">${count + (name === 'Noter' || name === 'Alle iCloud' ? state.userNotes.length : 0)}</span>
                ${svg('chevronRight', 'go')}
              </button>`,
            )
            .join('')}
        </div>
      </section>`,
    )
    .join('');
}

function renderNotes() {
  const notes = getNotes();
  noteGroupsEl.innerHTML = groupOrder
    .map(([id, label, collapsible]) => {
      const rows = notes.filter((note) => note.group === id);
      if (!rows.length) return '';
      return `
        <section class="sec" data-sec="${id}">
          <h2 class="sec-head">
            <span>${label}</span>
            ${collapsible ? `<button class="chev" type="button" data-collapse="${id}" aria-label="Skjul">${svg('chevronDown', 'sm')}</button>` : ''}
          </h2>
          <div class="card">
            ${rows
              .map(
                (note) => `
                <button class="row ${note.id === state.selectedNote ? 'selected' : ''}" type="button" data-note="${note.id}">
                  <h3>${esc(note.title)}</h3>
                  <div class="meta"><span>${esc(note.date)}</span><span class="prev">${esc(note.preview)}</span></div>
                </button>`,
              )
              .join('')}
          </div>
        </section>`;
    })
    .join('');
}

function inkColor() {
  if (state.inkColor !== 'auto') return state.inkColor;
  return getComputedStyle(document.documentElement).getPropertyValue('--note-text').trim() || '#fff';
}

function notePlan(note) {
  if (note?.inkUser) {
    const u = state.userNotes.find((x) => x.id === note.id);
    return planName(u?.cased || '', { ...planOptions(), caseMode: 'asTyped' });
  }
  return currentPlan();
}

const LIE = { up: 0, left: 90, right: -90 };

function drawPrediction(reveal = null) {
  const canvas = notePage.querySelector('canvas.ink');
  if (!canvas) return;
  const note = selectedNote();
  const plan = notePlan(note);
  const lying = state.inkLie !== 'up';
  // Liggende: teksten løber langs skærmens højde
  // Mens du taster, dækker tastaturet bunden: hold navnet i det synlige stykke
  const typing = document.activeElement === inkInput;
  const visible = (window.visualViewport?.height || window.innerHeight) - notePage.getBoundingClientRect().top - 40;
  const room = lying ? (typing ? Math.min(notePage.clientHeight - 150, visible) : notePage.clientHeight - 150) : notePage.clientWidth - 52;
  notePage.querySelector('.ink-note')?.classList.toggle('typing', typing);
  const size = (Number(state.inkSize) || 96) * (lying ? 1.35 : 1);
  const box = renderInk(canvas, plan.glyphs.length ? plan.glyphs : [{ ch: ' ', rot: 0 }], {
    size,
    maxWidth: Math.max(200, Math.min(room, 760)),
    color: inkColor(),
    reveal,
  });
  const wrap = canvas.parentElement;
  wrap.classList.toggle('lie', lying);
  wrap.style.height = lying ? `${Math.max(box.width, 120) + 24}px` : '';
  applyFlip(false);
}

function applyFlip(animate) {
  const canvas = notePage.querySelector('canvas.ink');
  if (canvas) {
    canvas.classList.toggle('spin', !!animate);
    const deg = (LIE[state.inkLie] || 0) + (flipped ? 180 : 0);
    canvas.style.transform = deg ? `rotate(${deg}deg)` : '';
  }
  syncFlipSpot();
}

function selectedNote() {
  const notes = getNotes();
  return notes.find((item) => item.id === state.selectedNote) || notes.find((n) => n.id === 'prediction') || notes[0];
}

function renderNotePage() {
  const note = selectedNote();
  navTitleEditor.textContent = note.user ? '' : note.title;

  let inner = '';
  if (note.inkUser) {
    notePage.innerHTML = `
      <div class="note-body ink-note">
        <div class="stamp">${esc(note.stamp)}</div>
        <div class="ink-wrap"><canvas class="ink" aria-label="Håndskrift"></canvas></div>
      </div>`;
    drawPrediction();
    notePage.scrollTop = 0;
    syncFlipSpot();
    return;
  }
  if (note.user) {
    const u = state.userNotes.find((x) => x.id === note.id);
    notePage.innerHTML = `
      <div class="note-body">
        <div class="stamp">${esc(note.stamp)}</div>
        <div class="note-edit" id="noteEdit" contenteditable="true" autocapitalize="sentences" spellcheck="false">${esc(u?.text || '').replace(/\n/g, '<br>')}</div>
      </div>`;
    notePage.scrollTop = 0;
    syncFlipSpot();
    return;
  }

  inner = (note.body || [])
    .map((line) => (line === '' ? '<p class="gap"></p>' : `<p>${esc(line)}</p>`))
    .join('');
  if (note.ink) inner += '<div class="ink-wrap"><canvas class="ink" aria-label="Håndskrift"></canvas></div>';

  const image = state.images && state.images[note.id];
  const imageTag = image ? `<img class="note-img" src="${image}" alt="" />` : '';

  notePage.innerHTML = `
    <div class="note-body note-page-fade">
      <div class="stamp">${esc(note.stamp || '')}</div>
      <h1 class="note-title">${esc(note.title)}</h1>
      ${inner}
      ${imageTag}
    </div>`;

  if (note.ink) drawPrediction();
  notePage.scrollTop = 0;
  syncScrolled(notePage);
  syncFlipSpot();
}

function renderAll() {
  renderFolders();
  renderNotes();
  renderNotePage();
}

/* ---------------- hurtig plet: vend tegningen ---------------- */

function syncFlipSpot() {
  const active = state.flipCorner !== 'off' && app.dataset.view === 'editor' && selectedNote()?.ink;
  flipSpot.dataset.corner = state.flipCorner;
  flipSpot.classList.toggle('on', !!active);
  $('#flipTell').classList.toggle('show', !!(active && state.tellDot && !flipped));
}

function flip() {
  flipped = !flipped;
  applyFlip(state.flipStyle === 'spin');
}

/* ---------------- navigation ---------------- */

function setView(view) {
  if (app.dataset.view === 'editor' && view !== 'editor') leaveEditor();
  app.dataset.view = view;
  syncFlipSpot();
}

function openNote(id) {
  state.selectedNote = id;
  saveState();
  if (id === 'prediction') flipped = state.startSide === 'name';
  else if (state.userNotes.find((x) => x.id === id)?.ink) flipped = true; // navnet op, som det blev skrevet
  renderNotes();
  renderNotePage();
  setView('editor');
}

/* Tilskuerens egen note: første linje bliver navnet, når de går ud af noten */
function leaveEditor() {
  const u = state.userNotes.find((x) => x.id === state.selectedNote);
  if (!u) return;
  if (u.ink) {
    inkInput.blur();
    if (!normalizeName(u.cased || '')) {
      state.userNotes = state.userNotes.filter((x) => x !== u);
      state.selectedNote = state.showPrediction ? 'prediction' : '';
    } else {
      u.done = true;
      setName(u.cased, true);
    }
    saveState();
    renderNotes();
    renderFolders();
    return;
  }
  const edit = $('#noteEdit');
  if (edit) u.text = editText(edit);
  if (!u.text.trim()) {
    state.userNotes = state.userNotes.filter((x) => x !== u);
    state.selectedNote = 'prediction';
  } else if (state.newNoteMode === 'capture') {
    const first = u.text.split('\n').find((l) => l.trim()) || '';
    if (normalizeName(first)) setName(first);
  }
  saveState();
  renderNotes();
  renderFolders();
}

function editText(el) {
  return el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function newNote() {
  const ink = state.newNoteMode === 'ink';
  // iOS viser kun tastaturet, hvis fokus sker direkte i trykket
  if (ink) { inkInput.value = ''; inkInput.focus(); }
  const u = ink ? { id: 'u' + Date.now(), ink: true, raw: '', cased: '', at: Date.now() } : { id: 'u' + Date.now(), text: '', at: Date.now() };
  state.userNotes.push(u);
  state.selectedNote = u.id;
  flipped = true;
  saveState();
  renderNotes();
  renderNotePage();
  setView('editor');
  if (!ink) $('#noteEdit')?.focus();
}

/* Send navnet fra håndskrift-noten til lommeregneren mens du taster (lidt forsinket),
   så det er fremme, selv hvis du går direkte til lommeregneren uden at trykke tilbage. */
function pushInkName(u, now) {
  const name = normalizeName(u?.cased || '');
  if (!name) return;
  state.name = name;
  state.nameExact = true;
  state.source = 'name';
  saveState();
  publishForce({ now });
}

/* Håndskrift-note: du taster navnet, det tegnes bogstav for bogstav.
   Hvert bogstav får sit store/lille bogstav, når det skrives, og ændres ikke bagefter. */
const inkInput = document.querySelector('#inkInput');
let inkAnim = null;

function onInkInput() {
  const u = state.userNotes.find((x) => x.id === state.selectedNote && x.ink && !x.done);
  if (!u) return;
  const raw = inkInput.value.slice(0, 28);
  const prev = u.cased || '';
  const clean = normalizeName(raw.replace(/\s+$/, '')) + (/\s$/.test(raw) && raw.trim() ? ' ' : '');
  let cased = '';
  if (state.caseMode === 'best' && isFontReady()) {
    const o = planOptions();
    const best = bestCase(clean.trimEnd(), o);
    // behold de bogstaver, der allerede er skrevet
    cased = [...best].map((c, i) => (i < prev.length && prev[i].toLowerCase() === c.toLowerCase() ? prev[i] : c)).join('');
  } else {
    cased = planName(clean, { ...planOptions() }).name;
  }
  if (/\s$/.test(clean)) cased += ' ';
  u.raw = raw;
  u.cased = cased;
  saveState();
  pushInkName(u, false);
  const grew = cased.trimEnd().length > prev.trimEnd().length;
  clearTimeout(inkAnim);
  if (grew) {
    const start = Date.now();
    const step = () => {
      const p = (Date.now() - start) / 320;
      drawPrediction(p < 1 ? { index: 0, p } : null);
      if (p < 1) inkAnim = setTimeout(step, 16);
    };
    step();
  } else {
    drawPrediction();
  }
  navTitleEditor.textContent = '';
}

/* ---------------- kollapsende store titler ---------------- */

function syncScrolled(scroller) {
  const screen = scroller.closest('.screen');
  if (!screen) return;
  screen.classList.toggle('scrolled', scroller.scrollTop > 34);
}

function attachScrollIndicator(scroller) {
  const bar = document.createElement('div');
  bar.className = 'sbar';
  scroller.parentElement.appendChild(bar);
  let hideTimer = null;
  return () => {
    const range = scroller.scrollHeight - scroller.clientHeight;
    if (range <= 0) return;
    const top = scroller.offsetTop + 4;
    const track = scroller.clientHeight - 4 - 84;
    const progress = Math.max(0, Math.min(1, scroller.scrollTop / range));
    bar.style.transform = `translate3d(0, ${top + progress * (track - bar.offsetHeight)}px, 0)`;
    bar.classList.add('on');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => bar.classList.remove('on'), 650);
  };
}

document.querySelectorAll('[data-scroll]').forEach((scroller) => {
  const indicate = attachScrollIndicator(scroller);
  scroller.addEventListener('scroll', () => { syncScrolled(scroller); indicate(); }, { passive: true });
});

/* ---------------- performer-ark ---------------- */

const fields = {
  sourceSelect: 'source', nameInput: 'name', caseSelect: 'caseMode', numberInput: 'number',
  capSearch: 'capSearch', newNoteMode: 'newNoteMode', inkLie: 'inkLie', showPrediction: 'showPrediction', noteTitle: 'noteTitle', noteText: 'noteText',
  noteWhen: 'noteWhen', inkColor: 'inkColor', inkSize: 'inkSize', startSide: 'startSide',
  flipCorner: 'flipCorner', flipStyle: 'flipStyle', tellDot: 'tellDot', letterRot: 'letterRot',
  preferDigits: 'preferDigits', roomInput: 'room',
};

function syncPanel() {
  for (const [id, key] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (!el || el === document.activeElement) continue;
    if (el.type === 'checkbox') el.checked = !!state[key];
    else el.value = state[key] ?? '';
  }
  // Uden font giver "Bedste" ingen mening; vis det kun med fonten
  $('#caseSelect').querySelector('[value="best"]')?.toggleAttribute('disabled', !isFontReady());
  document.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== state.source; });
  document.querySelectorAll('[data-font]').forEach((el) => { el.hidden = !isFontReady(); });
  $('#fontStatus').textContent = isFontReady()
    ? `${loadedFontName()}${knownFont() ? ' – kendt font, tabel klar' : state.calib ? ' – kalibreret' : ''}`
    : 'Ingen font – kun O I L Z E h S g B G t b';
  $('#lastResult').textContent = state.calcResult ? `${state.calcResult.value}${state.calcResult.forced ? ' (force)' : ''}` : '–';
  const homeSel = $('#homeModeSelect');
  homeSel.querySelector("[value='custom']").disabled = !fakeHome.hasCustom();
  homeSel.value = fakeHome.mode;
  syncLinkStatus();
  renderPreview();
  if (isFontReady()) renderGlyphGrid();
  fitViewport();
  $('#viewportDiag').textContent = `Skærm ${viewportInfo.screen} · inner ${viewportInfo.inner} · bruger ${viewportInfo.used}`;
}

function syncStatusLine() {
  const el = $('#statusLine');
  if (!el) return;
  const plan = currentPlan();
  const font = isFontReady() ? 'Font ✓' : 'Ingen font';
  const conn = linkStatus === 'online' ? 'Lommeregner ✓' : link ? 'Lommeregner …' : 'Ingen forbindelse';
  el.innerHTML = `<span>${esc(font)}</span><span>${esc(conn)}</span><span>Tal: <b>${esc(danishGroup(plan.digits) || '–')}</b></span>`;
}

function renderPreview() {
  const plan = currentPlan();
  $('#pvDigits').textContent = plan.digits ? danishGroup(plan.digits) : '–';
  const color = getComputedStyle(document.documentElement).getPropertyValue('--label').trim() || '#fff';
  const glyphs = plan.glyphs.length ? plan.glyphs : [{ ch: ' ', rot: 0 }];
  renderInk($('#pvNumber'), glyphs, { size: 54, maxWidth: 150, color });
  renderInk($('#pvName'), glyphs, { size: 54, maxWidth: 150, color });
  const warn = [...(plan.warnings || [])];
  if (state.source === 'calc' && !state.calcResult) warn.push('Intet resultat fra lommeregneren endnu.');
  if (state.source === 'name' && !isFontReady()) warn.push('Indlæs Cryptext-fonten for alle bogstaver.');
  $('#pvWarn').textContent = warn.join(' ');
  syncStatusLine();
}

function renderGlyphGrid() {
  const grid = $('#glyphGrid');
  const map = currentMap();
  const rot = effectiveRot() === 'rotated' ? 180 : 0;
  const scores = planOptions().scores;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--label').trim() || '#fff';
  if (grid.childElementCount !== LETTERS.length) {
    grid.innerHTML = LETTERS.map((L) => `
      <label class="gcell" data-l="${L}">
        <span class="gl">${L}</span><canvas></canvas>
        <input type="text" inputmode="numeric" maxlength="3" autocomplete="off" />
      </label>`).join('');
  }
  grid.querySelectorAll('.gcell').forEach((cell) => {
    const L = cell.dataset.l;
    renderGlyph(cell.querySelector('canvas'), L, rot, color);
    const input = cell.querySelector('input');
    if (input !== document.activeElement) input.value = map[L] || '';
    cell.classList.toggle('manual', L in state.manualMap);
    const s = scores[L];
    cell.classList.toggle('weak', s !== undefined && s < 0.45 && !(L in state.manualMap));
  });
}

function openSettings() {
  syncPanel();
  settingsOpenedAt = Date.now();
  settingsSheet.classList.add('open');
  settingsSheet.setAttribute('aria-hidden', 'false');
  scrim.classList.add('on');
}

function closeSettings() {
  document.activeElement?.blur?.();
  settingsSheet.classList.remove('open');
  settingsSheet.setAttribute('aria-hidden', 'true');
  scrim.classList.remove('on');
  renderAll();
}

function onPanelChange(e) {
  const el = e.target;
  if (el.closest('#glyphGrid')) {
    const L = el.closest('.gcell').dataset.l;
    const v = el.value.replace(/\D/g, '').slice(0, 3);
    if (v) state.manualMap[L] = v;
    else delete state.manualMap[L];
    saveState();
    renderPreview();
    if (e.type === 'change') { renderGlyphGrid(); publishForce(); renderNotePage(); }
    return;
  }
  const key = fields[el.id];
  if (!key) return;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (key === 'room') {
    if (e.type !== 'change') return;
    state.room = cleanRoom(value);
    el.value = state.room;
    saveState();
    startLink();
    lastSentKey = '';
    publishForce({ now: true });
    return;
  }
  if (state[key] === value) return;
  state[key] = value;
  if (key === 'name' || key === 'caseMode') state.nameExact = false;
  saveState();
  if (key === 'startSide') flipped = value === 'name';
  if (['source', 'name', 'caseMode', 'number', 'letterRot', 'preferDigits'].includes(key)) publishForce();
  if (['source', 'letterRot'].includes(key)) syncPanel();
  else renderPreview();
  if (key === 'letterRot' && isFontReady()) renderGlyphGrid();
  renderNotes();
  renderNotePage();
}

/* ---------------- font ---------------- */

async function afterFontLoaded() {
  if (!knownFont() && (!state.calib || state.calib.font !== loadedFontName())) {
    $('#fontStatus').textContent = 'Kalibrerer …';
    await new Promise((r) => setTimeout(r, 30));
    state.calib = calibrate();
    saveState();
  }
  publishForce({ now: true });
  renderAll();
  if (settingsSheet.classList.contains('open')) syncPanel();
}

/* ---------------- hemmelig adgang ---------------- */

function handleSecretTap() {
  const now = Date.now();
  tapTimes = [...tapTimes.filter((time) => now - time < 4000), now];
  if (tapTimes.length >= 3) {
    tapTimes = [];
    openSettings();
  }
}

/* Tilskueren skriver sit navn i søgefeltet: fanges ved Søg/Enter eller når feltet lukkes */
function captureSearch(input) {
  if (!state.capSearch) return;
  const text = input.value;
  if (normalizeName(text)) setName(text);
  window.setTimeout(() => {
    input.value = '';
    input.blur();
  }, 200);
}

/* ---------------- falsk hjemmeskærm (perform) ---------------- */

const fakeHome = window.FakeHome.init({
  appName: 'Noter',
  assets: 'home/',
  launchTarget: app,
  accent: '#dcb13d',
  accentText: '#000',
  storageKey: 'noterplus',
  dbName: 'noterplus-home',
  zIndex: 30,
  onNumber() {
    // Noten åbnes direkte på forudsigelsen
    state.selectedNote = 'prediction';
    flipped = state.startSide === 'name';
    saveState();
    renderAll();
    app.dataset.view = 'editor';
    syncFlipSpot();
  },
  onSecret: () => openSettings(),
  onPerformChange: syncPerformButton,
});

function syncPerformButton(performing = fakeHome.isPerforming()) {
  $('#performButton').textContent = performing ? 'Afslut perform' : 'Perform';
}

/* ---------------- billedvedhæftning ---------------- */

function attachImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      state.images = { ...state.images, [state.selectedNote]: canvas.toDataURL('image/jpeg', 0.72) };
      saveState();
      renderNotePage();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------- events ---------------- */

function registerEvents() {
  document.querySelectorAll('[data-secret]').forEach((zone) => zone.addEventListener('pointerup', handleSecretTap));

  $('#toFolders').addEventListener('click', () => setView('folders'));
  $('#toNotes').addEventListener('click', () => setView('notes'));

  folderGroupsEl.addEventListener('click', (event) => {
    if (!event.target.closest('[data-open-notes]')) return;
    setView('notes');
  });

  noteGroupsEl.addEventListener('click', (event) => {
    const collapse = event.target.closest('[data-collapse]');
    if (collapse) {
      collapse.closest('.sec').classList.toggle('collapsed');
      return;
    }
    const row = event.target.closest('[data-note]');
    if (row) openNote(row.dataset.note);
  });

  document.querySelectorAll('#newNoteButton, [data-new-note]').forEach((button) => {
    button.addEventListener('click', () => {
      if (app.dataset.view === 'editor') leaveEditor();
      newNote();
    });
  });

  inkInput.addEventListener('input', onInkInput);
  // Forlades appen (swipe hjem til lommeregneren): send med det samme
  const sendNow = () => {
    const u = state.userNotes.find((x) => x.id === state.selectedNote && x.ink);
    if (u) pushInkName(u, true);
    else if (publishTimer) publishForce({ now: true });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sendNow(); });
  window.addEventListener('pagehide', sendNow);
  inkInput.addEventListener('focus', () => setTimeout(() => drawPrediction(), 350));
  inkInput.addEventListener('blur', () => setTimeout(() => { if (selectedNote()?.ink) drawPrediction(); }, 350));
  inkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inkInput.blur(); } });
  // tryk på tegningen mens den skrives: fortsæt med at skrive
  notePage.addEventListener('click', () => {
    const u = state.userNotes.find((x) => x.id === state.selectedNote && x.ink && !x.done);
    if (u) { inkInput.value = u.raw || ''; inkInput.focus(); }
  });

  notePage.addEventListener('input', (e) => {
    if (e.target.id !== 'noteEdit') return;
    const u = state.userNotes.find((x) => x.id === state.selectedNote);
    if (u) { u.text = editText(e.target); saveState(); }
  });

  document.querySelectorAll('[data-secret-search]').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); captureSearch(input); }
    });
    input.addEventListener('blur', () => { if (input.value) captureSearch(input); });
  });

  // Hurtig plet: et kort tryk vender tegningen
  let spotDown = null;
  flipSpot.addEventListener('pointerdown', (e) => { spotDown = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  flipSpot.addEventListener('pointerup', (e) => {
    if (!spotDown) return;
    const moved = Math.hypot(e.clientX - spotDown.x, e.clientY - spotDown.y);
    if (moved < 12 && Date.now() - spotDown.t < 700) flip();
    spotDown = null;
  });

  settingsSheet.addEventListener('input', onPanelChange);
  settingsSheet.addEventListener('change', onPanelChange);
  $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('#roomNew').addEventListener('click', () => {
    state.room = newRoomCode();
    saveState();
    $('#roomInput').value = state.room;
    startLink();
    lastSentKey = '';
    publishForce({ now: true });
  });

  $('#clearUserNotes').addEventListener('click', () => {
    state.userNotes = [];
    if (state.selectedNote.startsWith('u')) state.selectedNote = 'prediction';
    saveState();
    renderAll();
  });

  $('#fontPick').addEventListener('click', () => $('#fontFile').click());
  $('#fontFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('#fontStatus').textContent = 'Indlæser …';
    try {
      await installFont(file);
      state.calib = null;
      await afterFontLoaded();
    } catch (err) {
      $('#fontStatus').textContent = 'Kunne ikke læse filen som en font';
      console.error(err);
    }
  });
  $('#recalibrate').addEventListener('click', async () => {
    state.calib = null;
    $('#fontStatus').textContent = 'Kalibrerer …';
    await new Promise((r) => setTimeout(r, 30));
    state.calib = calibrate();
    saveState();
    syncPanel();
    publishForce();
  });
  $('#fontRemove').addEventListener('click', async () => {
    await removeFont();
    state.calib = null;
    saveState();
    syncPanel();
    renderAll();
    publishForce();
  });

  scrim.addEventListener('click', () => {
    if (Date.now() - settingsOpenedAt > 400) closeSettings();
  });
  $('#saveSettings').addEventListener('click', closeSettings);
  $('#performButton').addEventListener('click', () => {
    const wasPerforming = fakeHome.isPerforming();
    fakeHome.setMode($('#homeModeSelect').value);
    closeSettings();
    if (wasPerforming) fakeHome.exit();
    else fakeHome.perform();
  });
  $('#homeModeSelect').addEventListener('change', (e) => fakeHome.setMode(e.target.value));
  $('#openHomeSetup').addEventListener('click', () => {
    closeSettings();
    fakeHome.openSetup({ onClose: openSettings });
  });

  $('#attachButton').addEventListener('click', () => imagePicker.click());
  imagePicker.addEventListener('change', () => {
    if (imagePicker.files && imagePicker.files[0]) attachImage(imagePicker.files[0]);
    imagePicker.value = '';
  });

  window.addEventListener('resize', () => { if (selectedNote()?.ink) drawPrediction(); });

  /* Løft bundlinjen når tastaturet vises */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let baseline = 0;
    const gap = () => Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const typing = () => document.activeElement?.matches?.('input, textarea, [contenteditable]') ?? false;
    const sync = () => {
      if (!typing()) baseline = gap();
      const lift = typing() ? Math.max(0, gap() - baseline) : 0;
      const kb = lift > 120 ? lift : 0;
      document.documentElement.style.setProperty('--kb', `${kb}px`);
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    document.addEventListener('focusin', () => window.setTimeout(sync, 0));
    document.addEventListener('focusout', () => window.setTimeout(sync, 0));
    sync();
  }
}

/* ---------------- vindueshøjde (iOS 26-PWA) ---------------- */

const lvhProbe = document.createElement('div');
lvhProbe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none';
document.body.appendChild(lvhProbe);
let viewportInfo = {};

function statusBarHeight(screenH) {
  if (screenH === 874 || screenH === 956) return 62;
  if (screenH === 852 || screenH === 932) return 59;
  return 47;
}

function fitViewport() {
  const vv = window.visualViewport;
  const candidates = {
    inner: window.innerHeight,
    client: document.documentElement.clientHeight,
    vv: vv ? Math.round(vv.height + vv.offsetTop) : 0,
    lvh: lvhProbe.offsetHeight,
  };
  let height = Math.max(...Object.values(candidates));
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const portrait = window.screen.height > window.screen.width;
  let full = 0;
  if (standalone && portrait) {
    full = window.screen.height - statusBarHeight(window.screen.height);
    const missing = full - height;
    if (missing > 20 && missing < 90) height = full;
  }
  document.documentElement.style.setProperty('--app-h', `${height}px`);
  viewportInfo = { ...candidates, screen: window.screen.height, full, used: height, standalone };
}

fitViewport();
['resize', 'orientationchange', 'pageshow', 'focusout'].forEach((type) =>
  window.addEventListener(type, () => window.setTimeout(fitViewport, type === 'focusout' ? 350 : 0)),
);
window.visualViewport?.addEventListener('resize', fitViewport);
document.addEventListener('visibilitychange', () => window.setTimeout(fitViewport, 100));

/* ---------------- start ---------------- */

registerEvents();
if (state.selectedNote === 'prediction') flipped = state.startSide === 'name';
renderAll();
startLink();
window.setTimeout(() => app.classList.remove('no-anim'), 60);
restoreFont().then((ok) => { if (ok) afterFontLoaded(); });
document.fonts?.ready?.then(() => { if (selectedNote()?.ink) drawPrediction(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// til test i browseren
window.__np = { get state() { return state; }, currentPlan, setName, flip, get flipped() { return flipped; }, calibrate };
