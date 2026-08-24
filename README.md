# Brisbane Blackboard

An animated basketball playbook for the Brisbane Bullets — build formations,
draw routes freehand (motion / pass / dribble / screen), and animate plays
on a real full-court or half-court background. Built as a PWA: React +
TypeScript + Vite + React-Konva + Tailwind.

## Getting set up

Pick whichever matches your setup — both end up running the same app.

### If you have Node.js installed

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install
npm run dev
```

Opens at `http://localhost:5173`. `npm run build` produces a production
build in `dist/`.

### If you don't have Node installed (or don't want to)

1. Go to [stackblitz.com](https://stackblitz.com) → **Create new** → the
   **Vite → React + TypeScript** template.
2. Delete the placeholder files it generates inside `src/`.
3. Drag this repo's `src/` and `public/` folders (as folders, not their
   loose contents — that's what keeps the structure intact) into
   StackBlitz's file panel, along with `index.html`, `package.json`,
   `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, and
   `postcss.config.js`.
4. StackBlitz installs dependencies automatically. If the dev server
   doesn't start on its own, run `npm install` then `npm run dev` in its
   terminal.

## Project structure

```
src/
  App.tsx                 — top-level layout: court + sidebar
  main.tsx                — React entry point (rarely touched)
  index.css               — Tailwind directives + global styles

  hooks/
    usePlayEditor.ts       — all editor state: players, routes, playback,
                             possession, court type. The "brain" of the app.
    useHTMLImage.ts        — loads an image for Konva to draw (headshots,
                             court backgrounds)

  components/
    CourtEditor.tsx         — the Konva Stage; wires pointer events to the
                             drawing gestures in usePlayEditor
    Court.tsx               — renders the full/half court background image
    PlayerToken.tsx          — one player's circle/photo/number/name on court
    RouteLine.tsx            — renders a drawn route (styled per line type)
    Toolbar.tsx               — court type, mode, line type, playback controls
    RosterManager.tsx          — add/edit/remove players, put them on court
    PlaysLibrary.tsx            — save/load/delete plays

  lib/
    court.ts                — court image paths + pixel dimensions
    routeGeometry.ts        — math for drawing/animating freehand routes
    rosterStore.ts          — roster persistence (localStorage today)
    storage.ts               — saved-plays persistence (localStorage today)

  types/index.ts            — shared TypeScript types for the whole app
  data/rosterSeed.json      — the roster's starting data (editable in-app
                             after that — this file is only the seed)

public/
  players/                 — player headshots
  court/                    — the two court background images
  manifest.json, icon-*.png — PWA install metadata
```

If you're new to this codebase: `usePlayEditor.ts` is the one file worth
reading first — every other file either renders a piece of its state or
calls a function it exposes.

## What's implemented

- **Full court and half court**, toggled in the Toolbar under **Court**.
  Both render real court artwork (`public/court/`) rather than a hand-drawn
  diagram. These aren't just scaled versions of each other — different
  aspect ratio, different basket placement — so switching between them
  resets the 5 on-court players to that court's own default spots and
  clears drawn routes. Who's on the court (roster picks) is preserved;
  only positions and routes reset.
- Team roster (`src/data/rosterSeed.json`) seeded with 14 confirmed Bullets
  players — names, jersey numbers, positions, and real headshots
  (`public/players/`). Editable in-app under **Roster** in the sidebar,
  persisted to localStorage.
  - **Flagged, not guessed:** the source data showed both Jaylin Williams
    and Lat Mayen wearing #2. Since only one player can wear a number,
    Mayen's is left blank rather than invented — confirm the real one and
    fill it in via the Roster panel.
  - A few players (Billy McRae, Jaylin Williams, Max Mackinnon, Joshua
    Duach) don't have a confirmed position in the source data — left blank
    for the same reason.
- Player tokens show the real headshot, circularly cropped, with the
  jersey number as a small badge in the corner so it's readable even with
  a photo showing. Players added later without a photo fall back to a
  plain circle.
- Court starts with the first 5 roster players (by jersey number) already
  placed. Use the Roster panel to swap anyone in or out — capped at 5
  offensive players on court at once, same as basketball.
- Route drawing is **press-drag-release, freehand** — pick a line type,
  then drag directly from a player's token like drawing on a whiteboard.
  Four styles: motion (solid, the default), pass (dotted), dribble (double
  line), screen (solid, ending in a flat T instead of an arrowhead). A
  route can chain multiple drag-gestures of different types back to back.
- **Ball possession** is tracked and highlighted — a gold ring on whoever
  has it, named in the Toolbar too. Drawing a *dribble* keeps possession
  with that player; a *pass* that ends near another on-court player hands
  it to them automatically.
- Play/pause/speed animation along drawn routes.
- Save/load/delete plays, persisted to localStorage (capped at 100 plays).
- Touch-friendly, sized for iPad.
- Installable as a PWA — real service worker via `vite-plugin-pwa`
  (offline-capable), generated app icons in the team's navy/gold.

## Known gaps / next steps

- **Switching court type is a hard reset of positions/routes**, by design —
  a half-court formation doesn't obviously map onto full-court spacing, so
  no attempt is made to carry one across automatically.
- **Multiple players animating with different start times** — every
  player's route currently plays on the same 0–1 timeline. Staggering
  (e.g. a screen finishing before the cutter goes) isn't in yet.
- **Possession isn't time-aware during playback** — the gold ring reflects
  who holds the ball *right now* in the editor, not at each moment as the
  play animates. A proper fix ties it to the playback clock.
- **Defense** — `Player.team` already supports `'defense'`, there's just no
  UI yet to add a defensive player to the court.
- **Player photos** for players added after the initial roster — no upload
  option yet, they render as a plain circle.
- **Roster and plays are single-device** — both live in localStorage,
  isolated behind one module each (`rosterStore.ts`, `storage.ts`), so
  pointing them at a real backend (Supabase, etc.) later doesn't touch any
  component code.
- **Undo/redo** for route drawing.
