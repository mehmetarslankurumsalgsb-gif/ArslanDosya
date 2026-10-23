#!/usr/bin/env bash
# Eski .xls dosyaları için SheetJS'i indirir (GitHub Actions derlemesi sırasında çalışır).
# Excel (.xlsx) ve sunum (.pptx) görüntüleyicileri uygulamanın içinde, indirme gerektirmez.
set -uo pipefail

D=app/src/main/assets/viewer/lib
mkdir -p "$D"

echo "Eski Excel (.xls) okuyucusu indiriliyor..."
if curl -fsSL https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js -o "$D/xlsx.full.min.js"; then
  echo "Tamam."
else
  echo "UYARI: indirilemedi; .xls dosyaları 'Başka uygulamada aç' ile açılabilir."
  rm -f "$D/xlsx.full.min.js"
fi
ls -la "$D"
