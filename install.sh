#!/usr/bin/env bash
# subvocal — installer shim. Forwards every flag to installer/install.js.
#
#   bash install.sh                 install hooks + skills into Claude Code
#   bash install.sh --statusline    also add the [SUBVOCAL] statusline badge
#   bash install.sh --uninstall     remove everything subvocal added
#   bash install.sh --dry-run       show what would change
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "subvocal: Node.js 18+ is required (https://nodejs.org)." >&2
  exit 1
fi
exec node installer/install.js "$@"
