#!/usr/bin/env bash
# Regenerate every prospect demo through the current engine and publish to
# preview-verticals/<slug>/. Usage: bash engine/regen-all.sh [slug ...]
# With no args, does every top-level *-com/*-net/*-org dir (excluding --variants).
set -uo pipefail
cd "$(dirname "$0")/.."
slugs=("$@")
if [ ${#slugs[@]} -eq 0 ]; then
  slugs=($(ls -d *-com *-net *-org 2>/dev/null | grep -v -- '--'))
fi
ok=0; fail=0; summary=""
for slug in "${slugs[@]}"; do
  domain=$(echo "$slug" | sed -E 's/-(com|net|org)$/.\1/')
  out=$(node engine/pipeline.mjs "$domain" 2>/dev/null)
  line=$(echo "$out" | grep -E 'pack:|recipe:' | tr '\n' ' ')
  if [ -f "demos/$slug/index.html" ]; then
    mkdir -p "preview-verticals/$slug"
    cp "demos/$slug/index.html" "preview-verticals/$slug/index.html"
    ok=$((ok+1)); summary+="OK   $slug  ${line}\n"
  else
    fail=$((fail+1)); summary+="MISS $slug  (no demo produced)\n"
  fi
done
echo -e "$summary"
echo "== done: $ok published, $fail missing =="
