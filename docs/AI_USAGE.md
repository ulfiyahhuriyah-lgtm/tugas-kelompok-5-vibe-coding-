# Dokumentasi Penggunaan AI Coding Tool

## AI Coding Tool yang Digunakan
**Claude (Anthropic)** — digunakan sebagai AI Coding Tool untuk seluruh siklus pengembangan: mulai dari mengusulkan pemecahan arsitektur monolith menjadi microservice, menulis kode awal kedua service dan frontend, hingga meninjau ulang (review) dan memperbaiki kode yang dihasilkannya sendiri sebelum dianggap final.

## Bagaimana AI Membantu Proses Pengembangan

1. **Desain arsitektur** — AI diminta mengusulkan pembagian layanan minimal 2 microservice berdasarkan User Story dan Acceptance Criteria yang sudah ada dari praktikum sebelumnya (US-01 s/d US-04, AC-01 s/d AC-04). Hasilnya: pemisahan berdasarkan *bounded context* — identitas mahasiswa (`user-service`) terpisah dari katalog & transaksi buku (`book-service`).
2. **Implementasi service** — AI menulis boilerplate HTTP server, routing, dan business logic untuk masing-masing service menggunakan modul inti Node.js (tanpa framework), sesuai preferensi kelompok untuk menjaga stack tetap ringan.
3. **Integrasi antar-service** — AI mengimplementasikan pemanggilan API dari `book-service` ke `user-service` (`GET /api/validate`) menggunakan `fetch()` bawaan Node 18+.
4. **Frontend** — AI menulis ulang `app.js` supaya memanggil kedua service via `fetch()`, menggantikan logika `localStorage`-only pada versi monolith.
5. **Pengujian** — AI menjalankan kedua service secara lokal dan menguji seluruh endpoint dengan `curl` end-to-end (login → cek token → pinjam buku → cek AC-02/AC-03) sebelum kode difinalisasi.

## Masalah / Kesalahan yang Ditemukan dari Hasil AI (Requirement #9: wajib diperiksa, jangan langsung dipakai)

### Bug: `book-service` awalnya mempercayai `nim` langsung dari client

**Kondisi awal (hasil AI, sebelum ditinjau):**
Draf pertama `POST /api/books/:id/borrow` menerima body `{ nim, bookId }` dan langsung memakai `nim` tersebut untuk mengecek batas 3 buku dan mencatat peminjaman — **tanpa memverifikasi ke `user-service` apakah `nim` tersebut memang cocok dengan pengguna yang sedang login.**

```js
// Versi awal (BERMASALAH) — disederhanakan
function borrowBook(req, res, nim, bookId) {
  // nim diambil langsung dari body request, tanpa verifikasi
  const activeCount = getActiveLoanCount(nim);
  if (activeCount >= MAX_ACTIVE_BOOKS) { ... }
  // ...proses pinjam menggunakan nim yang dikirim client...
}
```

**Mengapa ini salah:**
Ini adalah kesalahan klasik pada microservice hasil AI: setiap service **harus** memverifikasi identitas lewat service pemilik data identitas (`user-service`), bukan mempercayai input klien. Dengan implementasi awal ini, siapa pun bisa mengirim `nim` mahasiswa lain di body request dan meminjam buku *atas nama* mahasiswa tersebut tanpa pernah login — melanggar requirement dasar *"Students must log in"*, meskipun secara kebetulan AC-01/02/03 (aturan jumlah buku & ketersediaan) tetap tampak "berfungsi" karena logikanya sendiri benar.

**Cara ditemukan:**
Ditinjau dengan pertanyaan: *"Apa yang mencegah client mengklaim menjadi mahasiswa manapun?"* — jawabannya: tidak ada, karena `book-service` tidak pernah menghubungi `user-service`.

**Perbaikan yang diterapkan (kode final, lihat `book-service/server.js`):**
```js
async function validateToken(token) {
  const response = await fetch(`${USER_SERVICE_URL}/api/validate?token=${token}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.valid ? data.user : null;
}

