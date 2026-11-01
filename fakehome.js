/* FakeHome — falsk iPhone-hjemmeskærm som hemmelig tal-input.
 *
 * Selvstændigt modul uden afhængigheder: én <script>-fil, der selv laver sin
 * HTML og CSS. Tilskueren swiper side 1 → 2 → 3 og trykker på app-ikonet på
 * side 3. Ikonet under fingeren, når hvert swipe STARTER, er et ciffer:
 * swipe 1 = første ciffer, swipe 2 = andet ciffer (00 = 100).
 *
 *   <script src="fakehome.js"></script>
 *   const fakeHome = FakeHome.init({
 *     appName: "Noter",                       // app-ikonet på side 3
 *     assets: "home/",                         // indbyggede screenshots (false = kun egen)
 *     launchTarget: "#app",                    // appen der "åbner" ud af ikonet
 *     onNumber: (number) => { ... },           // tilskuerens tal, før appen åbnes
 *     onSecret: () => { ... },                 // 3 tryk på et tomt område
 *   });
 *   fakeHome.perform();      // vis hjemmeskærmen
 *   fakeHome.openSetup();    // opsætning af egen hjemmeskærm
 *
 * Se FAKEHOME.md for alle muligheder. */

(() => {
"use strict";

const VERSION = "1.1.0";

/* ---------------- indbygget hjemmeskærm ----------------
   Geometri i screenshot-pixels, målt på rigtige 1179×2556-screenshots på
   sort baggrund. En egen hjemmeskærm har samme form, men måles automatisk.
   rows/cols er ikonernes øverste/venstre kant. */
const BUILTIN = {
  W: 1179,
  H: 2556,
  bg: "#000000",
  pagesTop: 140,
  pagesH: 1900,
  dotsTop: 2050,
  dotsH: 80,
  dockTop: 2140,
  dockH: 416,
  icon: 225,
  cols: [58, 337, 618, 897],
  rows: [245, 524, 803, 1082, 1361, 1640],
  occupied: [
    ["1111", "1111", "1111", "1111", "1111", "1111"],
    ["1111", "1111", "1111", "1111", "1111", "1111"],
    ["1111", "1100", "0000", "1110", "1111", "1111"],
  ],
  notes: { page: 2, row: 3, col: 2 },
  files: {
    pages: ["page1.webp", "page2.webp", "page3.webp"],
    dots: ["dots1.png", "dots2.png", "dots3.png"],
    dock: "dock.webp",
    noter: "noter.png",
  },
};

const BG_TOL = 22; /* max kanalafvigelse fra baggrunden (tåler JPEG-støj) */
const DIFF_TOL = 48; /* forskel mellem to sider, der tæller som "ændret" */
const SPRING_RESPONSE = 0.28; /* sek. — lavere er hurtigere */
const SPRING_DAMPING = 1;
const WALL_COLORS = ["#000000", "#1c1c1e", "#0b1a33", "#10261b", "#2a0c14", "#1f1033"];
const EXPORT_TYPE = "fakehome-setup";

const supportsLinearEasing = window.CSS?.supports?.("animation-timing-function", "linear(0, 1)") ?? false;

/* ---------------- CSS ---------------- */

const CSS = `
.fh-home, .fh-setup { --fh-accent: #0a84ff; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.fh-home *, .fh-setup * { box-sizing: border-box; }
.fh-home {
  position: fixed; inset: 0 0 auto 0; height: var(--fh-h, 100%);
  display: none; overflow: hidden; touch-action: none;
  background: var(--fh-bg, #000);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.fh-home.on { display: block; }
/* Skaleres efter bredden og forankres i bunden: i en PWA starter
   visningsområdet ofte under statuslinjen, så toppen skæres af. */
.fh-stage { position: absolute; left: 0; bottom: 0; width: 100%; height: calc(100vw * var(--fh-ratio, 2.16794)); transform-origin: 50% 50%; }
.fh-stage img { display: block; pointer-events: none; -webkit-user-drag: none; }
.fh-pages { position: absolute; left: 0; width: 100%; top: var(--fh-pages-top); height: var(--fh-pages-h); }
.fh-track { display: flex; width: 300%; height: 100%; will-change: transform; }
.fh-track img { width: calc(100% / 3); height: 100%; }
.fh-press { position: absolute; border-radius: 23%; background: rgba(0,0,0,.42); opacity: 0; pointer-events: none; transition: opacity .22s ease; }
.fh-press.on { opacity: 1; transition: none; }
.fh-dots { position: absolute; left: 0; width: 100%; top: var(--fh-dots-top); height: var(--fh-dots-h); }
.fh-dots img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
.fh-dots img.on { opacity: 1; }
.fh-dock { position: absolute; left: 0; width: 100%; top: var(--fh-dock-top); height: var(--fh-dock-h); }
.fh-dock[hidden] { display: none; }
.fh-launch-icon { position: absolute; left: 0; z-index: 100; background: center / cover no-repeat; pointer-events: none; }

/* ---------- opsætning ---------- */
.fh-setup {
  --bg: #000; --card: #1c1c1e; --card2: #2c2c2e; --label: #fff; --label2: rgba(235,235,245,.6); --label3: rgba(235,235,245,.3);
  --sep: rgba(84,84,88,.6); --green: #30d158; --orange: #ff9f0a; --red: #ff453a;
  position: fixed; inset: 0 0 auto 0; height: var(--fh-h, 100%);
  display: flex; flex-direction: column; background: var(--bg); color: var(--label);
  transform: translate3d(0, 100%, 0); visibility: hidden;
  transition: transform .42s cubic-bezier(.2,.85,.25,1), visibility 0s .42s;
  -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none;
}
.fh-setup.open { transform: none; visibility: visible; transition: transform .42s cubic-bezier(.2,.85,.25,1); }
.fh-setup button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; }
.fh-setup [hidden] { display: none !important; }

.fh-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: calc(8px + env(safe-area-inset-top)) 8px 6px; min-height: 44px; }
.fh-nav { justify-self: start; display: flex; align-items: center; gap: 2px; height: 44px; padding: 0 8px; color: var(--fh-accent) !important; font-size: 17px !important; }
.fh-nav svg { width: 13px; height: 21px; }
.fh-title { font-size: 17px; font-weight: 600; letter-spacing: -.2px; }

.fh-progress { display: flex; gap: 6px; padding: 4px 20px 0; }
.fh-progress div { flex: 1; }
.fh-progress i { display: block; height: 4px; border-radius: 2px; background: var(--card2); overflow: hidden; position: relative; }
.fh-progress i::after { content: ""; position: absolute; inset: 0; background: var(--fh-accent); transform: scaleX(0); transform-origin: left; transition: transform .35s ease; }
.fh-progress .done i::after { transform: none; }
.fh-progress span { display: block; margin-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: .2px; color: var(--label3); text-transform: uppercase; transition: color .2s; }
.fh-progress .done span { color: var(--label2); }

.fh-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 18px 20px 24px; }
.fh-step { animation: fh-in .32s ease both; }
@keyframes fh-in { from { opacity: 0; transform: translate3d(0, 8px, 0); } }
.fh-h { margin: 0 0 6px; font-size: 28px; font-weight: 700; letter-spacing: -.4px; line-height: 1.15; }
.fh-p { margin: 0 0 18px; font-size: 16px; line-height: 1.4; color: var(--label2); }
.fh-p b { color: var(--label); font-weight: 600; }

.fh-hero { display: flex; justify-content: center; padding: 6px 0 22px; }
.fh-phone { width: 128px; aspect-ratio: 9 / 19.5; border-radius: 26px; padding: 5px; background: #2c2c2e; box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset, 0 18px 40px rgba(0,0,0,.6); }
.fh-phone-screen { position: relative; height: 100%; border-radius: 21px; background: var(--fh-wall, #000); transition: background .3s; overflow: hidden; display: grid; grid-template-columns: repeat(4, 1fr); align-content: start; gap: 9px 8px; padding: 30px 10px 0; }
.fh-phone-screen::before { content: ""; position: absolute; top: 6px; left: 50%; width: 34px; height: 10px; margin-left: -17px; border-radius: 6px; background: #000; }
.fh-phone-screen i { aspect-ratio: 1; border-radius: 6px; background: rgba(255,255,255,.88); }
.fh-phone-screen i:nth-child(3n) { background: rgba(255,214,10,.9); }
.fh-phone-screen i:nth-child(4n+1) { background: rgba(10,132,255,.9); }
.fh-phone-screen i:nth-child(5n) { background: rgba(48,209,88,.9); }
.fh-phone-dock { position: absolute; left: 6px; right: 6px; bottom: 6px; height: 30px; border-radius: 12px; background: rgba(255,255,255,.16); }

.fh-swatches { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin: 0 0 18px; }
.fh-swatch { position: relative; width: 100%; max-width: 46px; aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); transition: transform .15s; }
.fh-swatch:active { transform: scale(.92); }
.fh-swatch.on { box-shadow: inset 0 0 0 1px rgba(255,255,255,.22), 0 0 0 3px var(--bg), 0 0 0 5px var(--fh-accent); }
.fh-swatch-custom { overflow: hidden; background: conic-gradient(#ff453a, #ffd60a, #30d158, #64d2ff, #0a84ff, #bf5af2, #ff453a); }
.fh-swatch-custom input { position: absolute; inset: -10px; width: calc(100% + 20px); height: calc(100% + 20px); opacity: 0; cursor: pointer; }

.fh-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 52px; padding: 0 18px; border-radius: 14px; font-size: 17px !important; font-weight: 600; transition: opacity .15s, transform .15s; }
.fh-btn:active { transform: scale(.985); opacity: .8; }
.fh-btn svg { width: 20px; height: 20px; }
.fh-primary { background: var(--fh-accent) !important; color: var(--fh-on-accent, #fff) !important; }
.fh-primary:disabled { opacity: .35; transform: none; }
.fh-tinted { background: var(--card) !important; color: var(--fh-accent) !important; }
.fh-link { display: block; width: 100%; margin-top: 4px; padding: 12px; font-size: 15px !important; color: var(--fh-accent) !important; }

.fh-steps { counter-reset: fh; list-style: none; margin: 18px 0 0; padding: 0; border-radius: 14px; background: var(--card); }
.fh-steps li { counter-increment: fh; position: relative; display: flex; gap: 12px; align-items: flex-start; padding: 13px 16px; font-size: 15px; line-height: 1.38; color: var(--label2); }
.fh-steps li + li { box-shadow: inset 0 .5px 0 var(--sep); }
.fh-steps li::before { content: counter(fh); flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--card2); color: var(--label); font-size: 13px; font-weight: 700; }
.fh-steps b { color: var(--label); font-weight: 600; }

.fh-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
.fh-chips span { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 16px; background: var(--card); font-size: 13px; font-weight: 500; color: var(--label2); }
.fh-chips span::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--fh-accent); }

.fh-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.fh-slot { position: relative; aspect-ratio: 9 / 19.5; border-radius: 18px; overflow: hidden; background: var(--card) !important; box-shadow: inset 0 0 0 1.5px var(--card2); transition: transform .15s; }
.fh-slot:active { transform: scale(.97); }
.fh-slot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .25s; }
.fh-slot.filled img { opacity: 1; }
.fh-slot-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--fh-accent); font-size: 14px; font-weight: 600; }
.fh-slot-empty i { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--card2); }
.fh-slot-empty svg { width: 18px; height: 18px; }
.fh-slot.filled .fh-slot-empty { display: none; }
.fh-slot-tag { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: none; align-items: center; gap: 5px; padding: 4px 9px 4px 5px; border-radius: 12px; background: rgba(0,0,0,.66); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; }
.fh-slot-tag i { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--green); }
.fh-slot-tag svg { width: 10px; height: 10px; }
.fh-slot.filled .fh-slot-tag { display: inline-flex; }

.fh-status { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 14px; background: var(--card); margin-bottom: 16px; font-size: 15px; line-height: 1.38; }
.fh-status i { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--green); color: #000; }
.fh-status i svg { width: 14px; height: 14px; }
.fh-status.warn i { background: var(--orange); }
.fh-status.todo i { background: var(--fh-accent); color: var(--fh-on-accent, #fff); }
.fh-status.error i { background: var(--red); color: #fff; }
.fh-status b { display: block; font-size: 16px; font-weight: 600; margin-bottom: 2px; }
.fh-status span { color: var(--label2); }

.fh-previews { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fh-previews figure { margin: 0; }
.fh-previews canvas { display: block; width: 100%; border-radius: 18px; background: #000; box-shadow: 0 0 0 1px rgba(255,255,255,.1); }
.fh-previews figcaption { margin-top: 8px; text-align: center; font-size: 13px; color: var(--label2); }
.fh-previews figcaption b { display: block; color: var(--label); font-weight: 600; font-size: 14px; }
.fh-tap { position: relative; cursor: pointer; }
.fh-tap.pick canvas { box-shadow: 0 0 0 2px var(--fh-accent); animation: fh-pulse 1.6s ease-in-out infinite; }
@keyframes fh-pulse { 50% { box-shadow: 0 0 0 4px var(--fh-accent); } }

.fh-facts { display: grid; grid-template-columns: repeat(3, 1fr); margin: 18px 0 0; border-radius: 14px; background: var(--card); overflow: hidden; }
.fh-facts div { padding: 12px 10px; text-align: center; }
.fh-facts div + div { box-shadow: inset .5px 0 0 var(--sep); }
.fh-facts dt { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; color: var(--label3); }
.fh-facts dd { margin: 4px 0 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
.fh-facts dd i { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); }

.fh-current { display: flex; flex-direction: column; align-items: center; padding: 4px 0 22px; }
.fh-current canvas { width: 46%; border-radius: 20px; box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 18px 40px rgba(0,0,0,.6); }
.fh-badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 5px 11px; border-radius: 13px; background: rgba(48,209,88,.16); color: var(--green); font-size: 13px; font-weight: 600; }
.fh-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.fh-list { border-radius: 14px; background: var(--card); overflow: hidden; margin-top: 8px; }
.fh-row { display: flex !important; align-items: center; gap: 12px; width: 100%; min-height: 50px; padding: 0 16px !important; font-size: 17px !important; text-align: left; }
.fh-row { position: relative; }
.fh-row + .fh-row::before { content: ""; position: absolute; top: 0; left: 58px; right: 0; height: .5px; background: var(--sep); }
.fh-row span { flex: 1; }
.fh-row i { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--fh-accent); color: var(--fh-on-accent, #fff); }
.fh-row i svg { width: 17px; height: 17px; }
.fh-row.danger { color: var(--red) !important; }
.fh-row.danger i { background: var(--red); color: #fff; }
.fh-row-chev { width: 8px; height: 13px; color: var(--label3); }
.fh-note { margin: 10px 4px 0; font-size: 13px; line-height: 1.4; color: var(--label2); }

.fh-foot { padding: 10px 20px calc(10px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--bg) 18px); }

.fh-busy, .fh-wall { position: absolute; inset: 0; z-index: 5; display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: rgba(0,0,0,.82); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.fh-busy.on, .fh-wall.on { display: flex; animation: fh-fade .2s ease both; }
@keyframes fh-fade { from { opacity: 0; } }
.fh-spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid rgba(255,255,255,.18); border-top-color: #fff; animation: fh-spin .8s linear infinite; }
@keyframes fh-spin { to { transform: rotate(360deg); } }
.fh-busy p { margin: 16px 0 0; font-size: 15px; color: var(--label2); }
.fh-wall { padding: 24px 28px calc(24px + env(safe-area-inset-bottom)); gap: 10px; }
.fh-wall img { max-height: 52vh; max-width: 64vw; border-radius: 22px; box-shadow: 0 0 0 1px rgba(255,255,255,.25), 0 20px 50px rgba(0,0,0,.6); -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
.fh-wall p { margin: 12px 0 8px; font-size: 15px; line-height: 1.4; color: var(--label2); max-width: 320px; }
.fh-wall p b { color: var(--label); }
.fh-wall .fh-btn { max-width: 320px; }

.fh-toast { position: absolute; left: 50%; top: calc(58px + env(safe-area-inset-top)); z-index: 6; transform: translate3d(-50%, -16px, 0); opacity: 0; display: flex; align-items: center; gap: 8px; padding: 11px 16px; border-radius: 22px; background: rgba(60,60,64,.92); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); font-size: 15px; font-weight: 600; white-space: nowrap; pointer-events: none; transition: transform .3s cubic-bezier(.2,.85,.25,1), opacity .3s; }
.fh-toast.on { transform: translate3d(-50%, 0, 0); opacity: 1; }
.fh-toast svg { width: 16px; height: 16px; color: var(--green); }
.fh-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
`;

const ICONS = {
  back: '<svg viewBox="0 0 13 21" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2 2.5 10.5l8 8.5"/></svg>',
  plus: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 2v14M2 9h14"/></svg>',
  check: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 7.5 3 3 6-7"/></svg>',
  warn: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 2.5v5.5M7 11.2v.1"/></svg>',
  tap: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="7" cy="7" r="3.2"/></svg>',
  cross: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m3 3 8 8M11 3l-8 8"/></svg>',
  save: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5v10M6 8.5l4 4 4-4"/><path d="M3 13.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  share: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12.5V2.5M6.5 6 10 2.5 13.5 6"/><path d="M7 9H5.5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 14.5 9H13"/></svg>',
  import: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5v10M6 8.5l4 4 4-4"/><path d="M4 17.5h12"/></svg>',
  redo: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16.5 2.5v4h-4"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11a1.5 1.5 0 0 0 1.5 1.5h4.4a1.5 1.5 0 0 0 1.5-1.5l.8-11"/></svg>',
  edit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/></svg>',
  chev: '<svg class="fh-row-chev" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 1.5 5 5-5 5"/></svg>',
};

/* ---------------- hjælpere ---------------- */

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function statusBarHeight(screenH) {
  if (screenH === 874 || screenH === 956) return 62;
  if (screenH === 852 || screenH === 932) return 59;
  return 47;
}

/* iOS 26-PWA'er kan få et layout-vindue, der slutter ~60pt før skærmens bund.
   Brug den største kendte højde og i standalone den fulde skærm minus statuslinjen. */
let lvhProbe = null;
function screenHeight() {
  if (!lvhProbe) {
    lvhProbe = document.createElement("div");
    lvhProbe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none";
    document.body.appendChild(lvhProbe);
  }
  const vv = window.visualViewport;
  let height = Math.max(
    window.innerHeight,
    document.documentElement.clientHeight,
    vv ? Math.round(vv.height + vv.offsetTop) : 0,
    lvhProbe.offsetHeight,
  );
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (standalone && window.screen.height > window.screen.width) {
    const full = window.screen.height - statusBarHeight(window.screen.height);
    const missing = full - height;
    if (missing > 20 && missing < 90) height = full;
  }
  return height;
}

/* ---- analyse af screenshots ---- */

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Billedet kunne ikke læses"));
    };
    img.src = url;
  });
}

