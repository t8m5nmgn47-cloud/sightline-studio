# Retired design modules

Retired 2026-07-13, after Phase A2 ported the looks that mattered — statement (bold),
hearth, the editorial splits, and luxe — into `engine/site-engine.mjs`. Nothing imports
these anymore; the templates remain only as art-direction reference. Do not wire them
back in. Plan: `MIGRATION-PLAN-ENGINE-CONVERGE.md`; the git tag `pre-converge` holds
the last state where these were live.
