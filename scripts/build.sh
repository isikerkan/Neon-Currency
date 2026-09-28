#!/usr/bin/env bash
# Packages the extension for Chrome / the Chrome Web Store: manifest.json + src/ only.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/neon-currency-v${version}.zip"

rm -rf dist
mkdir -p dist
zip -q -r -X "$out" manifest.json src -x "*.DS_Store"
echo "$out"
