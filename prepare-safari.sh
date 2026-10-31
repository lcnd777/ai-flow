#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo "Cette préparation nécessite un Mac avec Xcode installé." >&2
  exit 1
fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# Works from either the Safari ZIP or the source checkout after npm run build.
if [ -d "$script_dir/safari" ]; then
  extension_dir="$script_dir/safari"
else
  extension_dir="$script_dir/../dist/safari"
fi
if [ ! -f "$extension_dir/manifest.json" ]; then
  echo "Dossier Safari absent. Depuis les sources : npm run build." >&2
  exit 1
fi
output_dir=${1:-"$script_dir/AI-Flow-Apple"}
bundle_id=${2:-"com.example.aiflow"}
if [ -e "$output_dir" ]; then
  echo "Le dossier cible existe déjà : choisir un nouveau chemin pour préserver son contenu." >&2
  exit 1
fi
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  tool=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  tool=safari-web-extension-converter
else
  echo "Outil Safari introuvable. Sélectionner Xcode dans xcode-select." >&2
  exit 1
fi
xcrun "$tool" "$extension_dir" --app-name "AI Flow" --bundle-identifier "$bundle_id" --project-location "$output_dir" --swift --copy-resources
