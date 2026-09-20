# Prompt yang Digunakan (AI Coding Tool: Claude)

Mengikuti pola dari praktikum sebelumnya: AI diminta menganalisis/merancang dahulu sebelum menulis kode, lalu ditinjau, baru diminta memperbaiki jika ditemukan masalah — bukan menerima hasil AI secara langsung.

## 1. Prompt Desain Arsitektur (sebelum coding)

```
Proyek sebelumnya adalah aplikasi peminjaman buku perpustakaan berbasis
HTML5 + CSS3 + Vanilla JavaScript + localStorage, tanpa backend.

User Story utama:
"Sebagai mahasiswa, saya ingin meminjam buku yang berstatus tersedia,
sehingga saya dapat menggunakan buku tersebut untuk belajar."

Acceptance Criteria:
AC-01: buku tersedia -> peminjaman berhasil, jatuh tempo 7 hari.
AC-02: mahasiswa dengan 3 buku aktif -> peminjaman ke-4 ditolak.
AC-03: buku sedang dipinjam mahasiswa lain -> peminjaman ditolak.

Usulkan pembagian aplikasi ini menjadi minimal 2 microservice yang
saling berkomunikasi lewat API. Jelaskan tanggung jawab masing-masing
service dan di mana Acceptance Criteria di atas akan divalidasi.
Jangan menulis kode dulu.
```

## 2. Prompt Implementasi user-service

```
Implementasikan user-service menggunakan Node.js tanpa framework
(hanya modul core: http, crypto). Tanggung jawab: menerima login
{nim, nama}, menerbitkan token, dan menyediakan endpoint validasi
token untuk dipanggil service lain. Tidak perlu autentikasi
sungguhan (sesuai batasan praktikum) — login diterima untuk NIM
dan nama apa pun yang diisi.
```

## 3. Prompt Implementasi book-service (termasuk komunikasi antar-service)

```
Implementasikan book-service menggunakan Node.js tanpa framework.
Tanggung jawab: daftar buku, daftar pinjaman per mahasiswa, dan
proses pinjam/kembalikan buku. Endpoint pinjam buku HARUS
memverifikasi identitas peminta ke user-service (panggil
GET /api/validate) sebelum memproses peminjaman — jangan menerima
NIM langsung dari body request tanpa verifikasi. Terapkan AC-01,
AC-02, AC-03 sebagai validasi di sisi server.
```

## 4. Prompt Review (sebelum menganggap kode final)

```
Tinjau ulang implementasi book-service di atas. Jangan asumsikan
kode benar hanya karena AC-01/02/03 tampak terpenuhi secara logika.
Periksa khususnya: apakah ada jalur di mana identitas mahasiswa bisa
dipalsukan oleh client tanpa login yang sah? Jelaskan temuannya
sebelum melakukan perbaikan apa pun.
```

**Hasil review:** ditemukan bahwa draf awal endpoint borrow membaca `nim` langsung dari body request tanpa memanggil `user-service` untuk verifikasi token — didokumentasikan lengkap di [`AI_USAGE.md`](AI_USAGE.md).

## 5. Prompt Perbaikan

```
Terapkan perbaikan: endpoint POST /api/books/:id/borrow harus
menerima {token} (bukan {nim}) dari client, memanggil
GET user-service/api/validate?token=... untuk mendapatkan nim yang
sah, dan menolak permintaan dengan 401 jika token tidak valid.
Jangan ubah kontrak AC-01/AC-02/AC-03 yang sudah benar. Setelah
perbaikan, jelaskan kode yang terdampak dan skenario pengujian
untuk memverifikasi perbaikan ini.
```

## 6. Prompt Pengujian End-to-End

```
Jalankan user-service dan book-service secara lokal, lalu uji
end-to-end dengan curl: login, ambil token, pinjam buku (harus
berhasil), pinjam buku yang sama lagi (harus ditolak/AC-03), pinjam
dengan token acak (harus ditolak 401), pinjam sampai melebihi 3 buku
aktif (harus ditolak/AC-02). Laporkan hasil aktual, bukan perkiraan.
```

Hasil aktual dari pengujian ini didokumentasikan di [`AI_USAGE.md`](AI_USAGE.md).

---

## RONDE 2 — Review Adversarial

Ronde pertama hanya menguji jalur yang diharapkan (AC-01/02/03). Ronde kedua
dirancang untuk mencari celah yang TIDAK terpikir saat menulis AC.

### 7. Prompt Review Adversarial

```
Kode ini sudah lolos AC-01, AC-02, dan AC-03. Jangan anggap itu bukti
kode benar. Perbaikan validasi token sebelumnya hanya diterapkan pada
endpoint borrow — periksa apakah endpoint LAIN memiliki masalah yang
sama atau sejenis.

Uji secara adversarial, bukan jalur bahagia:
- Bisakah mahasiswa lain mengembalikan buku yang bukan miliknya?
- Apa yang terjadi jika endpoint return dipanggil dua kali?
- Bisakah data peminjaman mahasiswa lain dibaca tanpa login?
- Apakah static server frontend bisa menyajikan file di luar foldernya?

Buktikan setiap temuan dengan pengujian yang benar-benar dijalankan,
sertakan output aktualnya. Jangan perbaiki kode dulu.
```

**Hasil:** 4 bug ditemukan dan terbukti (return tanpa token, return tidak idempoten,
kebocoran data peminjaman, path traversal) — rincian di [`AI_USAGE.md`](AI_USAGE.md).

### 8. Prompt Perbaikan Ronde 2

```
Perbaiki keempat bug yang terbukti tadi:
1. endpoint return wajib validasi token ke user-service + cek kepemilikan;
2. return harus idempoten dan tidak boleh membebaskan buku yang sedang
   dipegang mahasiswa lain;
3. GET /api/loans harus memakai token, bukan nim dari query string,
   dan sesuaikan frontend;
4. static server frontend harus menolak jalur di luar foldernya.

Jangan ubah kontrak AC-01/AC-02/AC-03 yang sudah benar.
```

### 9. Prompt Verifikasi + Regresi

```
Buat skrip pengujian yang menjalankan service, lalu:
BAGIAN 1 - regresi: pastikan AC-01 s/d AC-04 MASIH lulus setelah perubahan;
BAGIAN 2 - verifikasi: buktikan keempat bug sudah tertutup, termasuk
skenario dua mahasiswa untuk bug idempotensi, dan raw socket untuk
path traversal.
Laporkan jumlah LULUS/GAGAL. Jangan laporkan hasil yang tidak dijalankan.
```

**Hasil:** `21 LULUS, 0 GAGAL` — skrip tersimpan di `tests/uji_verifikasi.py`.
