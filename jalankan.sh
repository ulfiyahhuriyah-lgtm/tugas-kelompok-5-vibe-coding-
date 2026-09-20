#!/bin/bash
# ============================================================
#  Menjalankan ketiga service sekaligus (Linux / macOS)
#  Pakai: bash jalankan.sh       Hentikan: tekan Ctrl+C
# ============================================================

cd "$(dirname "$0")" || exit 1

hentikan() {
  echo ""
  echo "  Menghentikan seluruh service..."
  kill $PID_USER $PID_BOOK $PID_WEB 2>/dev/null
  wait 2>/dev/null
  echo "  Selesai."
  exit 0
}
trap hentikan INT TERM

echo ""
echo "  Menjalankan user-service  (port 4001) ..."
node user-service/server.js &
PID_USER=$!
sleep 1

echo "  Menjalankan book-service  (port 4002) ..."
node book-service/server.js &
PID_BOOK=$!
sleep 1

echo "  Menjalankan frontend      (port 4000) ..."
node frontend/server.js &
PID_WEB=$!
sleep 2

echo ""
echo "  ============================================================"
echo "   Ketiga service sudah berjalan."
echo ""
echo "   Buka di browser : http://localhost:4000"
echo ""
echo "   Tekan Ctrl+C untuk menghentikan semuanya."
echo "  ============================================================"
echo ""

wait