// Endpoint borrow sekarang WAJIB memvalidasi token ke user-service dulu:
const user = await validateToken(body.token);
if (!user) return sendJSON(res, 401, { error: 'Token tidak valid...' });
// nim diambil dari hasil validasi user-service, BUKAN dari body client
```

**Verifikasi perbaikan:** diuji dengan mengirim `token` acak/tidak terdaftar ke `POST /api/books/:id/borrow` — hasilnya `401 Unauthorized` dan **tidak ada** data peminjaman yang tercatat (lihat hasil pengujian di bawah).

```
== borrow with bad token (should fail 401) ==
{"error":"Token tidak valid. Silakan login ulang."}
```

Ini sekaligus menjadi bukti konkret komunikasi antar-service (Ketentuan #8) bekerja sebagai kontrol keamanan, bukan sekadar formalitas.

---

## RONDE REVIEW KEDUA — 4 Bug Tambahan yang Lolos dari Review Pertama

> Penomoran mengikuti laporan: **Bug #1** adalah temuan ronde pertama di atas
> (endpoint `borrow` mempercayai NIM dari client). Bug #2 s/d #5 di bawah adalah
> temuan ronde kedua, dan **Bug #6** ditemukan belakangan dari pemakaian nyata.

Setelah bug validasi token di atas diperbaiki, kode **diuji ulang secara adversarial**
(bukan sekadar menguji "jalur bahagia" AC-01/02/03). Pertanyaan yang dipakai:
*"perbaikan tadi diterapkan di endpoint borrow — apakah endpoint LAIN mendapat
perlakuan yang sama?"* Ternyata tidak. Empat bug baru ditemukan dan seluruhnya
**terbukti lewat pengujian nyata**, bukan dugaan.

### Bug #2 (KRITIS) — Endpoint `return` sama sekali tidak memvalidasi token

**Kondisi awal:**
```js
// book-service/server.js — versi bermasalah
const returnMatch = path.match(/^\/api\/loans\/([^/]+)\/return$/);
if (returnMatch && req.method === 'POST') {
  const loanId = returnMatch[1];
  const loan = loans.find(l => l.id === loanId);   // langsung diproses
  if (!loan) return sendJSON(res, 404, {...});
  loan.status = 'returned';                         // tanpa cek siapa yang minta
  ...
}
```

**Mengapa salah:** perbaikan ronde pertama hanya diterapkan pada `borrow`. Endpoint
`return` tetap menerima permintaan **tanpa token apa pun**, sehingga siapa saja yang
mengetahui sebuah `loanId` dapat memaksa pengembalian buku milik mahasiswa lain.
Ini adalah pola khas kode hasil AI: perbaikan diterapkan di tempat yang ditunjuk saja,
tidak dirambatkan ke seluruh endpoint sejenis.

**Bukti pengujian (sebelum perbaikan):**
```
Mahasiswa A (nim 1111) pinjam B001 -> HTTP 201, loanId=L1789728542084
Penyerang kirim POST /api/loans/<id>/return TANPA token apa pun:
   -> HTTP 200
   -> Status B001 sesudahnya: available=True, borrowedBy=None
```

**Perbaikan:** endpoint `return` kini memvalidasi token ke `user-service` (401 bila
tidak valid) dan memeriksa kepemilikan — hanya peminjam yang bersangkutan yang boleh
mengembalikan (403 bila bukan miliknya).

### Bug #3 (TINGGI) — `return` tidak idempoten dan merusak konsistensi data

**Kondisi awal:** memanggil `return` dua kali pada loan yang sama tetap dijalankan,
dan buku selalu dibebaskan tanpa mengecek siapa pemegangnya saat itu.

**Dampak nyata yang terbukti:** mahasiswa F mengembalikan B005 → mahasiswa G meminjam
B005 → F memanggil `return` lagi dengan `loanId` **lamanya** → buku G ikut terbebaskan.

**Bukti pengujian (sebelum perbaikan):**
```
F pinjam B005 -> HTTP 201
F mengembalikan B005
G pinjam B005 -> HTTP 201
F memanggil ULANG return dengan loanId LAMA miliknya:
   -> HTTP 200; B005 sekarang available=True, borrowedBy=None
   -> G masih tercatat punya 1 loan aktif
