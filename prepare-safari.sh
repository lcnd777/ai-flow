#!/bin/sh
# AI Flow — génère le projet Xcode (app Mac + extension Safari) avec l'intégration native Awake.
# Usage : ./prepare-safari.sh [dossier-de-sortie] [identifiant-bundle]
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo "Cette préparation nécessite un Mac avec Xcode installé." >&2
  exit 1
fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
extension_dir="$script_dir/safari"
native_dir="$script_dir/native"
if [ ! -f "$extension_dir/manifest.json" ]; then
  echo "Dossier « safari » introuvable à côté de ce script." >&2
  exit 1
fi

# Dossier de sortie : jamais d'écrasement, un nouveau nom est choisi automatiquement.
output_dir=${1:-"$script_dir/AI-Flow-Apple"}
if [ -e "$output_dir" ]; then
  n=2
  while [ -e "$output_dir-$n" ]; do n=$((n + 1)); done
  output_dir="$output_dir-$n"
fi
bundle_id=${2:-"com.example.aiflow"}

if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  tool=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  tool=safari-web-extension-converter
else
  echo "Outil Safari introuvable. Installe Xcode puis : sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi
echo "→ Génération du projet Xcode dans : $output_dir"
xcrun "$tool" "$extension_dir" --app-name "AI Flow" --bundle-identifier "$bundle_id" \
  --project-location "$output_dir" --swift --copy-resources --no-open --no-prompt || \
xcrun "$tool" "$extension_dir" --app-name "AI Flow" --bundle-identifier "$bundle_id" \
  --project-location "$output_dir" --swift --copy-resources

# --- Intégration native (Awake, notifications macOS, barre des menus) ---
warn=0
handler=$(find "$output_dir" -name SafariWebExtensionHandler.swift -not -path '*/build/*' | head -n 1)
if [ -n "$handler" ]; then
  cp "$native_dir/SafariWebExtensionHandler.swift" "$handler"
  echo "✓ Composant natif de l'extension installé"
else
  echo "⚠︎ SafariWebExtensionHandler.swift introuvable : copie native/SafariWebExtensionHandler.swift à la main." >&2; warn=1
fi
delegate=$(find "$output_dir" -path '*macOS (App)*' -name AppDelegate.swift | head -n 1)
if [ -n "$delegate" ]; then
  cp "$native_dir/AppDelegate.swift" "$delegate"
  echo "✓ App Mac AI Flow (Awake + barre des menus) installée"
else
  echo "⚠︎ « macOS (App)/AppDelegate.swift » introuvable : copie native/AppDelegate.swift à la main." >&2; warn=1
fi
plist=$(find "$output_dir" -path '*macOS (App)*' -name Info.plist | head -n 1)
if [ -n "$plist" ]; then
  /usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "$plist" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy \
    -c "Add :CFBundleURLTypes array" \
    -c "Add :CFBundleURLTypes:0 dict" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLName string ai.flow.app" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" \
    -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string aiflow" "$plist"
  echo "✓ Schéma aiflow:// déclaré"
else
  echo "⚠︎ Info.plist de l'app Mac introuvable : ajoute le schéma d'URL « aiflow » (Target AI Flow (macOS) › Info › URL Types)." >&2; warn=1
fi
pbx=$(find "$output_dir" -name project.pbxproj | head -n 1)
if [ -n "$pbx" ]; then
  # Barre des menus (symboles SF) et API d'ouverture : macOS 11 minimum.
  sed -i '' -E 's/MACOSX_DEPLOYMENT_TARGET = 10\.[0-9.]+;/MACOSX_DEPLOYMENT_TARGET = 11.0;/g' "$pbx"
fi

project=$(find "$output_dir" -maxdepth 3 -name '*.xcodeproj' | head -n 1)
echo ""
echo "Projet prêt : $project"
echo "Dans Xcode : choisis le schéma « AI Flow (macOS) », Signing › Team (ton compte Apple, gratuit possible), puis ▶︎ Run."
[ "$warn" = 0 ] || echo "Certaines étapes natives sont à terminer à la main (voir ci-dessus et docs/INSTALLATION.md)."
if [ -n "$project" ] && [ "${AIFLOW_NO_OPEN:-0}" != 1 ]; then open "$project"; fi
