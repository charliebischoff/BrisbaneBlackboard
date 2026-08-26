# Shared team playbook via Google Drive, offline-first

## Context

Plays currently live only in `localStorage` (`src/lib/storage.ts`, key `playbook.plays.v1`) — per browser profile, per device, with no sharing, backup, or export. Coaches can't see each other's plays, and clearing site data loses everything.

We want one shared team playbook that multiple coaches read and write, **without giving up offline reliability**. Offline is a hard requirement, not a nice-to-have: plays get pulled up mid-game in gyms with bad connections. Stale plays rendering instantly beats fresh plays rendering slowly.

Chosen approach: **one shared JSON document in a shared Google Drive folder**, authorized per-coach via Google Picker under the free `drive.file` scope. No backend to run, no billing, plays stay in the coaches' own Drive.

### Decisions locked in

- Drive, not Firestore/Supabase — no server to run, plays stay in the team's Drive.
- One JSON file for all plays (not one file per play): a single durable Picker grant per coach, no folder-discovery problem.
- `drive.file` scope only. Broader scopes are "restricted" and need a paid annual security audit. **Consequence: the app cannot find the file by name — Picker onboarding is mandatory**, one click, once per coach.
- Editing an existing play is disallowed for now; the flow is delete + create new. The shared doc is therefore **append + tombstone**, which makes merging nearly trivial.
- Deletes are global. Needs confirmation UI.
- Roster sync is **out of scope** — `loadPlay` (`usePlayEditor.ts:302`) reads players straight from the snapshot and name/photo are embedded in `Player`, so plays are self-contained.

### The load-bearing constraint

**The local read path stays synchronous.** `PlayStore` is not widened to Promises; `getAll()`/`save()` keep hitting localStorage with zero `await`. Sync is a separate layer with its own async surface. This is what makes offline reliability structural rather than best-effort — no render path ever acquires a network-shaped dependency, in a codebase that today has no async/loading UI at all.

Corollary: **the upload outbox is persisted to disk, not in-memory.** Browser OAuth gives a ~1hr token with no refresh token, so a play queued offline must survive a reload or PWA eviction.

---

## Pre-work fixes (ship first, independently)

1. **`localPlayStore.save()` — preserve `createdAt` on upsert.** `toPlaySnapshot` (`src/hooks/usePlayEditor.ts:284`) sets `createdAt = updatedAt = now` on every save, destroying the original. Fix in the store, not the editor. Must land before `createdAt` becomes load-bearing for the shared doc.
2. Add a comment on `Player.photoUrl` (`src/types/index.ts`) that it must hold a path, never a data URL — one data URL per player would bloat the single shared document.

---

## File layout

New code under `src/lib/sync/`. `src/lib/storage.ts` is untouched apart from fix #1. `src/types/index.ts` needs **no changes** — see "no sync metadata on `Play`" below.

```
src/lib/sync/
  types.ts        PlaybookDoc, Tombstone, SyncStatus, OutboxEntry
  doc.ts          pure: emptyDoc, upsertPlay, addTombstone, mergeIntoLocal, validateDoc
  googleAuth.ts   GIS token client, lazy script load, in-memory token only
  picker.ts       lazy gapi/picker load, pickPlaybookFile() -> fileId
  driveClient.ts  getMeta / download / uploadContent (raw fetch, no gapi.client)
  outbox.ts       localStorage-persisted queue, synchronous
  syncIndex.ts    localStorage playId -> { syncedAt, docRevision }, synchronous
  engine.ts       orchestration: pull(), push(), flushOutbox() — the only async brain
src/hooks/useSync.ts   React surface
```

`doc.ts` is pure and is the only part worth reasoning hard about. `engine.ts` is the only file that both awaits and touches localStorage.

## Document schema

```ts
export const DOC_VERSION = 1
export interface PlaybookDoc {
  version: 1
  plays: Record<string, Play>            // keyed by Play.id
  tombstones: Record<string, Tombstone>  // same keys
}
export interface Tombstone { id: string; deletedAt: string; deletedBy?: string }
```

Invariants — restate these as a comment block in `doc.ts`:

1. The doc is **grow-only**. A play is live iff `plays[id]` exists and `tombstones[id]` does not. Tombstone always wins.
2. **Never prune tombstones** — a stale client still holding the play would resurrect it on its next push.
3. Per-play `createdAt`/`updatedAt` are **advisory only** (client clocks skew). All staleness decisions use Drive's server-side `headRevisionId`.
4. A clobbered play is recovered **on the next pull**, via the syncIndex cross-check in the merge table below — *not* via the outbox, which has already dequeued by then. This is what makes the racy read-modify-write acceptable.