>>> data TIDAK KONSISTEN: buku bebas padahal G masih meminjam
```

**Perbaikan:** loan yang `status !== 'active'` ditolak dengan `409`, dan buku hanya
dibebaskan bila `book.borrowedBy === loan.nim` (masih dipegang pemilik loan tersebut).

### Bug #4 (SEDANG) — Riwayat peminjaman dapat dibaca siapa pun

**Kondisi awal:** `GET /api/loans?nim=...` mengambil `nim` mentah dari query string
tanpa otorisasi — persis kesalahan yang sudah "diperbaiki" pada `borrow`, tetapi
terulang di endpoint baca. Siapa pun yang menebak NIM dapat melihat buku apa saja
yang sedang dipinjam mahasiswa itu.

**Perbaikan:** endpoint berubah menjadi `GET /api/loans?token=...`; NIM diambil dari
hasil validasi `user-service`, bukan dari client. Frontend disesuaikan mengirim token.

### Bug #5 (SEDANG) — Path traversal pada static server frontend

**Kondisi awal:**
```js
filePath = path.join(ROOT, decodeURIComponent(filePath.split('?')[0]));
```
Tidak ada pemeriksaan bahwa hasil join masih berada di dalam `ROOT`.

**Bukti pengujian (raw socket, agar jalur tidak dinormalisasi klien):**
```
GET /../book-service/server.js
   -> HTTP/1.1 200 OK | bocor=True   (source code service lain terbaca)
```

**Perbaikan:** jalur dinormalisasi dengan `path.normalize()` lalu dipastikan diawali
`ROOT + path.sep`; bila keluar folder dibalas `403 Forbidden`.

---

## RONDE KETIGA — Bug yang Ditemukan dari Pemakaian Nyata

Bug keenam ini tidak ditemukan lewat pengujian yang direncanakan, melainkan muncul
saat anggota kelompok menjalankan aplikasi dan melaporkan *"kenapa daftar bukunya
hilang?"*. Justru karena itulah bug ini menarik: ia lolos dari **seluruh** Acceptance
Criteria, sebab tidak ada satu pun AC yang menguji apa yang terjadi ketika salah satu
service mati.

### Bug #6 (TINGGI) — Halaman gagal diam-diam tanpa pesan apa pun

**Gejala yang dilaporkan.** Login berhasil dan nama mahasiswa tampil di header, tetapi
panel "Daftar Buku" dan "Peminjaman Saya" kosong sama sekali. Tidak ada pesan error,
tidak ada notifikasi. Pengguna menyimpulkan datanya hilang.

**Kondisi awal:**
```js
// frontend/app.js — versi bermasalah
async function renderAll() {
  const session = getSession();
  if (!session) return;

  // tidak ada try/catch sama sekali
  const [books, loans] = await Promise.all([fetchBooks(), fetchLoans(session.token)]);

  document.getElementById('active-count').textContent = loans.length;
  renderBookList(books, loans.length);
  renderLoanList(loans);
}
```

**Penyebab sebenarnya.** `book-service` belum dijalankan. Saat `fetch()` gagal,
`Promise.all` ditolak, dan seluruh baris di bawahnya tidak pernah dieksekusi. Panel
dibiarkan kosong tanpa keterangan.

**Cara membuktikannya.** Jalankan hanya `user-service` dan `frontend`, lalu login:

```
1. Login                -> HTTP 200  (berhasil, nama tampil di header)
2. fetchBooks()         -> URLError  (book-service tidak terjangkau)
3. fetchLoans()         -> URLError
4. renderAll() berhenti di Promise.all:
     - active-count tidak diisi  -> tetap '0' bawaan HTML
     - renderBookList() tidak dipanggil -> #book-list kosong
     - renderLoanList() tidak dipanggil -> #loan-list kosong
     - tidak ada pesan error apa pun ke pengguna
