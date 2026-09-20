# Architecture — Sebelum & Sesudah

## 1. Arsitektur Sebelum (Praktikum Requirement Engineering)

Monolith satu halaman: seluruh logika (login, aturan bisnis, penyimpanan) berjalan di **browser**, tanpa server sama sekali.

```mermaid
flowchart LR
    subgraph Browser
        UI[index.html + script.js]
        LS[(localStorage)]
    end
    UI -->|read/write| LS
```

**Karakteristik:**
- Tidak ada backend/server — semua logika ada di JavaScript sisi client.
- Data (buku, peminjaman, sesi login) tersimpan di `localStorage` browser, hanya berlaku untuk satu browser/perangkat.
- Aturan bisnis (AC-01/02/03) bisa "dilewati" siapa pun yang membuka DevTools dan mengubah `localStorage` langsung — tidak ada validasi di sisi server karena tidak ada server.

## 2. Arsitektur Sesudah (Microservice)

```mermaid
flowchart LR
    subgraph Client
        FE[Frontend<br/>HTML/CSS/JS<br/>:4000]
    end

    subgraph Services
        US[user-service<br/>:4001<br/>login & validasi token]
        BS[book-service<br/>:4002<br/>katalog & peminjaman]
    end

    FE -->|POST /api/login| US
    FE -->|GET /api/books| BS
    FE -->|GET /api/loans?token=| BS
    FE -->|POST /api/books/:id/borrow| BS
    FE -->|POST /api/loans/:id/return| BS
    BS -->|GET /api/validate?token=| US
```

**Titik validasi token (setelah review ronde 2):** ketiga endpoint yang menyentuh
data milik mahasiswa — `GET /api/loans`, `POST /borrow`, dan `POST /return` — sama-sama
memanggil `user-service` lebih dulu. Satu-satunya endpoint publik adalah `GET /api/books`
(katalog memang boleh dilihat siapa pun). Pada versi sebelumnya hanya `borrow` yang
divalidasi; lihat [`AI_USAGE.md`](AI_USAGE.md) ronde 2.

**Karakteristik:**
- **user-service**: satu-satunya pemilik data identitas & sesi. Menerbitkan token saat login, dan satu-satunya pihak yang bisa memastikan "token ini benar-benar milik mahasiswa X."
- **book-service**: pemilik data buku & peminjaman. Menjalankan seluruh business rule (AC-01/02/03) di sisi server, sehingga tidak bisa dilewati dari client.
- **Komunikasi antar-service**: `book-service` memanggil endpoint `GET /api/validate` milik `user-service` melalui HTTP setiap kali ada permintaan pinjam buku — ini adalah titik komunikasi API-ke-API yang dipersyaratkan tugas.
- Setiap service punya tanggung jawab tunggal (*single responsibility*) dan dapat dikembangkan/dideploy secara independen.

## 3. Sequence Diagram — Alur "Meminjam Buku" (melibatkan kedua service)

Ini adalah alur fitur yang melibatkan kedua service sesuai ketentuan tugas ("minimal 1 alur fitur yang berjalan dengan melibatkan service yang dibuat").

```mermaid
sequenceDiagram
    actor M as Mahasiswa
    participant FE as Frontend
    participant US as user-service
    participant BS as book-service

    M->>FE: Isi NIM & Nama, klik Login
    FE->>US: POST /api/login {nim, nama}
    US-->>FE: 200 {token, user}
    FE->>FE: simpan token (localStorage browser)

    M->>FE: Klik "Pinjam" pada sebuah buku
    FE->>BS: POST /api/books/:id/borrow {token}
    BS->>US: GET /api/validate?token=...
    US-->>BS: 200 {valid:true, user:{nim,nama}}
    BS->>BS: Cek book.available (AC-03)
    BS->>BS: Cek jumlah pinjaman aktif < 3 (AC-02)
    BS->>BS: Simpan loan baru, set book.available=false (AC-01)
    BS-->>FE: 201 {loan, book}
    FE-->>M: Tampilkan toast sukses + tanggal jatuh tempo
```

Jika token tidak valid, atau salah satu aturan bisnis gagal, `book-service` merespons `401`/`409` **tanpa** mencatat peminjaman apa pun — diverifikasi pada pengujian di [`AI_USAGE.md`](AI_USAGE.md).

## 4. Pemetaan Requirement ke Service

| Requirement (studi kasus) | Service yang menangani |
|---|---|
| Mahasiswa harus login | `user-service` |
| Melihat daftar buku & ketersediaan | `book-service` |
| Meminjam buku tersedia | `book-service` (dengan verifikasi identitas ke `user-service`) |
| Maksimal 3 buku aktif | `book-service` |
| Larangan pinjam ganda | `book-service` |
| Masa pinjam 7 hari | `book-service` |
| Tampilkan info peminjaman | `book-service` (data) + Frontend (tampilan) |
| Mengembalikan buku | `book-service` (verifikasi token + cek kepemilikan ke `user-service`) |
| Privasi data peminjaman | `book-service` (NIM diambil dari token, bukan dari client) |
