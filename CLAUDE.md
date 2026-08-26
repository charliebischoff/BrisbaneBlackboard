# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev            # vite dev server -> http://localhost:5173
npm run build          # tsc -b && vite build -> dist/
npm run preview
npx tsc -b --noEmit    # type-check only
```

There is no test suite, no test runner, and no lint config. The `tsc -b` inside
`npm run build` is the only automated check — run it after changes.

## Architecture

**One state container.** `src/hooks/usePlayEditor.ts` holds *all* editor state —
on-court players, routes, playback clock, possession, court type, mode, active line
type — and exposes every mutator. `App.tsx` calls it once and passes the returned
object down as an `editor` prop. Components render a slice of that state or call one
of its functions; none owns editor state. Read this file first.

**Rendering is Konva, not DOM.** `components/CourtEditor.tsx` owns the single
`Stage` and translates pointer events into `usePlayEditor`'s drawing gestures.
`Court`, `PlayerToken`, and `RouteLine` are Konva nodes inside it.

**Coordinate space.** Each court type's Konva coordinate space *is* the court image's
pixel dimensions (`lib/court.ts` → `COURT_DIMENSIONS`), so player and route
coordinates map 1:1 onto the artwork with no stored scale factor. Display fitting
happens in exactly one place — `useResponsiveScale` in `CourtEditor.tsx` — and
incoming pointer coordinates are divided by that scale. Never bake display scale
into stored data.

The two courts are not scaled versions of each other (different aspect ratio,
different basket placement). `setCourtType` therefore deliberately resets on-court
positions to that court's `DEFAULT_SPOTS` and clears routes; roster selection
survives, geometry does not. Don't "fix" this by rescaling across court types.

**Routes.** A player's route is an ordered chain of `RouteSegment`s, each one
freehand press-drag-release stroke in a single `LineType`
(`motion`/`pass`/`dribble`/`screen`). Segments chain — each starts where the
previous ended, or at the player's position for the first. Geometry math (flatten,
arc length, point-at-fraction) lives in `lib/routeGeometry.ts`; keep it there, out
of components.

**Possession** is derived from what was drawn, not from the clock: a `dribble`
keeps the ball with that player; a `pass` ending within `PASS_CATCH_RADIUS` of
another on-court player transfers it. It is not time-aware during playback (known
gap — see README).

**Persistence** is localStorage behind exactly two modules: `lib/rosterStore.ts`
(roster) and `lib/storage.ts` (saved plays, capped at 100). No component touches
storage directly; swapping in a backend should only touch these two files.
`data/rosterSeed.json` is the *seed only* — once the roster is in localStorage,
editing that JSON has no effect on an existing browser profile.

**PWA.** `vite-plugin-pwa` with `manifest: false` — the manifest is hand-maintained
at `public/manifest.json` and linked from `index.html`. Edit that file, not the
plugin config.

## Data conventions

Roster fields that were unconfirmed in the source data are left `null`/blank on
purpose (Lat Mayen's jersey number, several positions) rather than guessed. Do not
fill them in without a confirmed source. `README.md` documents which ones and why,
alongside a "Known gaps / next steps" list worth reading before proposing features.
