#!/bin/bash
cd "$(dirname "$0")"

for f in .pid.api .pid.ui; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null && rm "$f"
done

echo "Home TV stopped"