function drawToCanvas(img, width, height, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/* Grupperer tal: værdier tættere end tol bliver én gruppe */
function clusterValues(values, tol) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [];
  for (const value of sorted) {
    const last = groups[groups.length - 1];
    if (last && value - last.max <= tol) {
      last.sum += value;
      last.n += 1;
      last.max = value;
    } else groups.push({ sum: value, n: 1, max: value });
  }
  return groups.map((g) => ({ at: g.sum / g.n, n: g.n }));
}

/* Finder de sammenhængende ikoner (firkanter) i et område af en side */
function findIcons(mask, w, y0, y1, minSize, maxSize) {
  const seen = new Uint8Array(w * (y1 - y0));
  const stack = new Int32Array(w * (y1 - y0));
  const found = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const local = (y - y0) * w + x;
      if (seen[local] || !mask[y * w + x]) continue;
      let top = 0;
      stack[top++] = local;
      seen[local] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      while (top) {
        const p = stack[--top];
        const px = p % w;
        const py = (p - px) / w + y0;
        count += 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        /* mask-indeks = lokalt indeks + forskydning, da området er hele rækker */
        const shift = y0 * w;
        if (px > 0 && !seen[p - 1] && mask[p - 1 + shift]) {
          seen[p - 1] = 1;
          stack[top++] = p - 1;
        }
        if (px < w - 1 && !seen[p + 1] && mask[p + 1 + shift]) {
          seen[p + 1] = 1;
          stack[top++] = p + 1;
        }
        if (py > y0 && !seen[p - w] && mask[p - w + shift]) {
          seen[p - w] = 1;
          stack[top++] = p - w;
        }
        if (py < y1 - 1 && !seen[p + w] && mask[p + w + shift]) {
          seen[p + w] = 1;
          stack[top++] = p + w;
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const ratio = bw / bh;
      if (bw >= minSize && bw <= maxSize && ratio > 0.8 && ratio < 1.25 && count > bw * bh * 0.1) {
        found.push({ x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2, size: (bw + bh) / 2 });
      }
    }
  }
  return found;
}

