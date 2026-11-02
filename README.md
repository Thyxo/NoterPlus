# Noter+ – falsk Noter-app med Cryptext-forudsigelse

En PWA, der ligner iPhonens **Noter**-app (iOS 26, mørk tilstand). Skallen (mapper, noteliste, editor, glas-design og den falske hjemmeskærm) er taget fra [notes-app](https://github.com/Thyxo/notes-app).

Den viser en "håndskrevet" note. Holdt normalt står der et tal. Vendes telefonen, står der tilskuerens navn. Appen er forbundet med lommeregneren ([Calcplus](https://github.com/Thyxo/Calcplus)), så lommeregneren automatisk tvinger det samme tal. Ren vanilla JS, intet build-trin.

**Adresse:** https://noterplus.vercel.app (Vercel-projekt *noterplus*, udgives ved push til `main`)

---

## Rutine 1: Du "håndskriver" navnet (standard)

1. Tilskueren siger et navn, fx *Mads*.
2. Tryk på **ny note** (blyanten nederst til højre). Tastaturet kommer frem.
3. Tast navnet. Det tegnes bogstav for bogstav som håndskrift, **liggende** på langs af skærmen. Vis det: "Her er dit navn."
4. Tryk **tilbage**. Navnet bliver til et tal, fx `59841`, og sendes til lommeregneren.
5. Lommeregneren: tilskueren regner frit, og resultatet bliver **59.841**.
6. Åbn noten igen (navnet står op), og vend telefonen 180°. Nu står der **59841**.

- **Liggende:** læses med telefonen drejet, så toppen peger mod venstre. Det kan ændres under *Vending → Skrevet* (toppen mod højre eller opret).
- **Bogstaverne bliver ikke ændret:** hvert bogstav får sin form (stort eller lille), når du taster det, og den ændres ikke bagefter. Har du først trykket tilbage, kan noten ikke redigeres ved et uheld.
- **Den hurtige plet** vender også denne note. Prikken viser, når tallet står op.
- **Lås skærmrotation** på iPhonen (Kontrolcenter), ellers drejer hele appen med.

## Rutine 3: Tilskueren skriver – din note matcher – stopuret giver tallet

Panel → **Rutine → Tilskueren skriver → din note**.

1. Tilskueren trykker **ny note** og skriver sit navn helt normalt, fx *Mads*. Første linje fanges.
2. De forlader Noter. De kan trykke tilbage eller swipe hjem. Navnet er allerede sendt efter en kort pause, og ellers sendes det i samme øjeblik appen forlades.
3. Stopuret (Stopwatchplus med samme kode) får tallet, fx 50041, i rutinen *Noter+ (live)*.
4. Tilskueren stopper uret, og tallet står på uret. Langt tal = flere runder, fx `05 · 00 · 41`.
5. Du åbner **Forudsigelse**: navnet står i håndskrift, liggende, og matcher det, de skrev. Vend telefonen 180°, så står tallet fra stopuret.

Rutinen slår *Ny note → Tilskueren skriver*, *Vis noten i listen* og *Når noten åbnes → Navnet op* til på én gang.

## Rutine 2: Forudsigelse skrevet "i går"

1. **Navnet.** Tilskueren tænker på et navn, fx *Mads*. Du får det på en af tre måder:
   - **Søgefeltet:** "Skriv lige navnet i søgefeltet." Det fanges ved Søg og forsvinder.
   - **Ny note:** med *Ny note → Tilskueren skriver* skriver de navnet i en almindelig note. Første linje fanges, når de går tilbage.
   - **Panelet:** du skriver det selv.
2. **Tallet.** Noter+ regner navnet om til et tal, fx `50041`. Tallet sendes til lommeregneren, som slår force til.
3. **Lommeregneren.** Tilskueren regner frit, fx fødselsdato + postnummer. Resultatet bliver **50.041**.
4. **Noten.** "Jeg skrev noget i går aftes." Åbn *Forudsigelse*. Der står **50041** med håndskrift.
5. **Vend telefonen.** Nu står der **MADS**.

Variant uden navn: vælg **Lommeregnerens resultat** i panelet. Tilskueren regner helt frit uden force, og noten viser bagefter det tal, de fik.

---

## Opsætning (én gang)

### 1. Installér begge apps
Åbn adressen i **Safari** → Del → **Føj til hjemmeskærm**. Gør det samme med lommeregneren.

### 2. Indlæs Cryptext-fonten
Fonten er kommerciel. Derfor ligger den **ikke** i repoet eller på Vercel.
1. Gem `Cryptext25-Regular.ttf` i **Filer** på iPhonen.
2. Åbn **Noter+ fra hjemmeskærmen**. Hjemmeskærm-apps har deres eget lager, så Safari tæller ikke.
3. Panel → **Cryptext-font → Vælg font-fil …**

Fonten gemmes kun på telefonen. Cryptext 2.5 genkendes på filnavnet, og en kontrolleret bogstav-tabel bruges. Andre fonte kalibreres automatisk, og tabellen kan rettes.

Uden fonten virker kun bogstaverne **O I L Z E h S g B G t b**, fx *LISE* = 3517 og *BOB* = 808.

### 3. Forbind med lommeregneren
- Noter+: panel → **Forbindelse → Lav en ny kode** (fx `k7m2qp`).
- Lommeregneren: panel (5 tryk øverst til højre) → **Forbindelse til Noter+ → Kode**: samme kode.
- Status skal vise **Forbundet**.

---

## Panelet (3 tryk på den øverste bjælke)

| Del | Hvad den gør |
|---|---|
| **Statuslinje** | Font ✓, forbindelse ✓ og tallet lige nu |
| **Noten viser** | *Navn → tal*, *Fast tal* (fx en dato) eller *Lommeregnerens resultat* |
| **Bogstaver** | **Bedste (blandet)** er standard. Hvert bogstav skrives stort eller lille, alt efter hvad der ligner et tal bedst, og 0 undgås som første ciffer. Der er også *Stort forbogstav*, *STORE*, *Som skrevet* og *små* |
| **Forhåndsvisning** | Det lommeregneren viser, tegningen begge veje og advarsler (svage bogstaver, 0 forrest, for mange cifre) |
| **Navnet** | Fang navnet fra søgefeltet. **Ny note:** *Du taster navnet → håndskrift* (rutine 1), *Tilskueren skriver* (1. linje fanges) eller *Almindelig note*. *Slet tilskuernes noter* rydder op |
| **Forudsigelses-noten** | Vis den i listen eller ej (skjul den til rutine 1), titel, tekst over, hvornår den er "skrevet" (i går aftes, 3 dage siden, i morges), blækfarve og størrelse |
| **Vending** | Se nedenfor |
| **Cryptext-font** | Vælg fil, *Bogstav-tegn* (auto/vendt/opret), *Tal-tegn for O I Z E S L B G*, kalibrér igen, fjern. **Tabellen** viser hvert bogstav, som det står i tal-vejen, og tallet det ligner. Ret et tal ved at skrive i feltet (orange = svagt, gul = rettet af dig) |
| **Forbindelse** | Kode, status og sidste resultat fra lommeregneren |
| **Hjemmeskærm** | Perform-tilstand med falsk hjemmeskærm (fra notes-app). Tryk på Noter-ikonet: noten åbner direkte på forudsigelsen |

### Vending: den hurtige plet
- **Skrevet:** *liggende – toppen mod venstre* (standard), *liggende – toppen mod højre* eller *opret*. Gælder alle håndskrift-noter.
- **Hurtig plet:** et usynligt felt på 66×66 pt i et hjørne af noten (standard: øverst til højre under bjælken). Ét kort tryk vender tegningen 180°.
- **Tryk på pletten:** *Vend med det samme* (gør det, mens skærmen vender væk) eller *Drej langsomt*: tegningen drejer synligt rundt, og tallet bliver til navnet foran tilskueren.
- **Prik når tallet står op:** en næsten usynlig grå prik i pletten. Er prikken der, står tallet rigtigt for dig. Er den væk, står navnet op.
- **Når noten åbnes:** *Tallet op* eller *Navnet op*.

---

## Lommeregneren

Nyt i Calcplus-panelet under **Forbindelse til Noter+**:

| Felt | |
|---|---|
| **Kode** | Samme kode som i Noter+ |
| **Modtag mål fra Noter** | Et navn eller tal fra Noter+ bliver straks lommeregnerens mål. Force slås til, og tælleren nulstilles |
| **Send resultater til Noter** | Hvert `=` sendes til Noter+ (til *Lommeregnerens resultat* og *Sidste resultat*) |
| **Navn (Cryptext)** | Skriv navnet i lommeregneren i stedet. Den bruger Noters tabel, som sendes med automatisk. Noter+ retter tallet, hvis de er uenige |

Ændrer du målet i lommeregnerens panel, følger noten med (som *Fast tal*).

iOS sætter hjemmeskærm-apps på pause i baggrunden. Hver app henter derfor den seneste tilstand, så snart den åbnes igen. Uden net virker begge apps som før med det, de sidst fik.

---

## Relæet (Railway)

`relay/server.ts` er en lille Bun-server, en "postkasse" pr. kode:

- Adresse: `https://relay-production-03f5.up.railway.app`
- Railway-projekt: **magic-relay**, service **relay** (Railway Function, ingen repo-kobling)

| Kald | Formål |
|---|---|
| `GET /r/:kode` | Hent rummets tilstand |
| `POST /r/:kode` | Skriv felter, fx `{ "force": {...} }` |
| `GET /r/:kode/events` | Live-opdateringer (Server-Sent Events) |

- **Hukommelse:** alt ligger i hukommelsen og ryddes efter 7 dage uden brug. Genstartes serveren, sender apps selv deres seneste værdi igen.
- **Genbrug:** Stopuret og andre apps kan bruge relæet. Brug et nyt feltnavn, fx `stop`.
- **Ændringer:** ret `relay/server.ts`, og læg koden ind i Railway-funktionen. Det kan Claude gøre via Railway.

Felter i et rum:
- `force { digits, name, by, at }` – målet
- `result { value, forced, at }` – lommeregnerens seneste "="
- `cmap { font, map, scores, preferDigits, caseMode, at }` – Noters bogstav-tabel til lommeregneren

---

## Filer

| Fil | |
|---|---|
| `index.html`, `styles.css` | Skallen fra notes-app plus tegning, plet og panel |
| `fakehome.js`, `home/` | Falsk hjemmeskærm (kopieret uændret fra notes-app) |
| `src/app.js` | Appen: noter, panel, fangst af navn, vending, forbindelse |
| `src/crypt.js` | Navn → tal (ren logik, testet). **Samme fil i Calcplus** |
| `src/link.js` | Forbindelse til relæet. **Samme fil i Calcplus** |
| `src/known.js` | Kontrolleret tabel for Cryptext 2.5 (kun bogstav → tal). **Samme fil i Calcplus** |
| `src/font.js` | Indlæsning af fonten (IndexedDB), tegning (canvas) og automatisk kalibrering |
| `relay/server.ts` | Relæet på Railway |
| `sw.js` | Offline-cache. **Hæv `CACHE_NAME` ved ændringer** |

Ret de tre fælles filer her, og kopiér dem derefter til `Calcplus/src/`.

### Kør og test
```bash
npm run dev     # http://localhost:8000
npm test        # 13 tests: navn → tal, Cryptext-tabel, æøå, 0 forrest, rum-koder
npm run relay   # relæet lokalt (kræver bun)
```

Testet i Chromium med den rigtige font:
- Fonten genkendes.
- *Mads* bliver til 50041, og vendt står der MADS.
- Pletten vender noten.
- Søgefeltet og en ny note fanger navnet.
- Noter → lommeregner → resultat → Noter går live via relæet.
- Et navn tastet i lommeregneren giver samme tal i begge apps.

---

## Cryptext-tabellen (aflæst fra fonten)

Hvert bogstav drejet 180° og det tal, det ligner.

- **Tydelige:** A8 B8 D0 E3 F1 G9 I1 L7 N4 O0 Q0 R21 S5 T1 V1 Y3 Z2 · a0 b9 f8 g6 h4 i1 k71 l1 m41 n4 o0 q6 r1 s5 t7 u0 v1 y5 z2
- **Svage:** C0 H4 J1 K71 M41 P0 U0 W14 X4 · c0 d9 e2 j1 p0 w14 x4

Tjek et nyt navn i forhåndsvisningen, før du optræder. Den viser begge veje.

---

## Idéer til mere

- **Stopur-forbindelse:** Stopwatchplus kan bruge samme relæ. Navnet i noten kan blive stop-tiden, fx *LISE* → `00.35,17`.
- **Peek på din egen telefon:** en lille side, der viser rummet live, så du ser lommeregnerens resultat på afstand (fx Apple Watch via Safari).
- **Telefonnummer eller fødselsdato i noten:** *Fast tal*, skrevet ind fra lommeregneren eller via relæet.
- **To tilskuere:** den ene tænker på et navn, den anden regner. Summen bliver navnets tal.
- **Ord i stedet for navne:** by, dyr, kort ("ES" = 53).
- **Vend uden at røre:** brug telefonens bevægelsessensor, så tegningen skifter, når telefonen lægges med skærmen ned.
