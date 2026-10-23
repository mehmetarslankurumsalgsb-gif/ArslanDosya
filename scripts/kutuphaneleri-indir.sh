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

echo "İndirilen dosyalar:"
find "$D" -maxdepth 3 -type f | sort