```

Petunjuk paling jelas ada pada angka **0 Buku Aktif Dipinjam**. Angka nol itu tertulis
langsung di HTML sebagai nilai bawaan. Bila pemuatan berhasil, angka tersebut akan
ditimpa. Karena masih nol, berarti kode berhenti sebelum sempat menimpanya.

**Perbaikan:** `renderAll()` kini dibungkus `try/catch`. Bila service tidak terjangkau,
halaman menampilkan alamat service yang gagal dihubungi beserta perintah untuk
menjalankannya, disertai notifikasi. Kegagalan menjadi terlihat, bukan tersembunyi.

**Pelajaran.** Kode hasil AI cenderung hanya menangani jalur yang berhasil. Penanganan
kegagalan jaringan, service yang mati, dan keadaan tak terduga lainnya jarang ditulis
kecuali diminta secara eksplisit. Pada arsitektur microservice hal ini jauh lebih
berbahaya daripada pada monolith, sebab ada lebih banyak titik yang bisa gagal.

---

### Hasil Verifikasi Setelah Perbaikan Ronde 2

Dijalankan lewat `tests/uji_verifikasi.py` — mencakup **regresi** (memastikan AC lama
tidak rusak) dan **verifikasi perbaikan**:

```
BAGIAN 1 — REGRESI
   [LULUS] US-01 login menerbitkan token
   [LULUS] Validasi input login kosong ditolak (HTTP 400)
   [LULUS] US-02 daftar buku tampil (6 buku)
   [LULUS] AC-01 pinjam buku tersedia (HTTP 201, jatuh tempo +7 hari)
   [LULUS] AC-01 masa pinjam tepat 7 hari (selisih=7)
   [LULUS] AC-01 status buku berubah
   [LULUS] AC-03 buku sudah dipinjam ditolak (HTTP 409)
   [LULUS] Token palsu ditolak (antar-service) (HTTP 401)
   [LULUS] AC-02 buku ke-4 ditolak (HTTP 409)
   [LULUS] AC-04 lihat peminjaman saya (3 loan aktif)

BAGIAN 2 — VERIFIKASI PERBAIKAN
   [LULUS] Return TANPA token ditolak (HTTP 401)
   [LULUS] Return dengan token ORANG LAIN ditolak (HTTP 403)
   [LULUS] Buku korban tetap berstatus dipinjam
   [LULUS] Pemilik sah berhasil mengembalikan (HTTP 200)
   [LULUS] Return KEDUA kalinya ditolak (HTTP 409)
   [LULUS] Buku milik G tetap terkunci setelah F return ulang
   [LULUS] Akses via ?nim= (tanpa token) ditolak (HTTP 401)
   [LULUS] Token hanya mengembalikan data pemiliknya
   [LULUS] Traversal ke folder lain diblokir (HTTP 403)
   [LULUS] Halaman normal tetap dapat diakses (HTTP 200)
   [LULUS] Aset statis tetap dapat diakses

