@echo off
REM ============================================================
REM  Menghentikan seluruh service yang sedang berjalan.
REM  Pakai ini bila muncul error EADDRINUSE (port sudah dipakai).
REM ============================================================

echo.
echo  Menghentikan seluruh proses Node...
taskkill /F /IM node.exe >nul 2>&1

if errorlevel 1 (
    echo  Tidak ada proses Node yang sedang berjalan.
) else (
    echo  Selesai. Port 4000, 4001, dan 4002 sudah bebas.
)

echo.
pause