/* Er et smalt bånd sidens prikker? Prikker er lige store, runde og står
   med samme afstand midt på skærmen — i modsætning til en ikon-tekst. */
function looksLikeDots(rowsMask, w, band) {
  const height = band.b - band.a;
  const center = (band.minX + band.maxX) / 2;
  if (Math.abs(center - w / 2) > 0.04 * w || band.maxX - band.minX > 0.3 * w) return false;
  const columns = new Uint8Array(w);
  for (let y = band.a; y < band.b; y += 1) {
    for (let x = band.minX; x <= band.maxX; x += 1) if (rowsMask[y * w + x]) columns[x] = 1;
  }
  const segments = [];
  for (let x = band.minX; x <= band.maxX + 1; x += 1) {
    if (columns[x] && (x === 0 || !columns[x - 1])) segments.push({ start: x });
    if (!columns[x] && x > 0 && columns[x - 1] && segments.length) segments[segments.length - 1].end = x;
  }
  if (segments.length < 2) return false;
  const widths = segments.map((s) => s.end - s.start);
  const median = [...widths].sort((a, b) => a - b)[widths.length >> 1];
  if (widths.some((v) => Math.abs(v - median) > Math.max(2, median * 0.4))) return false;
  if (median < height * 0.5 || median > height * 2) return false;
  const centers = segments.map((s) => (s.start + s.end) / 2);
  const gaps = centers.slice(1).map((c, i) => c - centers[i]);
  const gap = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  return gaps.every((g) => Math.abs(g - gap) <= Math.max(2, gap * 0.2));
}

/* Hovedanalysen. imgs = de tre screenshots (side 1, 2, 3).
   Returnerer geometri i screenshot-pixels + beskeder, eller kaster en fejl. */
function analyzeHomeScreens(imgs) {
  const W = imgs[0].naturalWidth;
  const H = imgs[0].naturalHeight;
  if (imgs.some((img) => img.naturalWidth !== W || img.naturalHeight !== H)) {
    throw new Error("De tre screenshots har ikke samme størrelse. Tag dem på samme telefon.");
  }
  if (W >= H) throw new Error("Tag screenshots med telefonen på højkant.");

  const scale = Math.min(1, 600 / W);
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  const pages = imgs.map((img) => drawToCanvas(img, w, h).getContext("2d").getImageData(0, 0, w, h).data);
  const warnings = [];

  /* 1. Baggrundsfarven = den klart hyppigste farve */
  const counts = new Map();
  for (const data of pages) {
    for (let i = 0; i < data.length; i += 8) {
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const topKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sum = [0, 0, 0];
  let n = 0;
  for (const data of pages) {
    for (let i = 0; i < data.length; i += 8) {
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      if (key !== topKey) continue;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      n += 1;
    }
  }
  const bg = sum.map((v) => v / n);

  /* 2. Masker: hvad er ikke baggrund, og hvad er forskelligt mellem siderne */
  const masks = pages.map((data) => {
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
      mask[p] =
        Math.abs(data[i] - bg[0]) > BG_TOL || Math.abs(data[i + 1] - bg[1]) > BG_TOL || Math.abs(data[i + 2] - bg[2]) > BG_TOL
          ? 1
          : 0;
    }
    return mask;
  });
  const union = new Uint8Array(w * h);
  const rowContent = new Int32Array(h);
  const rowVary = new Int32Array(h);
  const rowMinX = new Int32Array(h).fill(w);
  const rowMaxX = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (masks[0][p] || masks[1][p] || masks[2][p]) {
        union[p] = 1;
        rowContent[y] += 1;
        if (x < rowMinX[y]) rowMinX[y] = x;
        if (x > rowMaxX[y]) rowMaxX[y] = x;
      }
      const i = p * 4;
      for (let c = 0; c < 3; c += 1) {
        const v0 = pages[0][i + c];
        const v1 = pages[1][i + c];
        const v2 = pages[2][i + c];
        if (Math.max(v0, v1, v2) - Math.min(v0, v1, v2) > DIFF_TOL) {
          rowVary[y] += 1;
          break;
        }
      }
    }
  }

  /* Ensfarvet? Kanterne midt på skærmen må kun være baggrund */
  let edge = 0;
  let edgeHits = 0;
  for (let y = Math.round(h * 0.12); y < h * 0.78; y += 1) {
    for (const x of [1, 3, 5, w - 2, w - 4, w - 6]) {
      edge += 1;
      edgeHits += union[y * w + x];
    }
  }
  if (edgeHits / edge > 0.03) {
    throw new Error("Baggrunden ser ikke ensfarvet ud. Brug et helt ensfarvet baggrundsbillede (uden farveovergang) og tag screenshots igen.");
  }
  const luminance = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  if (luminance > 0.45) {
    warnings.push("Farven er lys. Statuslinjen i appen har altid hvid tekst, så en mørk farve ser mest ægte ud.");
  }

  /* 3. Vandrette bånd med indhold */
  const bands = [];
  for (let y = 0; y < h; y += 1) {
    if (rowContent[y] < 2) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.b <= 1) {
      last.b = y + 1;
    } else {
      bands.push({ a: y, b: y + 1, content: 0, vary: 0, minX: w, maxX: -1 });
    }
    const band = bands[bands.length - 1];
    band.content += rowContent[y];
    band.vary += rowVary[y];
    band.minX = Math.min(band.minX, rowMinX[y]);
    band.maxX = Math.max(band.maxX, rowMaxX[y]);
  }

  /* Statuslinjen: lave bånd helt i toppen, før første høje (ikon/widget) */
  let y0 = 0;
  for (const band of bands) {
    if (band.a > 0.08 * h || band.b - band.a >= 0.05 * h) break;
    y0 = band.b;
  }
  y0 = Math.min(h - 1, y0 + 1);

  /* Bunden: spring docken/søgefeltet over (ens på alle sider). Første bånd
     nedefra, der ændrer sig, er enten prikkerne eller nederste ikonrække. */
  let y1 = null;
  for (let i = bands.length - 1; i >= 0; i -= 1) {
    const band = bands[i];
    if (band.a < y0) break;
    if (band.vary <= band.content * 0.08) continue;
    if (band.b - band.a < 0.025 * h && looksLikeDots(union, w, band)) {
      const above = bands[i - 1];
      y1 = above && above.b > y0 ? Math.round((above.b + band.a) / 2) : band.a - 2;
    } else {
      const below = bands[i + 1];
      y1 = below ? Math.round((band.b + below.a) / 2) : Math.min(h, band.b + 2);
    }
    break;
  }
  if (y1 === null || y1 - y0 < h * 0.3) {
    throw new Error("Kunne ikke finde ikonerne. Er det tre forskellige sider af hjemmeskærmen?");
  }

  /* 4. Ikoner → gitter */
  const icons = masks.map((mask, page) =>
    findIcons(mask, w, y0, y1, w * 0.1, w * 0.3).map((icon) => ({ ...icon, page })),
  );
  const all = icons.flat();
  if (all.length < 4) throw new Error("Fandt for få app-ikoner. Har siderne apps (ikke kun widgets)?");
  const sizes = all.map((i) => i.size).sort((a, b) => a - b);
  const size = sizes[sizes.length >> 1];
  const good = all.filter((i) => Math.abs(i.size - size) <= size * 0.15);

  /* Kolonner: iPhone har altid 4, symmetrisk om midten */
  const colGroups = clusterValues(good.map((i) => i.x - w / 2), size / 3);
  let best = null;
  for (let d = size * 1.02; d <= size * 2; d += 0.25) {
    if (1.5 * d + size / 2 > w / 2) break;
    let err = 0;
    for (const g of colGroups) {
      const k = Math.max(0, Math.min(3, Math.round(g.at / d + 1.5)));
      err += g.n * (g.at - (k - 1.5) * d) ** 2;
    }
    if (!best || err < best.err - 1e-6) best = { err, d };
  }
  const colStep = best.d;

  /* Rækker: fast afstand; find afstand og forskydning der passer bedst */
  const rowGroups = clusterValues(good.map((i) => i.y), size / 3);
  let bestRow = null;
  for (let p = size * 1.02; p <= size * 2.2; p += 0.25) {
    const first = rowGroups[0].at;
    let err = 0;
    for (const g of rowGroups) {
      const k = Math.round((g.at - first) / p);
      err += g.n * (g.at - first - k * p) ** 2;
    }
    if (!bestRow || err < bestRow.err - 1e-6) bestRow = { err, p };
  }
  const rowStep = rowGroups.length > 1 ? bestRow.p : size * 1.24;
  /* Gennemsnitlig forskydning ud fra alle grupper */
  const firstGroup = rowGroups[0].at;
  let offset = 0;
  let weight = 0;
  for (const g of rowGroups) {
    const k = Math.round((g.at - firstGroup) / rowStep);
    offset += g.n * (g.at - k * rowStep);
    weight += g.n;
  }
  let firstCenter = offset / weight;
  while (firstCenter - rowStep - size / 2 >= y0) firstCenter -= rowStep;
  const rowCenters = [];
  for (let c = firstCenter; c + size / 2 <= y1 + 1; c += rowStep) rowCenters.push(c);
  if (rowCenters.length < 4) throw new Error("Fandt for få ikonrækker til cifrene.");
  const colCenters = [0, 1, 2, 3].map((k) => w / 2 + (k - 1.5) * colStep);

  /* Hvilke felter har et ikon (bruges til tryk-effekten) */
  const occupied = [0, 1, 2].map((page) =>
    rowCenters.map((cy) =>
      colCenters
        .map((cx) =>
          icons[page].some((i) => Math.abs(i.x - cx) < size * 0.3 && Math.abs(i.y - cy) < size * 0.3) ? "1" : "0",
        )
        .join(""),
    ),
  );

  if (Math.abs(H / W - window.screen.height / window.screen.width) > 0.03 && window.screen.width < window.screen.height) {
    warnings.push("Screenshots ser ud til at være fra en anden iPhone end denne. Tag dem på den telefon, du optræder med.");
  }

  const k = 1 / scale;
  return {
    geo: {
      W,
      H,
      bg: toHex(bg),
      pagesTop: Math.round(y0 * k),
      pagesH: Math.round((y1 - y0) * k),
      dotsTop: Math.round(y1 * k),
      dotsH: H - Math.round(y1 * k),
      icon: Math.round(size * k),
      cols: colCenters.map((c) => Math.round((c - size / 2) * k)),
      rows: rowCenters.map((c) => Math.round((c - size / 2) * k)),
      occupied,
      notes: null,
    },
    warnings,
  };
}