RINGKASAN: 21 LULUS, 0 GAGAL
```

### Ringkasan Seluruh Bug yang Ditemukan

| No | Bug | Tingkat | Ditemukan lewat |
|---|---|---|---|
| #1 | `book-service` mempercayai NIM langsung dari client | Kritis | Review ronde 1 |
| #2 | Endpoint `return` tanpa validasi token | Kritis | Review adversarial ronde 2 |
| #3 | `return` tidak idempoten, merusak data mahasiswa lain | Tinggi | Review adversarial ronde 2 |
| #4 | Riwayat peminjaman dapat dibaca tanpa login | Sedang | Review adversarial ronde 2 |
| #5 | Path traversal pada static server frontend | Sedang | Uji raw socket |
| #6 | Halaman gagal diam-diam saat service mati | Tinggi | **Pemakaian nyata** |

Seluruhnya sudah diperbaiki dan diverifikasi ulang.

### Pelajaran untuk Laporan (Tahap Refleksi)

1. **AI memperbaiki tepat di titik yang ditunjuk, tidak merambat.** Perbaikan validasi
   token ronde 1 tidak otomatis diterapkan ke endpoint `return` dan `loans` yang
   punya masalah identik. Developer harus bertanya: *"di mana lagi pola ini muncul?"*
2. **Lolos Acceptance Criteria bukan berarti kode benar.** AC-01 sampai AC-04 lulus
   sejak awal, padahal ada enam celah nyata. AC menguji jalur yang diharapkan; bug
   hidup di jalur yang tidak terpikirkan saat menyusunnya.
3. **Uji adversarial, bukan hanya jalur bahagia.** Bug #3 hanya muncul lewat skenario
   dua mahasiswa dan pemanggilan berulang — tidak akan terlihat dari klik normal di UI.
4. **Bukti harus dijalankan, bukan diasumsikan.** Dugaan path traversal awalnya
   tampak "aman" karena klien HTTP menormalisasi jalur; baru terbukti setelah diuji
   dengan raw socket.
5. **AI hanya menangani jalur yang berhasil.** Bug #6 terjadi karena penanganan
   kegagalan tidak ditulis sama sekali. Pada microservice, titik yang bisa gagal jauh
   lebih banyak daripada pada monolith, sehingga kelalaian ini lebih berbahaya.
6. **Pengujian yang direncanakan tidak menangkap segalanya.** Bug #6 justru ditemukan
   dari pemakaian sehari-hari, bukan dari skenario uji mana pun.

---

## Ringkasan Hasil Pengujian End-to-End (ronde 1, setelah perbaikan token borrow)

| Skenario | Endpoint | Hasil |
|---|---|---|
| Login mahasiswa baru | `POST /api/login` | `200`, token diterbitkan |
| Lihat daftar buku | `GET /api/books` | `200`, 6 buku tampil |
| Pinjam buku tersedia | `POST /api/books/B001/borrow` | `201`, AC-01 terpenuhi |
| Pinjam buku yang sama lagi | `POST /api/books/B001/borrow` | `409`, AC-03 terpenuhi |
| Pinjam dengan token acak/tidak valid | `POST /api/books/B002/borrow` | `401`, ditolak sebelum masuk logika bisnis |
| Pinjam buku ke-4 setelah 3 aktif | `POST /api/books/B004/borrow` | `409`, AC-02 terpenuhi |
| Lihat peminjaman aktif | `GET /api/loans?nim=...` | `200`, 3 loan aktif tampil |

> **Catatan:** tabel di atas adalah arsip hasil **ronde 1** dan memakai kontrak API
> lama (`?nim=`). Pada ronde 2 endpoint tersebut diubah menjadi `?token=` karena
> `?nim=` terbukti membocorkan data peminjaman mahasiswa lain (Bug #4). Hasil
> pengujian yang berlaku saat ini ada di bagian *"Hasil Verifikasi Setelah
> Perbaikan Ronde 2"* di atas.

Seluruh pengujian di atas dijalankan langsung terhadap service yang berjalan (bukan simulasi), dengan hasil aktual yang konsisten dengan tabel di atas.

---

## Verifikasi Manual Integrasi Antar-Service

Pada 21 September 2026 dilakukan verifikasi manual terhadap integrasi `user-service` dan `book-service` menggunakan PowerShell. Pengujian dilakukan terhadap service yang sedang berjalan secara lokal.

| Pengujian | Hasil |
|---|---|
| `GET /api/health` pada user-service | HTTP 200 |
| `GET /api/books` pada book-service | HTTP 200 |
| `GET /api/loans` tanpa token | HTTP 401 Unauthorized |
| Login dengan NIM dan nama yang sesuai | HTTP 200, token diterbitkan |
| `GET /api/loans` menggunakan token valid | HTTP 200 |
| `GET /api/loans` menggunakan token palsu | HTTP 401 Unauthorized |

Hasil tersebut menunjukkan bahwa `book-service` dapat berkomunikasi dengan `user-service` untuk melakukan validasi token. Akses ke data peminjaman tanpa token atau dengan token yang tidak valid ditolak.

Verifikasi manual ini dilakukan sebagai pemeriksaan tambahan terhadap integrasi antar-service sebelum perubahan dianggap selesai.