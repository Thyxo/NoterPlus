# CLAUDE.md

Noter+: statisk PWA (ingen build) der ligner iPhone Noter og viser en Cryptext-forudsigelse. Dansk UI. Se README.md.

- `src/cryptext.js` kopieres uændret til Calcplus og Stopwatchplus.
- `src/crypt.js`, `src/link.js`, `src/known.js` er **identiske kopier i Calcplus/src/** – ret her og kopiér.
- Cryptext-fonten er kommerciel: **commit aldrig .ttf/.otf/.woff** (står i .gitignore og .vercelignore). Brugeren indlæser den i appen (IndexedDB).
- Tegningen beskrives i "tal-visning": glyffer venstre→højre som tallet læses; navnet står baglæns, bogstav-tegn drejet 180° (`rot`). Hele canvas drejes med CSS ved vending.
- Relæ: `relay/server.ts` kører som Railway Function (projekt magic-relay, service relay). Opdatér via Railway-værktøjet update-function-source-code.
- Hæv `CACHE_NAME` i `sw.js` ved ændringer. Undgå requestAnimationFrame til layout (se notes-app).
- Test: `npm test`. Pushes til `main` udgives på Vercel.
