@echo off
REM ============================================================
REM  Menjalankan ketiga service sekaligus (Windows)
REM  Klik dua kali berkas ini dari folder INDUK proyek.
REM ============================================================

cd /d "%~dp0"

if not exist "user-service\server.js" goto :salahfolder
if not exist "book-service\server.js" goto :salahfolder
if not exist "frontend\server.js"     goto :salahfolder

echo.
echo  Memeriksa proses Node yang masih berjalan...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if not errorlevel 1 (
    echo.
    echo  Ditemukan proses Node yang masih aktif.
    echo  Proses tersebut perlu dihentikan agar port 4000-4002 bebas.
    echo.
    choice /C YN /M "  Hentikan dan lanjutkan"
    if errorlevel 2 goto :batal
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo  Menjalankan user-service  (port 4001) ...
pushd user-service
start "user-service" cmd /k node server.js
popd
timeout /t 2 /nobreak >nul

echo  Menjalankan book-service  (port 4002) ...
pushd book-service
start "book-service" cmd /k node server.js
popd
timeout /t 2 /nobreak >nul

echo  Menjalankan frontend      (port 4000) ...
pushd frontend
start "frontend" cmd /k node server.js
popd
timeout /t 3 /nobreak >nul

echo.
echo  ============================================================
echo   Ketiga service sudah berjalan di jendela masing-masing.
echo   JANGAN tutup ketiga jendela itu selama aplikasi dipakai.
echo.
echo   Buka di browser : http://localhost:4000
echo.
echo   Untuk menghentikan semuanya, jalankan hentikan.bat
echo  ============================================================
echo.

start "" "http://localhost:4000"
goto :selesai

:salahfolder
echo.
echo  ============================================================
echo   BERKAS INI HARUS BERADA DI FOLDER INDUK PROYEK,
echo   yaitu folder yang berisi user-service, book-service,
echo   dan frontend.
echo.
echo   Folder saat ini: %CD%
echo  ============================================================
goto :selesai

:batal
echo.
echo  Dibatalkan. Tidak ada service yang dijalankan.

:selesai
echo.
pause