`plays` is a keyed object, not an array, so splicing one play is `{...doc.plays, [id]: play}` and "never replace wholesale" is structurally obvious.

## Merge (`doc.ts`, pure, no I/O)

`mergeIntoLocal(doc, local, index) -> { toSave, toRemove, nextIndex }`

| in doc.plays | tombstoned | local | action |
|---|---|---|---|
| yes | no | no | save (new from a teammate) |
| yes | no | yes | leave alone, mark synced |
| — | yes | yes | remove (global delete) |
| — | yes | no | nothing |
| no | no | yes, **not** in syncIndex | genuinely local-only — leave it |
| no | no | yes, **is** in syncIndex | was synced, now clobbered → **re-enqueue upsert** |

Those last two rows are the ones to get right.

Absence from the doc must never mean delete, or a partially-uploaded client wipes its own work — only an explicit tombstone deletes.

The syncIndex split is what actually closes the lost-update hole. Drive has no conditional content write, so two coaches who both download revision N and both PATCH will produce a doc containing only the second one's play — and the first coach's readback verify already passed, so their outbox is empty and their syncIndex says "synced". Without this row, that play is silently gone from the shared doc forever while looking fine locally. With it, the next pull notices "I have it, I think it's synced, it's not in the doc" and re-queues it. `engine.pull` applies the result through the synchronous `localPlayStore.save`/`.remove`.

## Drive client and read-modify-write

Raw `fetch`, three endpoints — no `gapi.client` dependency:

- `GET /drive/v3/files/{id}?fields=headRevisionId,modifiedTime,trashed`
- `GET /drive/v3/files/{id}?alt=media`
- `PATCH /upload/drive/v3/files/{id}?uploadType=media&fields=headRevisionId`

`engine.push(entry)`:

```
1. download() -> { doc, rev }
2. apply entry (upsertPlay | addTombstone)
   - upsert of an id already in doc.plays -> drop, return 'already-uploaded'
3. getMeta(); if revision moved -> retry from 1 (max 3), else leave queued
4. uploadContent(nextDoc)
5. VERIFY by re-downloading. Dequeue ONLY if the readback contains the
   play/tombstone — never on HTTP 200 alone.
6. syncIndex[id] = { syncedAt, docRevision }
```

Note Drive v3 has **no conditional content write** (no If-Match) — the revision check in step 3 narrows the race window but cannot close it, and the readback in step 5 only proves *your* play landed, never that you didn't clobber someone else's. The syncIndex row in the merge table is what actually recovers from that.

**Skip redundant downloads.** Persist `lastKnownRevision`; a pull calls `getMeta` first and skips the full download when `headRevisionId` is unchanged. The doc is grow-only, so otherwise every startup re-downloads the entire accumulated playbook and every push is three full-doc transfers. Worth the extra call for a feature justified by bad gym connections.

**Run `validateDoc` on every download**, not just at Picker time — another coach's client or a hand-edit in Drive can produce a malformed doc, and merging garbage can execute tombstone removals. Invalid ⇒ status `'error'`, merge nothing.

Error mapping: `401` → clear token, status `needs-reconnect`, no auto-popup. `403 rateLimitExceeded`/`429`/`5xx` → backoff, stay queued. `404`/`trashed` → clear `fileId`, `needs-reconnect`. Network failure → status `offline`, stay queued, silent.

## Auth and Picker

- **Never persist the access token** — in-memory module variable plus expiry. Only `fileId`, last revision, and the outbox are persisted.
- Scope: `https://www.googleapis.com/auth/drive.file` only.
- Both Google scripts are **lazy dynamic loads**, never in `index.html`: GIS (`accounts.google.com/gsi/client`) on first sync attempt, Picker (`apis.google.com/js/api.js`) **only on the Connect click**. Script load failure ⇒ status `offline`, not an error. This is the offline path.
- `requestAccessToken()` opens a popup and is blocked outside a user gesture. So startup **never** auto-popups — it degrades to a Sync button the coach taps.
- On pick, validate the file's JSON before adopting it; refuse rather than overwrite an unrelated file.

## Outbox and sync index

`playbook.outbox.v1`:

```ts
type OutboxEntry =
  | { kind: 'upsert'; playId: string; play: Play; queuedAt: string; attempts: number; lastError?: string }
  | { kind: 'tombstone'; playId: string; deletedAt: string; attempts: number; lastError?: string }
```

The entry carries a **full `Play` snapshot**, not just an id — a queued upload must survive the play being deleted locally afterwards. One entry per playId.

**No sync metadata on `Play`.** `Play` *is* the doc payload; local-only fields there create spurious diffs and pollute the shared file. "Local-only" is derived: in localStorage, absent from `playbook.sync.v1`. This is why `src/types/index.ts` and `PlayStore` need no changes.

