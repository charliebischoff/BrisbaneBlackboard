---
name: release
description: Cut a release from the current feature branch — compute the next version tag from the branch prefix, create release/vX.Y.Z, merge main into it, push it, merge it into main, tag, and push. Use when the user asks to "release", "cut a release", "make a release branch", or "tag a new version".
---

# Release

Cut a release from the current feature branch. Run the steps **in order**. If any
command fails, **stop immediately** — do not clean up, do not abort merges, do not
attempt to fix conflicts. Report the failing command and its full output, and tell
the user the repo is left as-is.

Remote is `origin`. Main branch is `main`.

## Step 0 — preflight

1. `git status --porcelain` — must be empty. If not, stop: working tree is dirty.
2. `git rev-parse --abbrev-ref HEAD` — record as `$FEATURE`. If it is `main` or
   already starts with `release/`, stop.
3. `git fetch origin --tags`

## Step 1 — sync main and find its latest tag

```bash
git checkout main
git merge --ff-only origin/main
git tag --merged
```

The `--ff-only` merge guarantees the tag is computed against the real tip of
`origin/main`. If it fails, local `main` has diverged from the remote — **stop**,
report the output, and leave the repo as-is. Do not rebase, reset, or force
anything.

Take the highest tag matching `v<major>.<minor>.<patch>` by numeric comparison of
the three components (not lexical sort). Record as `$LATEST`. If no such tag
exists, stop and ask the user for a starting version.

## Step 2 — compute next version

```bash
git checkout $FEATURE
```

Bump from `$LATEST` based on the `$FEATURE` branch prefix:

| Branch prefix | Bump |
|---|---|
| `feature/…` | minor +1, patch reset to 0 |
| `fix/…` | patch +1 |
| `hotfix/…` | patch +1 |

Major is never bumped. If the branch has none of those prefixes, **stop** and tell
the user the prefix is unrecognized.

Record the result as `$VERSION` (e.g. `v2.10.0`). If a tag `$VERSION` already
exists locally or on origin, stop.

## Step 3 — confirm before touching the remote

Show the user, and get an explicit go-ahead before continuing:

- feature branch, latest tag, bump type, new version
- the exact remaining commands that will run

This is the only confirmation. Everything after it runs straight through.

## Step 4 — build the release branch

```bash
git checkout -b release/$VERSION
git merge main
git push -u origin release/$VERSION
```

A merge conflict here is a failure — stop, leave the conflict in place, report it.

## Step 5 — merge into main and tag

```bash
git checkout main
git merge release/$VERSION
git tag $VERSION
git push origin $VERSION
git push
```

Lightweight tag, not annotated.

## Step 6 — report

State the released version, the release branch pushed, and the current branch
(`main`). Mention the release branch was not deleted.
