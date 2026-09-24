---
name: release
description: Cut a release to the test branch as a release candidate, or promote a passed candidate to main. Computes the version from the branch prefix, tags vX.Y.Z-rc.N on test and vX.Y.Z on promotion. Use when the user asks to "release", "cut a release", "cut an RC", "promote to main", "make a release branch", or "tag a new version".
---

# Release

Two paths, one skill:

- **Test release** — cut `release/vX.Y.Z` from the feature branch, tag it
  `vX.Y.Z-rc.N`, and put it on `test` for testing.
- **Promotion** — a candidate passed on `test`, so tag it `vX.Y.Z` and merge it
  into `main`.

The `-rc` suffix is a semver pre-release identifier: `v1.7.0-rc.1` has *lower*
precedence than `v1.7.0`, so both tags can sit on the same commit and the final
one wins. This is what keeps `git tag --merged main` a truthful answer to "what
shipped" — an untested candidate never wears a plain version number.

Run the steps **in order**. If any command fails, **stop immediately** — do not
clean up, do not abort merges, do not attempt to fix conflicts. Report the
failing command and its full output, and tell the user the repo is left as-is.

**Never delete and re-point an existing tag.** If a tag is wrong, cut the next
one.

Remote is `origin`. Branches are `main` (shipped) and `test` (staging; it runs
ahead of `main`).

## Step 0 — preflight

1. `git status --porcelain` — must be empty. If not, stop: working tree is dirty.
2. `git fetch origin --tags`
3. Ask the user which path this is:
   - **test** — cut a release candidate onto `test`
   - **main** — promote a passed candidate to `main`

   Ask every time. Do not infer it from the branch name or from what was done
   last. Then follow **Path A** or **Path B** below.

## Version numbers

Used by both paths.

`$LATEST` is the highest tag matching `v<major>.<minor>.<patch>` with **no
suffix**, across *all* tags — not just those merged into `main`. Compare the
three components numerically, not lexically. RC tags are ignored here; they are
pre-releases and never advance the baseline. If no final tag exists, stop and ask
the user for a starting version.

Scanning all tags rather than `--merged main` matters: a candidate tagged on
`test` is not reachable from `main` until it is promoted, and a `--merged main`
scan would hand the same number out twice.

---

# Path A — cut a release candidate onto `test`

## A1 — identify the feature branch

`git rev-parse --abbrev-ref HEAD` — record as `$FEATURE`. If it is `main`,
`test`, or already starts with `release/`, stop.

## A2 — compute the version

Bump from `$LATEST` based on the `$FEATURE` branch prefix:

| Branch prefix | Bump |
|---|---|
| `feature/…` | minor +1, patch reset to 0 |
| `fix/…` | patch +1 |
| `hotfix/…` | patch +1 |

Major is never bumped. If the branch has none of those prefixes, **stop** and
tell the user the prefix is unrecognized.

Record the result as `$VERSION` (e.g. `v1.7.0`). If a tag `$VERSION` already
exists (with no suffix), stop — that version has shipped.

## A3 — pick the RC number

```bash
git tag --list "$VERSION-rc.*"
```

`$RC` is `$VERSION-rc.<N>` where `N` is the highest existing RC number for this
version plus one, or `1` if there are none. Parse the trailing integer and
compare it **numerically**, the same as `$LATEST` — a lexical read of the tag
list sorts `rc.9` above `rc.10` and would re-issue a number that already exists. Re-cutting after a failed test round
is the normal way to reach `rc.2` — that is expected, not an error.

## A4 — build the release branch

If `release/$VERSION` already exists, this is a re-cut: check it out and confirm
it contains `$FEATURE`'s tip (`git merge-base --is-ancestor $FEATURE release/$VERSION`).
If it does not, **stop** — two different branches are competing for one version
number, and the user has to decide which one owns it.

Otherwise create it:

```bash
git checkout -b release/$VERSION $FEATURE
```

Then merge the branch it is going into:

```bash
git merge origin/test
```

`test` runs ahead of `main`, so merging it here is what surfaces conflicts during
the cut instead of at the push. A merge conflict is a failure — stop, leave the
conflict in place, report it.

## A5 — confirm before touching the remote

Show the user, and get an explicit go-ahead before continuing:

- feature branch, `$LATEST`, bump type, `$VERSION`, `$RC`
- whether this is a fresh cut or a re-cut of an existing release branch
- the exact remaining commands that will run

This is the only confirmation. Everything after it runs straight through.

## A6 — push and land on `test`

```bash
git push -u origin release/$VERSION
```

Then merge into `test`. There may be no local `test` branch — create one from the
remote if needed (`git checkout -b test origin/test`), otherwise check it out and
`git merge --ff-only origin/test` first. A non-fast-forward there means local
`test` has diverged: **stop**, report it, change nothing.

```bash
git merge release/$VERSION
git push origin test
```

## A7 — tag the candidate

Only once `test` has the commit:

```bash
git tag $RC release/$VERSION
git push origin $RC
```

Lightweight tag, not annotated. Tagging last is deliberate — if the merge into
`test` fails, no RC tag has been published, so the retry reuses `rc.N` instead of
burning it. (The no-re-point rule means a published tag can never be moved.)

## A8 — report

State `$RC`, the release branch pushed, that it is now on `test`, and the current
branch. Tell the user the candidate is not on `main` and carries no final version
tag until it is promoted — run this skill again with target **main** once it
passes.

---

# Path B — promote a passed candidate to `main`

## B1 — find the candidate

List release branches whose version has RC tags but **no** final tag, and that
are not yet merged into `main`. If there are none, stop — there is nothing to
promote.

If there is exactly one, name it and carry on. If there is more than one,
**default to the highest version** and show the user the full list so they can
override. More than one is the normal signature of an abandoned candidate: a
branch that was cut and tagged `rc.N` but never promoted stays in this list
forever, since nothing deletes it. Picking an older one is allowed — it is the
user's call, not a condition to stall on.

Record the version as `$VERSION` and the branch as `release/$VERSION`.

## B2 — sync main

```bash
git checkout main
git merge --ff-only origin/main
```

If this fails, local `main` has diverged from the remote — **stop**, report the
output, and leave the repo as-is. Do not rebase, reset, or force anything.

## B3 — confirm before touching the remote

Show the user, and get an explicit go-ahead:

- `$VERSION`, the release branch, and the RC tags it already carries
- confirmation from them that it passed on `test`
- the exact remaining commands that will run

This is the only confirmation.

## B4 — merge and tag

```bash
git merge release/$VERSION
git tag $VERSION release/$VERSION
git push origin $VERSION
git push
```

Only the release branch is merged — `test` may carry other unreleased work, and
that is not part of this release.

The tag goes on the release branch's tip, the same commit the RC was cut from,
not on the merge commit. After the merge that commit is an ancestor of `main`, so
the tag is reachable from `main` either way. Lightweight tag, not annotated.

A merge conflict is a failure — stop, leave the conflict in place, report it.

## B5 — report

State the released version, that it was promoted from which RC, the release
branch (not deleted), and the current branch (`main`).