/* ---- digit-placering ---- */

/* Ciffer for et felt: de ni nederste i højre 3×3-blok (1–9) og 0 over
   midten af den. Regnes fra bunden, så det virker uanset antal rækker. */
function digitAt(geo, cell) {
  if (!cell) return undefined;
  const last = geo.rows.length - 1;
  const fromTop = cell.row - (last - 2);
  if (fromTop >= 0 && fromTop <= 2 && cell.col >= 1 && cell.col <= 3) return fromTop * 3 + cell.col;
  if (cell.row === last - 3 && cell.col === 2) return 0;
  return undefined;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Kunne ikke gemme billedet"))), "image/png"),
  );
}

async function blobFile(canvas) {
  const blob = await canvasBlob(canvas);
  return { type: blob.type, buf: await blob.arrayBuffer() };
}

function bufferToDataUrl(file) {
  const bytes = new Uint8Array(file.buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${file.type};base64,${btoa(binary)}`;
}

function dataUrlToBuffer(url) {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(url || "");
  if (!match) throw new Error("Ugyldig fil");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { type: match[1], buf: bytes.buffer };
}

function springSamples(from, to, velocity) {
  const k = (2 * Math.PI / SPRING_RESPONSE) ** 2;
  const c = (4 * Math.PI * SPRING_DAMPING) / SPRING_RESPONSE;
  const h = 1 / 960;
  const every = 8; /* 960 Hz-trin → én prøve pr. 8,3 ms */
  let x = from;
  let v = velocity * 1000;
  const samples = [x];
  for (let i = 1; i < 960 * 1.5; i += 1) {
    v += (-k * (x - to) - c * v) * h;
    x += v * h;
    if (i % every === 0) {
      samples.push(x);
      if (Math.abs(x - to) < 0.2 && Math.abs(v) < 6) break;
    }
  }
  samples.push(to);
  return { samples, duration: ((samples.length - 1) * every * 1000) / 960 };
}

function rubberBand(position, width) {
  const min = -2 * width;
  const band = (over) => (1 - 1 / ((over * 0.55) / width + 1)) * width;
  if (position > 0) return band(position);
  if (position < min) return min - band(min - position);
  return position;
}

function swipeVelocity(drag, releaseTime) {
  const samples = drag.samples;
  const last = samples[samples.length - 1];
  /* Holdt fingeren stille før den slap: ingen fart (som iOS) */
  if (releaseTime - last.t > 150) return 0;
  let first = samples[0];
  for (const sample of samples) {
    if (last.t - sample.t <= 100) {
      first = sample;
      break;
    }
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/* ================= instans ================= */

let instance = null;

function init(userOptions = {}) {
  if (instance) return instance;

  const options = {
    appName: "Noter",
    assets: "home/",
    launchTarget: null,
    onNumber: null,
    onSecret: null,
    onPerformChange: null,
    secretTaps: 3,
    accent: "#0a84ff",
    accentText: "#fff",
    zIndex: 30,
    setupZIndex: 1000,
    storageKey: "fakehome",
    dbName: null,
    ...userOptions,
  };
  const appName = esc(options.appName);
  const modeKey = `${options.storageKey}:mode`;
  const dbName = options.dbName || `${options.storageKey}-home`;

  if (!document.querySelector("style[data-fakehome]")) {
    const style = document.createElement("style");
    style.dataset.fakehome = VERSION;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ---------- hjemmeskærm-DOM ---------- */

  const home = document.createElement("div");
  home.className = "fh-home";
  home.setAttribute("aria-hidden", "true");
  home.style.zIndex = String(options.zIndex);
  home.innerHTML = `
    <div class="fh-stage">
      <div class="fh-pages">
        <div class="fh-track"><img alt="" draggable="false"><img alt="" draggable="false"><img alt="" draggable="false"></div>
        <div class="fh-press"></div>
      </div>
      <div class="fh-dots"><img alt="" draggable="false"><img alt="" draggable="false"><img alt="" draggable="false"></div>
      <img class="fh-dock" alt="" draggable="false">
    </div>`;
  document.body.appendChild(home);
  const stage = home.querySelector(".fh-stage");
  const track = home.querySelector(".fh-track");
  const press = home.querySelector(".fh-press");
  const dots = [...home.querySelectorAll(".fh-dots img")];
  const dock = home.querySelector(".fh-dock");

  const builtin = options.assets === false
    ? null
    : (() => {
        const base = String(options.assets).replace(/\/?$/, "/");
        const f = BUILTIN.files;
        return {
          ...BUILTIN,
          src: { pages: f.pages.map((n) => base + n), dots: f.dots.map((n) => base + n), dock: base + f.dock, noter: base + f.noter },
        };
      })();

  let geo = builtin;
  let custom = null;
  let objectUrls = [];
  let mode = "default";
  try {
    mode = localStorage.getItem(modeKey) === "custom" ? "custom" : "default";
  } catch {
    /* privat tilstand */
  }

  function fitHeight() {
    const h = `${screenHeight()}px`;
    home.style.setProperty("--fh-h", h);
    setupEl?.style.setProperty("--fh-h", h);
  }

  function applyGeo(next) {
    geo = next;
    if (!geo) return;
    const pct = (value, of) => `${(value / of) * 100}%`;
    const style = home.style;
    style.setProperty("--fh-ratio", String(geo.H / geo.W));
    style.setProperty("--fh-bg", geo.bg);
    style.setProperty("--fh-pages-top", pct(geo.pagesTop, geo.H));
    style.setProperty("--fh-pages-h", pct(geo.pagesH, geo.H));
    style.setProperty("--fh-dots-top", pct(geo.dotsTop, geo.H));
    style.setProperty("--fh-dots-h", pct(geo.dotsH, geo.H));
    track.querySelectorAll("img").forEach((img, i) => {
      if (img.getAttribute("src") !== geo.src.pages[i]) img.src = geo.src.pages[i];
    });
    dots.forEach((img, i) => {
      if (img.getAttribute("src") !== geo.src.dots[i]) img.src = geo.src.dots[i];
    });
    dock.hidden = !geo.src.dock;
    if (geo.src.dock) {
      if (dock.getAttribute("src") !== geo.src.dock) dock.src = geo.src.dock;
      style.setProperty("--fh-dock-top", pct(geo.dockTop, geo.H));
      style.setProperty("--fh-dock-h", pct(geo.dockH, geo.H));
    }
    press.style.width = pct(geo.icon, geo.W);
    press.style.height = pct(geo.icon, geo.pagesH);
  }

  function syncGeo() {
    applyGeo(mode === "custom" && custom ? custom : builtin || custom);
  }

  /* ---------- lager (IndexedDB) ---------- */

  function db(txMode, action) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB findes ikke"));
        return;
      }
      const open = indexedDB.open(dbName, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const conn = open.result;
        const tx = conn.transaction("kv", txMode);
        const request = action(tx.objectStore("kv"));
        tx.oncomplete = () => {
          conn.close();
          resolve(request ? request.result : undefined);
        };
        tx.onerror = tx.onabort = () => {
          conn.close();
          reject(tx.error);
        };
      };
    });
  }

  /* Billeder gemmes som ArrayBuffer — sikrere end Blob i ældre Safari */
  function recordToGeo(record) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    const url = (file) => {
      const objectUrl = URL.createObjectURL(new Blob([file.buf], { type: file.type }));
      objectUrls.push(objectUrl);
      return objectUrl;
    };
    return {
      ...record.geo,
      src: { pages: record.files.pages.map(url), dots: record.files.bottoms.map(url), dock: null, noter: url(record.files.noter) },
    };
  }

  let savedRecord = null;

  async function storeRecord(record) {
    await db("readwrite", (store) => store.put(record, "custom"));
    savedRecord = record;
    custom = recordToGeo(record);
    setMode("custom");
  }

  const ready = (async () => {
    try {
      savedRecord = (await db("readonly", (store) => store.get("custom"))) || null;
      custom = savedRecord ? recordToGeo(savedRecord) : null;
    } catch {
      custom = null;
    }
    syncGeo();
  })();

  function setMode(next) {
    mode = next === "custom" && custom ? "custom" : "default";
    try {
      localStorage.setItem(modeKey, mode);
    } catch {
      /* ignoreres */
    }
    syncGeo();
  }

  /* ---------- perform: swipe-motor ---------- */

  let page = 0;
  let digits = [null, null];
  let drag = null;
  let offset = 0;
  let anim = null;
  let tapTimes = [];

  const scale = () => stage.getBoundingClientRect().width / geo.W;

  function cellAt(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const { W, cols, rows, icon } = geo;
    const k = rect.width / W;
    const x = (clientX - rect.left) / k;
    const y = (clientY - rect.top) / k;
    const colHalf = (cols[1] - cols[0]) / 2;
    const rowHalf = (rows[1] - rows[0]) / 2;
    const col = cols.findIndex((left) => Math.abs(x - (left + icon / 2)) <= colHalf);
    const row = rows.findIndex((top) => Math.abs(y - (top + icon / 2)) <= rowHalf);
    if (col < 0 || row < 0) return null;
    return { row, col };
  }

  function renderOffset(px) {
    offset = px;
    track.style.transform = `translate3d(${px}px, 0, 0)`;
  }

  const readOffset = () => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
  /* Aktuel position, også midt i en animation (så man kan gribe siden) */
  const currentOffset = () => (anim ? readOffset() : offset);

  function stopAnim() {
    if (!anim) return;
    const now = readOffset();
    anim.stop();
    anim = null;
    renderOffset(now);
  }

  /* Fjederen (UIKit-stil, uden bounce) regnes ud på forhånd og afspilles som en
     compositor-animation med linear()-easing, så den kører i fuld billedfrekvens. */
  function animateTo(to, velocity) {
    stopAnim();
    track.style.transition = "none";
    const from = offset;
    if (Math.abs(to - from) < 0.5) {
      renderOffset(to);
      return;
    }
    const { samples, duration } = springSamples(from, to, velocity);

    if (supportsLinearEasing && track.animate) {
      const points = samples.map((x) => ((x - from) / (to - from)).toFixed(4)).join(", ");
      renderOffset(to);
      const animation = track.animate(
        [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${to}px, 0, 0)` }],
        { duration, easing: `linear(${points})` },
      );
      const entry = { stop: () => animation.cancel() };
      anim = entry;
      animation.onfinish = () => {
        if (anim === entry) anim = null;
      };
      return;
    }

    /* Reserve uden linear(): afspil prøverne med rAF, og land på målet hvis rAF ikke fyrer */
    const start = performance.now();
    let raf = 0;
    let alive = true;
    const step = (now) => {
      if (!alive) return;
      const i = Math.min(samples.length - 1, Math.floor(((now - start) / duration) * (samples.length - 1)));
      renderOffset(samples[i]);
      if (i >= samples.length - 1) {
        alive = false;
        anim = null;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const fallback = window.setTimeout(() => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      renderOffset(to);
      anim = null;
    }, duration + 300);
    anim = {
      stop() {
        alive = false;
        cancelAnimationFrame(raf);
        window.clearTimeout(fallback);
      },
    };
  }

  const setDot = (index) => dots.forEach((dot, i) => dot.classList.toggle("on", i === index));

  function showPress(cell) {
    if (!cell || geo.occupied[page]?.[cell.row]?.[cell.col] !== "1") return;
    press.style.left = `${(geo.cols[cell.col] / geo.W) * 100}%`;
    press.style.top = `${((geo.rows[cell.row] - geo.pagesTop) / geo.pagesH) * 100}%`;
    press.classList.add("on");
  }

  function secretTap() {
    const now = Date.now();
    tapTimes = [...tapTimes.filter((time) => now - time < 4000), now];
    if (tapTimes.length >= options.secretTaps) {
      tapTimes = [];
      options.onSecret?.();
    }
  }

  function pointerDown(event) {
    if (drag || !event.isPrimary) return;
    const cell = cellAt(event.clientX, event.clientY);
    const width = stage.getBoundingClientRect().width;
    /* Grib siden hvor den er, også midt i en animation — intet hop */
    const grabbed = currentOffset();
    stopAnim();
    track.style.transition = "none";
    renderOffset(grabbed);
    const startPage = Math.max(0, Math.min(2, Math.round(-grabbed / width)));
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: grabbed,
      startPage,
      samples: [{ x: event.clientX, t: event.timeStamp }],
      lock: null,
      width,
      digit: digitAt(geo, cell),
    };
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* swipet virker også uden capture */
    }
    page = startPage;
    showPress(cell);
  }

  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.lock && Math.hypot(dx, dy) > 8) {
      drag.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      press.classList.remove("on");
    }
    if (drag.lock !== "x") return;
    drag.samples.push({ x: event.clientX, t: event.timeStamp });
    if (drag.samples.length > 12) drag.samples.shift();
    const position = rubberBand(drag.startOffset + dx, drag.width);
    renderOffset(position);
    setDot(Math.max(0, Math.min(2, Math.round(-position / drag.width))));
  }

  function pointerUp(event) {
    const d = drag;
    if (!d || event.pointerId !== d.id) return;
    drag = null;
    press.classList.remove("on");

    if (d.lock === "x") {
      if (event.clientX !== d.samples[d.samples.length - 1].x) d.samples.push({ x: event.clientX, t: event.timeStamp });
      const velocity = swipeVelocity(d, event.timeStamp);
      const nearest = Math.round(-offset / d.width);
      let target = nearest;
      if (velocity < -0.3) target = Math.floor(-offset / d.width) + 1;
      else if (velocity > 0.3) target = Math.ceil(-offset / d.width) - 1;
      target = Math.max(0, Math.min(2, Math.max(d.startPage - 1, Math.min(d.startPage + 1, target))));
      /* Swipe fremad fra side 1 eller 2 registrerer cifret under fingeren */
      if (target === d.startPage + 1 && d.startPage < 2) digits[d.startPage] = d.digit ?? null;
      page = target;
      setDot(page);
      animateTo(-page * d.width, velocity);
      return;
    }

    /* Grebet midt i en animation og sluppet uden swipe: land på nærmeste side */
    if (Math.abs(offset + d.startPage * d.width) > 0.5) {
      page = d.startPage;
      setDot(page);
      animateTo(-page * d.width, 0);
      return;
    }

    if (d.lock === null && event.type === "pointerup") {
      const cell = cellAt(event.clientX, event.clientY);
      /* Tomme områder (over/under ikon-gridet, ikke docken) tæller med i de hemmelige tryk */
      const stageTop = stage.getBoundingClientRect().top;
      if (!cell && event.clientY - stageTop < (geo.dockTop ?? geo.dotsTop) * scale()) secretTap();
      const target = geo.notes;
      if (cell && page === target.page && cell.row === target.row && cell.col === target.col) launch();
    }
  }

  function pointerCancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const width = drag.width;
    drag = null;
    press.classList.remove("on");
    setDot(page);
    animateTo(-page * width, 0);
  }

  stage.addEventListener("pointerdown", pointerDown);
  stage.addEventListener("pointermove", pointerMove);
  stage.addEventListener("pointerup", pointerUp);
  stage.addEventListener("pointercancel", pointerCancel);
  home.addEventListener("contextmenu", (event) => event.preventDefault());

  function currentNumber() {
    const [first, second] = digits;
    let number = null;
    if (first !== null && second !== null) number = first * 10 + second;
    else if (first !== null) number = first;
    else if (second !== null) number = second;
    if (number === 0 && first !== null && second !== null) number = 100;
    return number >= 1 && number <= 100 ? number : null;
  }

  function resolveTarget() {
    const target = typeof options.launchTarget === "function" ? options.launchTarget() : options.launchTarget;
    return typeof target === "string" ? document.querySelector(target) : target;
  }

  /* Appen vokser ud af ikonet: et kvadrat midt i appen skaleres ned, så det
     dækker ikonet præcist, og animeres op til fuld skærm. */
  function launch() {
    options.onNumber?.(currentNumber(), [...digits]);
    const app = resolveTarget();
    const ease = "cubic-bezier(0.2, 0.85, 0.25, 1)";
    if (!app) {
      stage.style.transition = `opacity 300ms ${ease}`;
      stage.style.opacity = "0";
      window.setTimeout(exit, 320);
      return;
    }

    const W = window.innerWidth;
    const H = app.offsetHeight;
    const k = scale();
    const stageRect = stage.getBoundingClientRect();
    const size = geo.icon * k;
    const iconLeft = stageRect.left + geo.cols[geo.notes.col] * k;
    const iconTop = stageRect.top + geo.rows[geo.notes.row] * k;
    const s = size / W;
    const a = (H - W) / 2;
    const radius = (size * 0.23) / s;

    const icon = document.createElement("div");
    icon.className = "fh-launch-icon";
    icon.style.backgroundImage = `url("${geo.src.noter}")`;
    icon.style.top = `${a}px`;
    icon.style.width = `${W}px`;
    icon.style.height = `${W}px`;
    app.appendChild(icon);

    const savedZ = app.style.zIndex;
    app.style.zIndex = String(options.zIndex + 1);
    app.style.transition = "none";
    app.style.transformOrigin = "0 0";
    app.style.transform = `translate3d(${iconLeft}px, ${iconTop - a * s}px, 0) scale(${s})`;
    app.style.clipPath = `inset(${a}px 0 ${H - a - W}px 0 round ${radius}px)`;
    app.style.webkitClipPath = app.style.clipPath;
    app.getBoundingClientRect();

    app.style.transition = `transform 520ms ${ease}, clip-path 520ms ${ease}, -webkit-clip-path 520ms ${ease}`;
    app.style.transform = "translate3d(0, 0, 0) scale(1)";
    app.style.clipPath = "inset(0 0 0 0 round 0px)";
    app.style.webkitClipPath = app.style.clipPath;

    icon.style.transition = "opacity 200ms ease-out";
    icon.getBoundingClientRect();
    icon.style.opacity = "0";

    stage.style.transition = `transform 520ms ${ease}, opacity 520ms ease`;
    stage.style.transform = "scale(1.12)";
    stage.style.opacity = "0.4";

    window.setTimeout(() => {
      icon.remove();
      app.style.zIndex = savedZ;
      app.style.transition = "";
      app.style.transform = "";
      app.style.transformOrigin = "";
      app.style.clipPath = "";
      app.style.webkitClipPath = "";
      exit();
    }, 560);
  }

  function perform() {
    if (!geo) {
      openSetup();
      return;
    }
    fitHeight();
    page = 0;
    digits = [null, null];
    drag = null;
    tapTimes = [];
    stage.style.transition = "none";
    stage.style.transform = "";
    stage.style.opacity = "";
    home.classList.add("on");
    home.setAttribute("aria-hidden", "false");
    /* Området bag statuslinjen skal have hjemmeskærmens farve */
    document.documentElement.style.background = geo.bg;
    document.body.style.background = geo.bg;
    stopAnim();
    track.style.transition = "none";
    renderOffset(0);
    setDot(0);
    options.onPerformChange?.(true);
  }

  function exit() {
    if (!home.classList.contains("on")) return;
    home.classList.remove("on");
    home.setAttribute("aria-hidden", "true");
    document.documentElement.style.background = "";
    document.body.style.background = "";
    press.classList.remove("on");
    options.onPerformChange?.(false);
  }

  /* ================= opsætning (guide i 3 trin) ================= */

  let setupEl = null;
  let step = 1;
  let pickingSlot = 0; /* hvilken side et enkelt billede skal ind på */
  let draft = null; /* gemt/importeret opsætning, der redigeres (se openDraft) */
  let images = [null, null, null];
  let result = null;
  let wallColor = "#000000";
  let onSetupClose = null;
  let toastTimer = 0;

  const STEP_NAMES = ["Baggrund", "Screenshots", "Tjek"];

  function buildSetup() {
    setupEl = document.createElement("section");
    setupEl.className = "fh-setup";
    setupEl.setAttribute("aria-hidden", "true");
    setupEl.setAttribute("aria-label", "Egen hjemmeskærm");
    setupEl.style.zIndex = String(options.setupZIndex);
    setupEl.style.setProperty("--fh-accent", options.accent);
    setupEl.style.setProperty("--fh-on-accent", options.accentText);
    setupEl.innerHTML = `
      <header class="fh-bar">
        <button type="button" class="fh-nav" data-act="back">${ICONS.back}<span>Luk</span></button>
        <div class="fh-title">Egen hjemmeskærm</div>
        <span></span>
      </header>
      <div class="fh-progress">${STEP_NAMES.map((name) => `<div><i></i><span>${name}</span></div>`).join("")}</div>
      <div class="fh-body">
        <div class="fh-step" data-step="0">
          <div class="fh-current"><canvas data-current></canvas><span class="fh-badge">Bruges i Perform</span></div>
          <div class="fh-list">
            <button type="button" class="fh-row" data-act="edit"><i>${ICONS.edit}</i><span>Redigér (ikon og screenshots)</span>${ICONS.chev}</button>
            <button type="button" class="fh-row" data-act="export"><i>${ICONS.share}</i><span>Del til andre apps</span>${ICONS.chev}</button>
            <button type="button" class="fh-row" data-act="import"><i>${ICONS.import}</i><span>Importér opsætning</span>${ICONS.chev}</button>
            <button type="button" class="fh-row" data-act="restart"><i>${ICONS.redo}</i><span>Sæt op igen</span>${ICONS.chev}</button>
          </div>
          <p class="fh-note">Del opsætningen som en fil og importér den i dine andre apps, så skal du kun tage screenshots én gang.</p>
          <div class="fh-list">
            <button type="button" class="fh-row danger" data-act="delete"><i>${ICONS.trash}</i><span>Slet egen hjemmeskærm</span></button>
          </div>
        </div>

        <div class="fh-step" data-step="1">
          <div class="fh-hero"><div class="fh-phone"><div class="fh-phone-screen">${"<i></i>".repeat(14)}<div class="fh-phone-dock"></div></div></div></div>
          <h2 class="fh-h">Ensfarvet baggrund</h2>
          <p class="fh-p">Med en helt ensfarvet baggrund glider ikonerne præcis som på en rigtig iPhone. Vælg en <b>mørk farve</b> — statuslinjen i appen er altid hvid.</p>
          <div class="fh-swatches">
            ${WALL_COLORS.map((c) => `<button type="button" class="fh-swatch" data-color="${c}" style="background:${c}" aria-label="Farve ${c}"></button>`).join("")}
            <label class="fh-swatch fh-swatch-custom" aria-label="Egen farve"><input type="color" data-custom-color value="#000000"></label>
          </div>
          <button type="button" class="fh-btn fh-tinted" data-act="wallpaper">${ICONS.save}Gem baggrundsbillede</button>
          <ol class="fh-steps">
            <li><span><b>Gem billedet</b> i Fotos.</span></li>
            <li><span>Åbn <b>Indstillinger → Baggrund → Tilføj ny baggrund → Fotos</b> og vælg billedet.</span></li>
            <li><span>Brug det også på <b>hjemmeskærmen</b> — uden sløring.</span></li>
          </ol>
        </div>

        <div class="fh-step" data-step="2">
          <h2 class="fh-h">Tag 3 screenshots</h2>
          <p class="fh-p">Swipe gennem side 1, 2 og 3 af din hjemmeskærm og tag et screenshot af hver.</p>
          <div class="fh-chips"><span>${appName} på side 3</span><span>Ingen notifikationer</span><span>Ingen åbne mapper</span></div>
          <div class="fh-slots">
            ${[0, 1, 2].map((i) => `
              <button type="button" class="fh-slot" data-slot="${i}">
                <img alt="">
                <span class="fh-slot-empty"><i>${ICONS.plus}</i>Side ${i + 1}</span>
                <span class="fh-slot-tag"><i>${ICONS.check}</i>Side ${i + 1}</span>
              </button>`).join("")}
          </div>
        </div>

        <div class="fh-step" data-step="3">
          <div class="fh-status" data-status></div>
          <div class="fh-previews" data-previews>
            <figure><canvas data-preview="0"></canvas><figcaption><b>Side 1 og 2</b>Cifrene</figcaption></figure>
            <figure class="fh-tap" data-tap><canvas data-preview="2"></canvas><figcaption><b>Side 3</b>Tryk på ${appName}</figcaption></figure>
          </div>
          <dl class="fh-facts" data-facts></dl>
          <div class="fh-list" data-replace hidden>
            ${[0, 1, 2].map((i) => `<button type="button" class="fh-row" data-act="replace-${i}"><i>${ICONS.redo}</i><span>Udskift screenshot af side ${i + 1}</span>${ICONS.chev}</button>`).join("")}
          </div>
        </div>
      </div>
      <footer class="fh-foot">
        <button type="button" class="fh-btn fh-primary" data-act="next"></button>
        <button type="button" class="fh-link" data-act="alt"></button>
      </footer>
      <div class="fh-busy"><div class="fh-spinner"></div><p>Måler din hjemmeskærm…</p></div>
      <div class="fh-wall">
        <img alt="Ensfarvet baggrund" data-wall>
        <p>Hold fingeren på billedet og vælg <b>Føj til Fotos</b> — eller tryk på knappen.</p>
        <button type="button" class="fh-btn fh-primary" data-act="share-wall">${ICONS.share}Gem / del billede</button>
        <button type="button" class="fh-link" data-act="close-wall">Færdig</button>
      </div>
      <div class="fh-toast" role="status"></div>
      <input type="file" accept="image/*" class="fh-file" data-file-one>
      <input type="file" accept="image/*" multiple class="fh-file" data-file-many>
      <input type="file" accept=".json,application/json" class="fh-file" data-file-import>`;
    document.body.appendChild(setupEl);
    fitHeight();

    const $ = (selector) => setupEl.querySelector(selector);

    setupEl.addEventListener("click", (event) => {
      const swatch = event.target.closest("[data-color]");
      if (swatch) {
        wallColor = swatch.dataset.color;
        renderSetup();
        return;
      }
      const slot = event.target.closest("[data-slot]");
      if (slot) {
        pickingSlot = Number(slot.dataset.slot);
        $("[data-file-one]").click();
        return;
      }
      const tap = event.target.closest("[data-tap]");
      if (tap) {
        pickAppIcon(event);
        return;
      }
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act) handleAction(act);
    });
    $("[data-custom-color]").addEventListener("input", (event) => {
      wallColor = event.target.value;
      renderSetup();
    });
    $("[data-file-one]").addEventListener("change", (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (file && draft) replaceInDraft(pickingSlot, file);
      else if (file) loadInto(pickingSlot, file);
    });
    $("[data-file-many]").addEventListener("change", (event) => {
      /* Ældste først — sådan tager man dem, når man swiper side 1 → 3 */
      const files = [...event.target.files]
        .sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, undefined, { numeric: true }))
        .slice(0, 3);
      event.target.value = "";
      files.forEach((file, i) => loadInto(i, file));
    });
    $("[data-file-import]").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (file) importSetup(file);
    });
  }

  function handleAction(act) {
    const $ = (selector) => setupEl.querySelector(selector);
    switch (act) {
      case "back":
        if (draft) {
          draft = null;
          result = null;
          goTo(custom ? 0 : 1);
        } else if (step === 2 || step === 3) goTo(step - 1);
        else if (step === 1 && custom) goTo(0);
        else closeSetup();
        break;
      case "next":
        if (step === 0) closeSetup();
        else if (step === 1) goTo(2);
        else if (step === 2) measure();
        else if (step === 3 && result?.error) goTo(2);
        else if (step === 3) save();
        break;
      case "alt":
        if (step === 1) $("[data-file-import]").click();
        else if (step === 2) $("[data-file-many]").click();
        break;
      case "edit":
        if (savedRecord) openDraft(savedRecord, false);
        break;
      case "replace-0":
      case "replace-1":
      case "replace-2":
        pickingSlot = Number(act.slice(-1));
        $("[data-file-one]").click();
        break;
      case "restart":
        images = [null, null, null];
        result = null;
        goTo(1);
        break;
      case "export":
        exportSetup();
        break;
      case "import":
        $("[data-file-import]").click();
        break;
      case "delete":
        if (window.confirm("Slet din egen hjemmeskærm?")) deleteCustom();
        break;
      case "wallpaper":
        $("[data-wall]").src = wallpaperCanvas().toDataURL("image/png");
        $(".fh-wall").classList.add("on");
        break;
      case "share-wall":
        shareWallpaper();
        break;
      case "close-wall":
        $(".fh-wall").classList.remove("on");
        break;
      default:
    }
  }

  function goTo(next) {
    step = next;
    renderSetup();
    const body = setupEl.querySelector(".fh-body");
    body.scrollTop = 0;
    /* genstart indgangsanimationen */
    const current = setupEl.querySelector(`[data-step="${step}"]`);
    current.style.animation = "none";
    current.getBoundingClientRect();
    current.style.animation = "";
  }

  function renderSetup() {
    const $ = (selector) => setupEl.querySelector(selector);
    setupEl.querySelectorAll("[data-step]").forEach((el) => {
      el.hidden = Number(el.dataset.step) !== step;
    });
    $(".fh-progress").hidden = step === 0 || Boolean(draft);
    setupEl.querySelectorAll(".fh-progress > div").forEach((el, i) => el.classList.toggle("done", i < step));
    $(".fh-nav span").textContent = draft ? "Annullér" : step === 2 || step === 3 || (step === 1 && custom) ? "Tilbage" : "Luk";

    const next = $("[data-act='next']");
    const alt = $("[data-act='alt']");
    alt.hidden = !(step === 1 || step === 2);

    if (step === 0) {
      next.textContent = "Færdig";
      next.disabled = false;
      drawCurrent($("[data-current]"));
    }
    if (step === 1) {
      next.textContent = "Næste";
      next.disabled = false;
      alt.textContent = "Importér fra en anden app";
      setupEl.querySelectorAll("[data-color]").forEach((el) => el.classList.toggle("on", el.dataset.color === wallColor));
      $(".fh-swatch-custom").classList.toggle("on", !WALL_COLORS.includes(wallColor));
      $("[data-custom-color]").value = wallColor;
      $(".fh-phone-screen").style.setProperty("--fh-wall", wallColor);
    }
    if (step === 2) {
      next.textContent = "Mål hjemmeskærmen";
      next.disabled = !images.every(Boolean);
      alt.textContent = "Vælg alle 3 på én gang";
      setupEl.querySelectorAll("[data-slot]").forEach((slot, i) => {
        const img = slot.querySelector("img");
        slot.classList.toggle("filled", Boolean(images[i]));
        if (images[i] && img.src !== images[i].src) img.src = images[i].src;
      });
    }
    if (step === 3) renderResult();
  }

  function renderResult() {
    const $ = (selector) => setupEl.querySelector(selector);
    const next = $("[data-act='next']");
    const status = $("[data-status]");
    const showStatus = (kind, icon, title, text) => {
      status.className = `fh-status ${kind}`;
      status.innerHTML = `<i>${icon}</i><div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
    };
    if (!result || result.error) {
      showStatus("error", ICONS.cross, "Det lykkedes ikke", result?.error || "Prøv igen.");
      $("[data-previews]").hidden = true;
      $("[data-facts]").hidden = true;
      next.textContent = "Vælg billeder igen";
      next.disabled = false;
      return;
    }
    const { geo: g, warnings } = result;
    $("[data-previews]").hidden = false;
    $("[data-facts]").hidden = false;
    $("[data-replace]").hidden = !draft;
    if (!g.notes) showStatus(warnings.length ? "warn" : "todo", warnings.length ? ICONS.warn : ICONS.tap, `Vælg ikonet til ${options.appName}`, [`Tryk på det ikon på side 3, der skal åbne ${options.appName}.`, ...warnings].join(" "));
    else if (draft) showStatus(warnings.length ? "warn" : "", warnings.length ? ICONS.warn : ICONS.check, "Redigér", warnings.length ? warnings.join(" ") : `Tryk på et andet ikon på side 3 for at skifte ${options.appName}-ikonet, eller udskift et screenshot herunder. Tryk Gem, når du er færdig.`);
    else showStatus(warnings.length ? "warn" : "", warnings.length ? ICONS.warn : ICONS.check, "Klar til brug", warnings.length ? warnings.join(" ") : `${options.appName} er valgt. Tjek cifrene og tryk Gem.`);
    $("[data-tap]").classList.toggle("pick", !g.notes);
    $("[data-facts]").innerHTML = `
      <div><dt>Baggrund</dt><dd><i style="background:${g.bg}"></i>${g.bg.toUpperCase()}</dd></div>
      <div><dt>Ikoner</dt><dd>${g.rows.length} × ${g.cols.length}</dd></div>
      <div><dt>Billede</dt><dd>${g.W} × ${g.H}</dd></div>`;
    drawPreview($("[data-preview='0']"), 0);
    drawPreview($("[data-preview='2']"), 2);
    next.textContent = draft ? "Gem" : "Gem og brug";
    next.disabled = !g.notes;
  }

  function drawPreview(canvas, previewPage) {
    const g = result.geo;
    const cssWidth = canvas.clientWidth || 150;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round((cssWidth * g.H * ratio) / g.W);
    const ctx = canvas.getContext("2d");
    const k = canvas.width / g.W;
    ctx.drawImage(draft ? draft.full[previewPage] : images[previewPage], 0, 0, canvas.width, canvas.height);
    const s = g.icon * k;
    g.rows.forEach((top, row) =>
      g.cols.forEach((left, col) => {
        const x = left * k;
        const y = top * k;
        const r = s * 0.23;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, s, s, r) : ctx.rect(x, y, s, s);
        if (previewPage === 0) {
          const digit = digitAt(g, { row, col });
          if (digit === undefined) return;
          ctx.fillStyle = "rgba(0,0,0,0.62)";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `700 ${Math.round(s * 0.56)}px -apple-system, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(digit), x + s / 2, y + s / 2 + s * 0.03);
        } else {
          const chosen = g.notes && g.notes.row === row && g.notes.col === col;
          if (!chosen) return;
          ctx.lineWidth = 3 * ratio;
          ctx.strokeStyle = options.accent;
          ctx.stroke();
        }
      }),
    );
  }

  /* Gemt opsætning tegnet som én hjemmeskærm (side 1) */
  async function drawCurrent(canvas) {
    if (!custom) return;
    const g = custom;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 160;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round((cssWidth * g.H * ratio) / g.W);
    const ctx = canvas.getContext("2d");
    const k = canvas.width / g.W;
    ctx.fillStyle = g.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const load = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    const [strip, bottom] = await Promise.all([load(g.src.pages[0]), load(g.src.dots[0])]);
    if (strip) ctx.drawImage(strip, 0, g.pagesTop * k, canvas.width, g.pagesH * k);
    if (bottom) ctx.drawImage(bottom, 0, g.dotsTop * k, canvas.width, g.dotsH * k);
  }

  async function loadInto(index, file) {
    try {
      images[index] = await loadImageFile(file);
      result = null;
    } catch {
      toast("Billedet kunne ikke åbnes", true);
    }
    renderSetup();
  }

  function measure() {
    if (!images.every(Boolean)) return;
    const busy = setupEl.querySelector(".fh-busy");
    busy.classList.add("on");
    window.setTimeout(() => {
      try {
        result = analyzeHomeScreens(images);
      } catch (error) {
        result = { error: error.message };
      }
      busy.classList.remove("on");
      goTo(3);
    }, 60);
  }

  function pickAppIcon(event) {
    if (!result || result.error) return;
    const g = result.geo;
    const rect = setupEl.querySelector("[data-preview='2']").getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * g.W;
    const y = ((event.clientY - rect.top) / rect.height) * g.H;
    const col = g.cols.findIndex((left) => x >= left - g.icon * 0.15 && x <= left + g.icon * 1.15);
    const row = g.rows.findIndex((top) => y >= top - g.icon * 0.15 && y <= top + g.icon * 1.15);
    if (col < 0 || row < 0) return;
    g.notes = { page: 2, row, col };
    renderResult();
  }

  async function save() {
    const g = result?.geo;
    if (!g?.notes) return;
    const next = setupEl.querySelector("[data-act='next']");
    next.disabled = true;
    next.textContent = "Gemmer…";
    if (draft) {
      await saveDraft(g);
      return;
    }
    try {
      const pages = [];
      const bottoms = [];
      for (const img of images) {
        pages.push(await blobFile(drawToCanvas(img, g.W, g.pagesH, 0, g.pagesTop, g.W, g.pagesH)));
        bottoms.push(await blobFile(drawToCanvas(img, g.W, g.dotsH, 0, g.dotsTop, g.W, g.dotsH)));
      }
      const appIcon = await blobFile(
        drawToCanvas(images[2], g.icon, g.icon, g.cols[g.notes.col], g.rows[g.notes.row], g.icon, g.icon),
      );
      await storeRecord({ geo: g, files: { pages, bottoms, noter: appIcon }, savedAt: Date.now() });
      images = [null, null, null];
      result = null;
      goTo(0);
      toast("Gemt — bruges nu i Perform");
    } catch (error) {
      result = { error: `Kunne ikke gemme: ${error.message}` };
      renderResult();
    }
  }

  async function deleteCustom() {
    try {
      await db("readwrite", (store) => store.delete("custom"));
    } catch {
      /* intet at slette */
    }
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    custom = null;
    savedRecord = null;
    setMode("default");
    goTo(1);
    toast("Egen hjemmeskærm slettet");
  }

  /* ---------- deling mellem apps ---------- */

  async function shareFile(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
      }
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return true;
  }

  function exportData() {
    if (!savedRecord) return null;
    const files = savedRecord.files;
    return {
      type: EXPORT_TYPE,
      version: 1,
      geo: savedRecord.geo,
      files: { pages: files.pages.map(bufferToDataUrl), bottoms: files.bottoms.map(bufferToDataUrl), noter: bufferToDataUrl(files.noter) },
    };
  }

  async function exportSetup() {
    const data = exportData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    if (await shareFile(blob, "hjemmeskaerm.json")) toast("Opsætningen er klar til import");
  }

  function parseImport(data) {
    if (data?.type !== EXPORT_TYPE || !data.geo || !data.files) throw new Error("Det er ikke en hjemmeskærm-fil");
    const files = data.files;
    return {
      geo: data.geo,
      files: { pages: files.pages.map(dataUrlToBuffer), bottoms: files.bottoms.map(dataUrlToBuffer), noter: dataUrlToBuffer(files.noter) },
      savedAt: Date.now(),
    };
  }

  /* API: gemmer direkte med det ikon, der er i filen */
  async function importData(data) {
    await storeRecord(parseImport(data));
  }

  /* Importeret i guiden: ikonet til netop denne app skal altid vælges, før den gemmes */
  async function importSetup(file) {
    try {
      const record = parseImport(JSON.parse(await file.text()));
      await openDraft(record, true);
      toast(`Importeret — vælg ikonet til ${options.appName}`);
    } catch (error) {
      toast(error.message || "Kunne ikke importere", true);
    }
  }

  /* ---------- redigering (kladde) ----------
     En gemt eller importeret opsætning redigeres uden at starte forfra: vælg app-ikonet
     igen eller udskift ét screenshot. Siderne samles til hele skærmbilleder (baggrund +
     ikonlag + bundlag), så forhåndsvisning og tryk virker som i trin 3. */
  function bufferImage(file) {
    return loadImageFile(new Blob([file.buf], { type: file.type }));
  }

  async function openDraft(record, pickIcon) {
    const busy = setupEl.querySelector(".fh-busy");
    busy.classList.add("on");
    try {
      const geo = JSON.parse(JSON.stringify(record.geo));
      if (pickIcon) geo.notes = null;
      const strips = await Promise.all(record.files.pages.map(bufferImage));
      const bottoms = await Promise.all(record.files.bottoms.map(bufferImage));
      const full = strips.map((strip, i) => {
        const canvas = document.createElement("canvas");
        canvas.width = geo.W;
        canvas.height = geo.H;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = geo.bg;
        ctx.fillRect(0, 0, geo.W, geo.H);
        ctx.drawImage(strip, 0, geo.pagesTop, geo.W, geo.pagesH);
        ctx.drawImage(bottoms[i], 0, geo.dotsTop, geo.W, geo.dotsH);
        return canvas;
      });
      draft = { files: { pages: [...record.files.pages], bottoms: [...record.files.bottoms] }, full, replaced: [null, null, null] };
      result = { geo, warnings: [] };
      goTo(3);
    } finally {
      busy.classList.remove("on");
    }
  }

  async function replaceInDraft(index, file) {
    const g = result?.geo;
    if (!draft || !g) return;
    let img;
    try {
      img = await loadImageFile(file);
    } catch {
      toast("Billedet kunne ikke åbnes", true);
      return;
    }
    if (img.naturalWidth !== g.W || img.naturalHeight !== g.H) {
      toast(`Screenshottet skal være ${g.W} × ${g.H} — tag det på samme telefon`, true);
      return;
    }
    draft.full[index] = img;
    draft.replaced[index] = img;
    renderResult();
    toast(`Side ${index + 1} udskiftet — tryk Gem`);
  }

  async function saveDraft(g) {
    try {
      const pages = [...draft.files.pages];
      const bottoms = [...draft.files.bottoms];
      for (let i = 0; i < 3; i += 1) {
        const img = draft.replaced[i];
        if (!img) continue;
        pages[i] = await blobFile(drawToCanvas(img, g.W, g.pagesH, 0, g.pagesTop, g.W, g.pagesH));
        bottoms[i] = await blobFile(drawToCanvas(img, g.W, g.dotsH, 0, g.dotsTop, g.W, g.dotsH));
      }
      const appIcon = await blobFile(
        drawToCanvas(draft.full[2], g.icon, g.icon, g.cols[g.notes.col], g.rows[g.notes.row], g.icon, g.icon),
      );
      await storeRecord({ geo: g, files: { pages, bottoms, noter: appIcon }, savedAt: Date.now() });
      draft = null;
      result = null;
      goTo(0);
      toast("Gemt — bruges nu i Perform");
    } catch (error) {
      toast(`Kunne ikke gemme: ${error.message}`, true);
      renderResult();
    }
  }

  /* ---------- ensfarvet baggrundsbillede ---------- */

  function wallpaperCanvas() {
    const ratio = window.devicePixelRatio || 1;
    let width = Math.round(window.screen.width * ratio);
    let height = Math.round(window.screen.height * ratio);
    if (width > height) [width, height] = [height, width];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = wallColor;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }

  async function shareWallpaper() {
    const blob = await canvasBlob(wallpaperCanvas());
    await shareFile(blob, "baggrund.png");
  }

  function toast(text, isError = false) {
    const el = setupEl.querySelector(".fh-toast");
    el.innerHTML = `${isError ? "" : ICONS.check}<span>${esc(text)}</span>`;
    el.classList.add("on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("on"), 2600);
  }

  function openSetup({ onClose } = {}) {
    if (!setupEl) buildSetup();
    onSetupClose = onClose || null;
    fitHeight();
    draft = null;
    ready.then(() => {
      step = custom ? 0 : 1;
      renderSetup();
      setupEl.querySelector(".fh-body").scrollTop = 0;
    });
    setupEl.classList.add("open");
    setupEl.setAttribute("aria-hidden", "false");
  }

  function closeSetup() {
    setupEl.classList.remove("open");
    setupEl.setAttribute("aria-hidden", "true");
    setupEl.querySelector(".fh-wall").classList.remove("on");
    const done = onSetupClose;
    onSetupClose = null;
    done?.();
  }

  ["resize", "orientationchange", "pageshow"].forEach((type) => window.addEventListener(type, () => window.setTimeout(fitHeight, 0)));
  fitHeight();
  syncGeo();

  instance = {
    version: VERSION,
    ready,
    perform,
    exit,
    openSetup,
    closeSetup: () => setupEl && closeSetup(),
    isPerforming: () => home.classList.contains("on"),
    hasCustom: () => Boolean(custom),
    get mode() {
      return mode === "custom" && custom ? "custom" : "default";
    },
    setMode,
    exportSetup: exportData,
    importSetup: importData,
    /* til test */
    _analyze: analyzeHomeScreens,
    _geo: () => geo,
  };
  return instance;
}

window.FakeHome = { init, version: VERSION, analyze: analyzeHomeScreens };
})();
