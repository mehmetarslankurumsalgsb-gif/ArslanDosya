#!/usr/bin/env bash
# Görüntüleyici kütüphanelerini indirir (GitHub Actions derlemesi sırasında çalışır)
set -euo pipefail

D=app/src/main/assets/viewer/lib
mkdir -p "$D"

echo "Excel kütüphaneleri indiriliyor..."
curl -fsSL https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js -o "$D/exceljs.min.js"
curl -fsSL https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js -o "$D/xlsx.full.min.js"

echo "PowerPoint kütüphanesi (PPTXjs) indiriliyor..."
TMP=$(mktemp -d)
curl -fsSL https://github.com/meshesha/PPTXjs/archive/refs/heads/master.tar.gz -o "$TMP/pptxjs.tgz"
mkdir -p "$TMP/src"
tar -xzf "$TMP/pptxjs.tgz" -C "$TMP/src" --strip-components=1
mkdir -p "$D/pptxjs"
cp -r "$TMP/src/js" "$D/pptxjs/"
cp -r "$TMP/src/css" "$D/pptxjs/"

echo "Hızlı sunum görüntüleyici (pptx-preview) hazırlanıyor..."
B=$(mktemp -d)
if ( cd "$B" \
      && npm init -y >/dev/null \
      && npm install --no-audit --no-fund --silent pptx-preview@1 esbuild@0.23.1 \
      && printf "export { init } from 'pptx-preview';\n" > entry.mjs \
      && npx esbuild entry.mjs --bundle --minify --format=iife --global-name=PptxPreview \
           --platform=browser --outfile=out.js ); then
  cp "$B/out.js" "$D/pptx-preview.js"
else
  echo "UYARI: pptx-preview hazırlanamadı; yedek görüntüleyici (PPTXjs) kullanılacak."
fi

echo "İndirilen dosyalar:"
find "$D" -maxdepth 3 -type f | sort
