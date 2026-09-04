# vendor/pi — vendored upstream sources

This directory contains a **vendored copy** of the `pi` agent framework
(`@earendil-works/pi-*` packages). It is part of the pnpm workspace
(`vendor/pi/packages/*`) and is built/used like any internal package, but its
upstream lives outside this repository and there is no git metadata here.

## Local modifications

Local patches are applied directly to these sources. Because there is no
upstream remote to diff against, changes are tracked via a content baseline:

- `manifest.json` — SHA-256 of every tracked file.

## Workflow

```bash
# Detect any drift from the baseline (CI-friendly, exit 1 on drift):
node scripts/vendor-pi.cjs check

# After intentionally changing vendored code (or absorbing an upstream drop),
# re-baseline and commit the manifest together with your change:
node scripts/vendor-pi.cjs generate
```

Rules of thumb:

- Keep vendored edits minimal and documented in your commit message.
- Never regenerate the baseline as a side effect of unrelated work.