## Startup

`useSync()` is called once in `src/App.tsx` and passed down as a prop — matching the existing `editor` prop-drilling idiom. No context, no provider.

```
mount
 └ no fileId -> status 'not-connected'. STOP. Zero network.
 └ else, deferred to idle:
      loadGis()          -> fail: 'offline', silent, stop
      getTokenSilently() -> null: 'needs-reconnect', silent, stop
      flushOutbox(); pull()
```

`PlaysLibrary`'s existing `useEffect(refresh, [])` reading `localPlayStore.getAll()` runs first and unchanged. Nothing awaits before first paint; the Picker CDN is never touched at startup.

`SyncStatus = 'not-connected' | 'offline' | 'idle' | 'pulling' | 'pushing' | 'needs-reconnect' | 'error'`. Only `'error'` renders red — `offline` is normal.

## UI changes (`src/components/PlaysLibrary.tsx`)

Reuse the existing inline-error idiom (`PlaysLibrary.tsx:62`, `<p className="text-xs text-team-defense mt-2">`). **No toast system.**

- **Connect row**: `Connect team playbook` button when `not-connected`; otherwise a status line (`Synced · 2 pending` / `Offline — 2 queued`) plus a `Sync` button.
- **Per-play**: an `Upload` button when `!isSynced(id)`; a muted `↑` glyph when synced.
- **Delete**: two-stage in-row confirm (`Delete for everyone?` → `Yes`/`Cancel`) using local state — no modal component, no new dependency.
- Upload and delete **never await before updating local state**: local write first, enqueue second, network third (fire-and-forget `flushOutbox()`).
- **Re-upload guard**: since the editor reuses the play id on save, uploading an id already in the doc is a no-op with inline copy *"Already uploaded — delete it and create a new play to change it."* Enforce the no-editing rule at the sync boundary; don't touch `usePlayEditor` semantics.

## `MAX_PLAYS = 100`

Keep the constant but narrow its meaning to **local creation only** (existing check at `PlaysLibrary.tsx:27`). It must **never gate a pull**, or teammates' plays get silently dropped. Drop the `/100` from the label once connected.

## PWA

**No change to `vite.config.ts`.** Deliberately add no `runtimeCaching` for `googleapis.com` — a cached stale doc read would be a data-loss bug, since the read-modify-write would build on it. Stated explicitly so nobody adds it later thinking it helps offline.

## Google Cloud setup

1. New project → enable **Drive API** and **Picker API**.
2. OAuth consent screen: External, scope `drive.file` only. `drive.file` is non-sensitive, which should allow publishing without verification — **confirm in the current console UI**; if wrong, the 100-test-user cap applies and onboarding copy changes.
3. OAuth 2.0 Client ID, type **Web application**. Set **Authorized JavaScript origins** (`http://localhost:5173` + prod). It does *not* use redirect URIs.
4. API key restricted by HTTP referrer to those origins and to the Picker API.
5. `.env`: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`. All public by design; the origin/referrer restrictions are the real control.
6. One coach creates `playbook.json` (`{"version":1,"plays":{},"tombstones":{}}`) in the shared folder and shares it with edit rights.

## Implementation order

1. `createdAt` fix in `storage.ts`.
2. `sync/types.ts`, `doc.ts`, `syncIndex.ts`, `outbox.ts` — pure, no network.
3. `googleAuth.ts` + `picker.ts` — Connect button lands a `fileId`.
4. `driveClient.ts`.
5. `engine.ts` — `pull()` first (read-only, safe), then `push()`.
6. `useSync.ts` + `App.tsx` wiring.
7. `PlaysLibrary.tsx` UI.

## Verification

`npx tsc -b --noEmit` after each step is the only automated gate (no test framework exists). Manual matrix in DevTools:

- **Offline render** — DevTools Offline, hard reload: plays render from disk, status `Offline`, no red error, nothing blocks paint.
- **Offline delete → reload → reconnect** — proves outbox persistence, the key requirement.
- **Token expiry** — null the in-memory token, hit Sync: `needs-reconnect`, no popup, no red error.
- **Lost-update race** — two browser profiles, breakpoint one between download and upload: loser stays queued, retries, **no play lost**.
- **Tombstone durability** — delete on A, sync both, sync A again: does not resurrect.
- **Re-upload guard** — load a synced play, save, upload: inline "Already uploaded", doc unchanged.
- **404 recovery** — trash the file in Drive: `needs-reconnect`, Connect re-grants.
- **`MAX_PLAYS`** — with 100 local plays, a pull adding more still succeeds.

## Follow-up (not this change)

Save to memory once out of plan mode: offline reliability is a hard project requirement, because plays are fetched mid-game on bad connections.
