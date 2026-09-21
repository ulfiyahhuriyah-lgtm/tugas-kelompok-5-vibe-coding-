# Sistem Peminjaman Buku Perpustakaan — Microservice Edition

Pengembangan lanjutan dari prototype praktikum sebelumnya (single-page + localStorage) menjadi **arsitektur microservice** dengan komunikasi antar-service melalui API, sesuai tugas *"Mengembangkan proyek kelompok sebelumnya menjadi aplikasi berbasis microservice dengan memanfaatkan AI Coding Tool."*

> Dokumentasi terkait:
> - \[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — diagram arsitektur sebelum \& sesudah, sequence diagram alur pinjam buku
> - \[`docs/AI\_USAGE.md`](docs/AI\_USAGE.md) — bagaimana AI Coding Tool digunakan \& bug yang ditemukan/diperbaiki
> - \[`docs/PROMPTS.md`](docs/PROMPTS.md) — seluruh prompt yang digunakan selama pengembangan

## Daftar Isi

* [Ringkasan Perubahan](#ringkasan-perubahan)
* [Arsitektur](#arsitektur)
* [Technology Stack](#technology-stack)
* [User Story \& Acceptance Criteria](#user-story--acceptance-criteria-dipakai-ulang-dari-praktikum-sebelumnya)
* [Struktur Repository](#struktur-repository)
* [Cara Menjalankan](#cara-menjalankan)
* [API Documentation](#api-documentation)
* [Kontribusi Anggota Kelompok](#kontribusi-anggota-kelompok)

## Ringkasan Perubahan

|Aspek|Sebelum (Praktikum RE)|Sesudah (Microservice)|
|-|-|-|
|Arsitektur|Monolith 1 halaman (`index.html` + `script.js`)|2 microservice + 1 frontend, saling terpisah|
|Penyimpanan|Browser `localStorage`|In-memory per-service (mudah diganti ke DB sungguhan)|
|Login|Divalidasi di client, disimpan di `localStorage`|`user-service` menerbitkan token; `book-service` **memvalidasi token via API** ke `user-service`|
|Business rules (AC-01/02/03)|Dijalankan di `script.js` (client)|Dijalankan di `book-service` (server), tidak bisa dilewati dari client|
|Komunikasi|Tidak ada (satu file)|REST API antar-service (lihat [ARCHITECTURE.md](docs/ARCHITECTURE.md))|

## Arsitektur

Ringkas (lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk diagram lengkap):

```
\[ Frontend (HTML/JS) ]
        │
        ├── POST /api/login ─────────────► \[ user-service :4001 ]
        │                                          ▲
        │                                          │ GET /api/validate?token=...
        │                                          │ (verifikasi identitas)
        └── GET/POST /api/books, /api/loans ──► \[ book-service :4002 ] ──┘
```

* **user-service** — satu-satunya pemilik data identitas mahasiswa \& sesi login.
* **book-service** — pemilik data buku \& transaksi peminjaman; **tidak pernah mempercayai `nim` yang dikirim langsung dari client**, melainkan memverifikasi token ke `user-service` lebih dulu (lihat [AI\_USAGE.md](docs/AI_USAGE.md) untuk cerita bug ini).

## Technology Stack

|Layer|Teknologi|Alasan|
|-|-|-|
|Bahasa|Node.js (JavaScript)|Konsisten dengan stack sebelumnya (JS), mudah dijalankan tanpa setup rumit|
|Server HTTP|Node.js core `http` module (tanpa Express)|Menghindari dependency eksternal — cukup `node server.js`, tidak perlu `npm install`|
|Komunikasi antar-service|REST API (JSON over HTTP), `fetch()` bawaan Node 18+|Sederhana, sesuai ketentuan "antarservice berkomunikasi menggunakan API"|
|Frontend|HTML5, CSS3, Vanilla JavaScript|Dilanjutkan dari stack praktikum sebelumnya|
|Penyimpanan data|In-memory (per-service)|Cukup untuk prototype; terpisah rapi per service, mudah diganti ke database sungguhan per service tanpa mengubah service lain|
|Containerization (opsional)|Docker + docker-compose|Menunjukkan setiap service dapat dijalankan \& di-deploy independen|

Boleh dikembangkan/diubah sesuai kebutuhan kelompok (misalnya diganti ke Express + MongoDB per service) — struktur di atas adalah baseline yang sudah terverifikasi berjalan.

## User Story \& Acceptance Criteria (dipakai ulang dari praktikum sebelumnya)

**User Story** — disalin apa adanya dari praktikum Requirement Engineering, tidak diubah maupun dinomori ulang:

|ID|User Story|
|-|-|
|US-01|Sebagai mahasiswa, saya ingin login menggunakan NIM dan nama saya, sehingga hanya saya yang dapat mengakses dan mengelola peminjaman buku saya sendiri.|
|US-02|Sebagai mahasiswa, saya ingin melihat daftar buku beserta status ketersediaannya (tersedia/dipinjam), sehingga saya dapat memilih buku yang ingin dipinjam tanpa salah pilih.|
|US-03|Sebagai mahasiswa, saya ingin meminjam buku yang berstatus tersedia, sehingga saya dapat membaca buku tersebut selama masa peminjaman 7 hari.|
|US-04|Sebagai mahasiswa, saya ingin melihat informasi peminjaman saya (tanggal pinjam dan jatuh tempo), sehingga saya dapat mengembalikan buku tepat waktu.|

**Acceptance Criteria** — juga dipakai ulang tanpa perubahan:

|ID|Given / Kondisi|When / Aksi|Then / Hasil|
|-|-|-|-|
|AC-01|Mahasiswa sudah login dan buku berstatus tersedia|Mahasiswa menekan tombol "pinjam"|Buku berhasil dipinjam, status buku berubah menjadi dipinjam, dan tanggal jatuh tempo dihitung 7 hari dari tanggal pinjam|
|AC-02|Mahasiswa sudah memiliki 3 buku aktif|Mahasiswa mencoba meminjam buku ke-4|Peminjaman ditolak dan sistem menampilkan pesan bahwa batas maksimal sudah tercapai|
|AC-03|Buku sedang dipinjam oleh mahasiswa lain|Mahasiswa mencoba meminjam buku tersebut|Peminjaman ditolak dan sistem menampilkan pesan bahwa buku tidak tersedia|
|AC-04|Mahasiswa memiliki buku yang sedang dipinjam|Mahasiswa membuka tab "Peminjaman Saya"|Sistem menampilkan judul buku, tanggal pinjam, dan tanggal jatuh tempo untuk setiap buku aktif|

**Pemetaan ke service pada versi microservice ini:**

|Requirement|Ditangani oleh|Bukti pengujian|
|-|-|-|
|US-01|`user-service` (`POST /api/login`)|`\[LULUS] US-01 login menerbitkan token`|
|US-02|`book-service` (`GET /api/books`)|`\[LULUS] US-02 daftar buku tampil (6 buku)`|
|US-03 / AC-01|`book-service` (`POST /api/books/:id/borrow`)|`\[LULUS] AC-01 pinjam buku tersedia (HTTP 201)`|
|AC-02|`book-service` (hitung pinjaman aktif di server)|`\[LULUS] AC-02 buku ke-4 ditolak (HTTP 409)`|
|AC-03|`book-service` (cek ketersediaan di server)|`\[LULUS] AC-03 buku sudah dipinjam ditolak (HTTP 409)`|
|US-04 / AC-04|`book-service` (`GET /api/loans?token=`)|`\[LULUS] AC-04 lihat peminjaman saya (3 loan aktif)`|

Keempat AC kini diuji ulang **di level API**, bukan hanya lewat tampilan, karena seluruh
aturan bisnis sudah dipindahkan ke sisi server. Jalankan `python3 tests/uji\_verifikasi.py`
untuk memverifikasinya sendiri.

**Catatan tambahan dari praktikum sebelumnya.** Review requirement waktu itu menemukan
satu celah: tidak ada fitur "kembalikan buku" sama sekali, padahal tanpanya sistem menjadi
buntu permanen begitu mahasiswa meminjam 3 buku. Celah tersebut sudah ditutup pada versi
ini melalui `POST /api/loans/:id/return`, lengkap dengan verifikasi kepemilikan.

## Struktur Repository

```
perpustakaan-microservice/
├── README.md
├── docker-compose.yml
├── .gitignore
├── docs/
│   ├── ARCHITECTURE.md      # diagram before/after + sequence diagram
│   ├── AI\_USAGE.md          # dokumentasi penggunaan AI Coding Tool + bug yang ditemukan
│   ├── PROMPTS.md           # seluruh prompt yang digunakan
│   └── GITHUB\_SETUP.md      # panduan push \& kontribusi anggota
├── tests/
│   ├── audit\_ketentuan.py    # audit 9 ketentuan tugas terhadap isi repo
│   ├── uji\_fitur\_v2.py       # fitur baru: cari, saring, riwayat, sisa hari
│   ├── uji\_antarmuka\_v2.py   # keselarasan HTML/CSS/JS + keamanan
│   ├── uji\_verifikasi.py     # regresi AC-01..04 + verifikasi bug tertutup
│   ├── uji\_alur\_frontend.py  # simulasi alur browser end-to-end
│   └── uji\_adversarial.py    # skrip yang dipakai MENEMUKAN bug tersebut
├── user-service/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── book-service/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
└── frontend/
    ├── index.html
    ├── style.css
    ├── config.js
    ├── app.js
    ├── server.js
    └── Dockerfile
```

## Fitur Hasil Pengembangan (v2)

|Fitur|Keterangan|
|-|-|
|Pencarian katalog|Cari judul, penulis, atau kategori. Dijalankan di **book-service**, bukan di browser|
|Penyaringan|Saring berdasarkan kategori dan ketersediaan|
|Data buku diperkaya|Kategori, tahun terbit, ISBN, dan sinopsis|
|Riwayat pengembalian|Endpoint `GET /api/loans/history?token=` beserta panelnya|
|Sisa hari \& keterlambatan|Dihitung di server agar seluruh client memakai acuan waktu yang sama|
|Indikator status layanan|Lampu hidup/mati tiap microservice, diperbarui tiap 15 detik|
|Penanganan kegagalan|Bila sebuah service mati, halaman menjelaskan penyebab dan cara mengatasinya|
|Antarmuka baru|Bertema kartu katalog perpustakaan dengan slip tanggal kembali bercap|
|Responsif|Menyesuaikan layar ponsel|

## Cara Menjalankan

> \*\*Ketiga service harus berjalan bersamaan.\*\* Frontend hanya menampilkan
> tampilan; data buku berasal dari `book-service` dan identitas dari `user-service`.
> Bila salah satunya mati, panel di halaman akan kosong.

### Opsi A — Pintasan satu klik (paling mudah)

**Windows** — klik dua kali dari folder induk proyek:

```
jalankan.bat      # menyalakan ketiganya + membuka browser
hentikan.bat      # menghentikan semuanya
```

**Linux / macOS**:

```bash
bash jalankan.sh  # Ctrl+C untuk menghentikan semuanya
```

`jalankan.bat` memeriksa lebih dulu apakah masih ada proses Node yang berjalan,
dan menawarkan untuk menghentikannya agar port 4000–4002 bebas. Ini mencegah
error `EADDRINUSE`.

### Opsi B — Manual (3 terminal, tanpa Docker)

Tidak perlu `npm install` — seluruh service hanya memakai modul inti Node.js.
Jalankan setiap perintah dari **folder induk proyek**, masing-masing di terminal
terpisah, dan biarkan ketiganya tetap terbuka:

```bash
# Terminal 1
cd user-service \&\& node server.js
# -> \[user-service] berjalan di http://localhost:4001

# Terminal 2
cd book-service \&\& node server.js
# -> \[book-service] berjalan di http://localhost:4002

# Terminal 3
cd frontend \&\& node server.js
# -> \[frontend] berjalan di http://localhost:4000
```

Buka **http://localhost:4000** di browser.

### Masalah yang Sering Terjadi

|Gejala|Penyebab|Solusi|
|-|-|-|
|`EADDRINUSE: address already in use :::4001`|Service sudah berjalan di terminal lain, atau ada proses Node tersangkut|Jalankan `hentikan.bat`, atau di PowerShell: `Get-Process node \| Stop-Process -Force`|
|`cd : Cannot find path ...`|Menjalankan `cd book-service` saat masih berada di dalam `user-service`|Naik dulu satu tingkat: `cd ..` lalu `cd book-service`|
|Panel **Daftar Buku** kosong padahal sudah login|`book-service` belum dijalankan|Jalankan `book-service`, lalu muat ulang halaman|
|`ERR\_CONNECTION\_REFUSED` di browser|Tidak ada service yang berjalan di port tersebut|Jalankan servicenya|
|`localhost:4001` menampilkan `{"error":"Endpoint tidak ditemukan."}`|**Bukan error.** Port 4001 dan 4002 adalah API, bukan halaman web|Cek kesehatannya di `/api/health`. Halaman yang dibuka di browser hanya `localhost:4000`|

### Opsi B — Docker Compose

```bash
docker compose up --build
```

Membangun dan menjalankan ketiga service sekaligus (frontend di :4000, user-service di :4001, book-service di :4002).

### Testing Manual (curl)

```bash
# 1. Login -> dapatkan token
curl -X POST http://localhost:4001/api/login \\
  -H "Content-Type: application/json" \\
  -d '{"nim":"2023001","nama":"Budi Santoso"}'

# 2. Lihat daftar buku
curl http://localhost:4002/api/books

# 3. Pinjam buku (ganti TOKEN dengan hasil langkah 1)
curl -X POST http://localhost:4002/api/books/B001/borrow \\
  -H "Content-Type: application/json" \\
  -d '{"token":"TOKEN"}'

# 4. Coba pinjam buku yang sama lagi -> harus ditolak (AC-03)
# 5. Pinjam 3 buku berbeda lalu coba buku ke-4 -> harus ditolak (AC-02)

# 6. Lihat peminjaman sendiri (butuh token, bukan nim)
curl "http://localhost:4002/api/loans?token=TOKEN"

# 7. Kembalikan buku (butuh token milik peminjam)
curl -X POST http://localhost:4002/api/loans/LOAN\_ID/return \\
  -H "Content-Type: application/json" \\
  -d '{"token":"TOKEN"}'

# 8. Coba return TANPA token -> harus 401
# 9. Coba return pakai token mahasiswa lain -> harus 403
```

### Menjalankan Skrip Pengujian Otomatis

Repo ini menyertakan skrip pengujian end-to-end yang menjalankan service,
menguji AC-01 s/d AC-04 sekaligus memverifikasi bug yang ditemukan pada ronde
review sudah tertutup, lalu mematikan service kembali:

```bash
python3 tests/uji\_verifikasi.py
# -> RINGKASAN: 21 LULUS, 0 GAGAL

python3 tests/uji\_alur\_frontend.py
# -> RINGKASAN ALUR BROWSER: 20 LULUS, 0 GAGAL

python3 tests/audit\_ketentuan.py
# -> HASIL AUDIT: 41 OK, 0 GAGAL

python3 tests/uji\_fitur\_v2.py
# -> RINGKASAN FITUR v2: 25 LULUS, 0 GAGAL

python3 tests/uji\_antarmuka\_v2.py
# -> RINGKASAN KESELARASAN: 27 LULUS, 0 GAGAL
```

Total **134 pengujian**, seluruhnya lulus.

|Skrip|Isi|
|-|-|
|`tests/audit\_ketentuan.py`|Memeriksa kesembilan ketentuan tugas terhadap isi repo yang sebenarnya|
|`tests/uji\_fitur\_v2.py`|Fitur hasil pengembangan: pencarian, penyaringan, riwayat, sisa hari, otorisasi|
|`tests/uji\_antarmuka\_v2.py`|Keselarasan HTML, CSS, JavaScript, dan keamanan penyisipan data|
|`tests/uji\_verifikasi.py`|Regresi AC-01 s/d AC-04 + verifikasi bug ronde 2 sudah tertutup|
|`tests/uji\_alur\_frontend.py`|Meniru urutan pemanggilan `app.js` di browser: muat aset → login → render → pinjam → kembalikan → sesi kedaluwarsa|
|`tests/uji\_adversarial.py`|Skrip yang dipakai **menemukan** empat bug ronde 2 tersebut|

Total **6 bug** ditemukan dan diperbaiki selama pengembangan. Rinciannya beserta
bukti pengujian sebelum dan sesudah perbaikan ada di
[`docs/AI\_USAGE.md`](docs/AI_USAGE.md).

Ketiganya menjalankan service sendiri lalu mematikannya kembali, jadi cukup satu perintah
tanpa perlu membuka terminal terpisah.

```

Skenario lengkap (termasuk hasil aktual saat pengembangan) ada di \[`docs/AI\_USAGE.md`](docs/AI\_USAGE.md).

## API Documentation

### user-service (`:4001`)
| Method | Endpoint | Body / Query | Balasan |
|---|---|---|---|
| POST | `/api/login` | `{ nim, nama }` | `{ token, user }` |
| GET | `/api/validate` | `?token=...` | `{ valid, user }` atau `401` |
| GET | `/api/health` | — | `{ status: "ok" }` |

### book-service (`:4002`)
| Method | Endpoint | Body / Query | Balasan |
|---|---|---|---|
| GET | `/api/books` | — | `{ books: \[...] }` |
| GET | `/api/loans` | `?token=...` | `{ loans: \[...] }` / `401` |
| POST | `/api/books/:id/borrow` | `{ token }` | `{ loan, book }` / `401` / `409` |
| POST | `/api/loans/:id/return` | `{ token }` | `{ loan, book }` / `401` / `403` / `404` / `409` |
| GET | `/api/health` | — | `{ status: "ok" }` |

Seluruh endpoint yang menyentuh data milik mahasiswa (`/api/loans`, `borrow`, `return`)
\*\*wajib\*\* menyertakan `token` dan divalidasi lebih dulu ke `user-service`. Tidak ada
endpoint yang menerima `nim` mentah dari client — lihat \[`AI\_USAGE.md`](docs/AI\_USAGE.md)
ronde 2 untuk alasannya.

`book-service` memanggil `GET user-service/api/validate` \*\*secara internal\*\* setiap kali `/api/books/:id/borrow` dipanggil — inilah komunikasi antar-service yang dipersyaratkan tugas ini.

## Kontribusi Anggota Kelompok

\*\*Kelompok 5\*\*

> Pembagian di bawah ini adalah usulan — \*\*sesuaikan dengan pembagian kerja yang
> sebenarnya\*\*, lalu pastikan setiap anggota benar-benar melakukan commit/push
> sendiri ke repository ini (bukan hanya satu orang mengunggah semuanya), sesuai
> ketentuan tugas \*"setiap anggota wajib memiliki kontribusi."\*
> Langkah teknisnya ada di \[`docs/GITHUB\_SETUP.md`](docs/GITHUB\_SETUP.md).

| Nama | NIM | Kontribusi |
|---|---|---|
| Muhammad Ridho | 2441919061 | Implementasi `user-service`, setup repository |
| Huriyah Ulfiah | 2441919054 | Implementasi `book-service` (business rules AC-01/02/03) |
| Jayanti Firdasari | 2441919023 | Integrasi antar-service \& perbaikan validasi token |
| Yuliani | 2441919005 | Frontend (HTML/CSS/JS) \& penyesuaian kontrak API |
| Sri Rahmayanti Sahar | 2441919022 | Pengujian (`tests/`), diagram arsitektur \& dokumentasi |

