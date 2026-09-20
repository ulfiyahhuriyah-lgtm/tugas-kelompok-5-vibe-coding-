/* =========================================================
   BOOK-SERVICE
   Tanggung jawab: katalog buku, aturan peminjaman (business rules),
   dan riwayat peminjaman mahasiswa.
   Tidak menangani login — book-service memvalidasi identitas mahasiswa
   dengan memanggil API user-service (komunikasi antar-service).
   Teknologi: Node.js core (http) — tanpa framework/dependency.
   ========================================================= */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 4002;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:4001';

const MAX_ACTIVE_BOOKS = 3;   // Aturan #5 studi kasus
const LOAN_PERIOD_DAYS = 7;   // Aturan #7 studi kasus

// ---- In-memory "database" ----
// PENGEMBANGAN v2: data buku diperkaya (kategori, tahun, ISBN, sinopsis)
// untuk mendukung fitur pencarian dan penyaringan di frontend.
let books = [
  { id: 'B001', title: 'Pemrograman Dasar', author: 'Andi Wijaya', kategori: 'Pemrograman', tahun: 2021, isbn: '978-602-0001-01-1', sinopsis: 'Pengantar logika pemrograman, tipe data, percabangan, dan perulangan untuk pemula.', available: true, borrowedBy: null },
  { id: 'B002', title: 'Struktur Data', author: 'Siti Rahma', kategori: 'Pemrograman', tahun: 2020, isbn: '978-602-0001-02-8', sinopsis: 'Array, linked list, stack, queue, tree, dan graf beserta analisis kompleksitasnya.', available: true, borrowedBy: null },
  { id: 'B003', title: 'Basis Data', author: 'Budi Hartono', kategori: 'Data', tahun: 2022, isbn: '978-602-0001-03-5', sinopsis: 'Perancangan basis data relasional, normalisasi, dan kueri SQL tingkat dasar hingga menengah.', available: true, borrowedBy: null },
  { id: 'B004', title: 'Rekayasa Perangkat Lunak', author: 'Dewi Lestari', kategori: 'Rekayasa', tahun: 2023, isbn: '978-602-0001-04-2', sinopsis: 'Siklus hidup perangkat lunak, requirement engineering, pengujian, dan manajemen proyek.', available: true, borrowedBy: null },
  { id: 'B005', title: 'Jaringan Komputer', author: 'Rian Saputra', kategori: 'Jaringan', tahun: 2021, isbn: '978-602-0001-05-9', sinopsis: 'Model OSI dan TCP/IP, pengalamatan IP, routing, serta dasar keamanan jaringan.', available: true, borrowedBy: null },
  { id: 'B006', title: 'Kecerdasan Buatan', author: 'Maya Putri', kategori: 'Data', tahun: 2023, isbn: '978-602-0001-06-6', sinopsis: 'Pencarian, representasi pengetahuan, pembelajaran mesin, dan penerapannya.', available: true, borrowedBy: null }
];
let loans = []; // { id, nim, bookId, borrowDate, dueDate, status, returnDate }

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getActiveLoanCount(nim) {
  return loans.filter(l => l.nim === nim && l.status === 'active').length;
}

/*
 * Memvalidasi token dengan memanggil user-service.
 *
 * CATATAN PERBAIKAN (lihat docs/AI_USAGE.md):
 * Versi awal hasil AI Coding Tool langsung membaca `nim` dari body request
 * client TANPA verifikasi ke user-service. Ini artinya siapa pun bisa mengklaim
 * menjadi mahasiswa manapun hanya dengan mengirim nim sembarang di body request
 * — sebuah kesalahan umum saat AI membuat microservice: setiap service HARUS
 * memverifikasi identitas lewat service pemilik data tersebut (user-service),
 * bukan mempercayai input klien secara langsung.
 * Fungsi ini adalah hasil perbaikannya: book-service memanggil endpoint
 * GET /api/validate milik user-service sebelum memproses peminjaman.
 */
async function validateToken(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${USER_SERVICE_URL}/api/validate?token=${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.valid ? data.user : null;
  } catch (err) {
    console.error('[book-service] Gagal menghubungi user-service:', err.message);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  if (req.method === 'OPTIONS') {
    return sendJSON(res, 204, {});
  }

  if (path === '/api/health' && req.method === 'GET') {
    return sendJSON(res, 200, { status: 'ok', service: 'book-service' });
  }

  // GET /api/books -> daftar seluruh buku beserta status ketersediaan
  // GET /api/books -> daftar buku
  //
  // PENGEMBANGAN v2: mendukung pencarian dan penyaringan di sisi server.
  //   ?q=        cari pada judul, penulis, atau kategori (tidak peka huruf besar/kecil)
  //   ?kategori= saring berdasarkan kategori
  //   ?status=   'tersedia' | 'dipinjam'
  // Penyaringan sengaja dilakukan di server, bukan di browser, agar konsisten
  // dengan prinsip bahwa book-service adalah satu-satunya pemilik data buku.
  if (path === '/api/books' && req.method === 'GET') {
    const q = (parsed.query.q || '').toString().trim().toLowerCase();
    const kategori = (parsed.query.kategori || '').toString().trim();
    const status = (parsed.query.status || '').toString().trim();

    let hasil = books;

    if (q) {
      hasil = hasil.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.kategori.toLowerCase().includes(q)
      );
    }
    if (kategori) {
      hasil = hasil.filter(b => b.kategori.toLowerCase() === kategori.toLowerCase());
    }
    if (status === 'tersedia') hasil = hasil.filter(b => b.available);
    if (status === 'dipinjam') hasil = hasil.filter(b => !b.available);

    const daftarKategori = [...new Set(books.map(b => b.kategori))].sort();

    return sendJSON(res, 200, {
      books: hasil,
      total: books.length,
      ditampilkan: hasil.length,
      kategori: daftarKategori
    });
  }

  // GET /api/loans/history?token=xxx -> riwayat buku yang sudah dikembalikan
  //
  // PENGEMBANGAN v2: sebelumnya data peminjaman yang sudah selesai tidak pernah
  // dapat dilihat kembali oleh mahasiswa. Endpoint ini memakai aturan otorisasi
  // yang sama dengan /api/loans (wajib token, NIM diambil dari hasil validasi).
  if (path === '/api/loans/history' && req.method === 'GET') {
    const user = await validateToken(parsed.query.token);
    if (!user) {
      return sendJSON(res, 401, { error: 'Token tidak valid. Silakan login ulang.' });
    }

    const riwayat = loans
      .filter(l => l.nim === user.nim && l.status === 'returned')
      .map(l => ({ ...l, book: books.find(b => b.id === l.bookId) || null }))
      .sort((a, b) => new Date(b.returnDate) - new Date(a.returnDate));

    return sendJSON(res, 200, { loans: riwayat });
  }

  // GET /api/loans?token=xxx -> daftar peminjaman aktif milik mahasiswa yang login
  //
  // CATATAN PERBAIKAN RONDE 2 (lihat docs/AI_USAGE.md — Bug #4):
  // Versi sebelumnya menerima `?nim=` langsung dari client tanpa otorisasi,
  // sehingga siapa pun dapat membaca riwayat peminjaman mahasiswa lain hanya
  // dengan menebak/mengetahui NIM-nya. NIM sekarang diambil dari hasil
  // validasi token ke user-service, bukan dari query string.
  if (path === '/api/loans' && req.method === 'GET') {
    const user = await validateToken(parsed.query.token);
    if (!user) {
      return sendJSON(res, 401, { error: 'Token tidak valid. Silakan login ulang.' });
    }

    const hariIni = new Date();
    const activeLoans = loans
      .filter(l => l.nim === user.nim && l.status === 'active')
      .map(l => {
        // PENGEMBANGAN v2: sisa hari dihitung di server agar seluruh client
        // memakai acuan waktu yang sama, bukan jam masing-masing browser.
        const selisihMs = new Date(l.dueDate) - hariIni;
        const sisaHari = Math.ceil(selisihMs / (1000 * 60 * 60 * 24));
        return {
          ...l,
          book: books.find(b => b.id === l.bookId) || null,
          sisaHari,
          terlambat: sisaHari < 0
        };
      })
      .sort((a, b) => a.sisaHari - b.sisaHari);

    return sendJSON(res, 200, { loans: activeLoans });
  }

  // POST /api/books/:id/borrow  { token } -> proses peminjaman (AC-01, AC-02, AC-03)
  const borrowMatch = path.match(/^\/api\/books\/([^/]+)\/borrow$/);
  if (borrowMatch && req.method === 'POST') {
    const bookId = borrowMatch[1];

    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'Request body tidak valid.' });
    }

    // 1) Verifikasi identitas mahasiswa via user-service (komunikasi antar-service)
    const user = await validateToken(body.token);
    if (!user) {
      return sendJSON(res, 401, { error: 'Token tidak valid. Silakan login ulang.' });
    }

    const book = books.find(b => b.id === bookId);
    if (!book) {
      return sendJSON(res, 404, { error: 'Buku tidak ditemukan.' });
    }

    // AC-03: buku yang sedang dipinjam tidak dapat dipinjam mahasiswa lain
    if (!book.available) {
      return sendJSON(res, 409, { error: 'Buku sedang dipinjam mahasiswa lain.' });
    }

    // AC-02: maksimal 3 buku aktif
    const activeCount = getActiveLoanCount(user.nim);
    if (activeCount >= MAX_ACTIVE_BOOKS) {
      return sendJSON(res, 409, { error: 'Anda sudah mencapai batas maksimal 3 buku aktif.' });
    }

    // AC-01: proses peminjaman berhasil
    const borrowDate = new Date();
    const dueDate = addDays(borrowDate, LOAN_PERIOD_DAYS);

    book.available = false;
    book.borrowedBy = user.nim;

    const loan = {
      id: 'L' + Date.now(),
      nim: user.nim,
      bookId: book.id,
      borrowDate: borrowDate.toISOString(),
      dueDate: dueDate.toISOString(),
      status: 'active'
    };
    loans.push(loan);

    return sendJSON(res, 201, { loan, book });
  }

  // POST /api/loans/:id/return  { token } -> mengembalikan buku
  //
  // CATATAN PERBAIKAN RONDE 2 (lihat docs/AI_USAGE.md — Bug #2 & #3):
  // Versi sebelumnya sama sekali TIDAK memvalidasi token pada endpoint ini,
  // padahal endpoint borrow sudah diperbaiki. Akibatnya siapa pun yang tahu
  // sebuah loanId bisa mengembalikan buku milik mahasiswa lain tanpa login.
  // Selain itu endpoint ini tidak idempoten: memanggilnya dua kali pada loan
  // yang sudah 'returned' tetap membebaskan buku — sehingga bisa membebaskan
  // buku yang saat itu sedang dipinjam MAHASISWA LAIN (data tidak konsisten).
  const returnMatch = path.match(/^\/api\/loans\/([^/]+)\/return$/);
  if (returnMatch && req.method === 'POST') {
    const loanId = returnMatch[1];

    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'Request body tidak valid.' });
    }

    // 1) Verifikasi identitas ke user-service (sama seperti endpoint borrow)
    const user = await validateToken(body.token);
    if (!user) {
      return sendJSON(res, 401, { error: 'Token tidak valid. Silakan login ulang.' });
    }

    const loan = loans.find(l => l.id === loanId);
    if (!loan) return sendJSON(res, 404, { error: 'Data peminjaman tidak ditemukan.' });

    // 2) Cek kepemilikan: hanya peminjam yang boleh mengembalikan
    if (loan.nim !== user.nim) {
      return sendJSON(res, 403, { error: 'Anda hanya dapat mengembalikan buku yang Anda pinjam sendiri.' });
    }

    // 3) Idempotensi: loan yang sudah dikembalikan tidak boleh diproses lagi
    if (loan.status !== 'active') {
      return sendJSON(res, 409, { error: 'Buku ini sudah dikembalikan sebelumnya.' });
    }

    loan.status = 'returned';
    loan.returnDate = new Date().toISOString();

    // 4) Bebaskan buku HANYA jika buku itu memang masih dipegang peminjam ini
    const book = books.find(b => b.id === loan.bookId);
    if (book && book.borrowedBy === loan.nim) {
      book.available = true;
      book.borrowedBy = null;
    }

    return sendJSON(res, 200, { loan, book });
  }

  return sendJSON(res, 404, { error: 'Endpoint tidak ditemukan.' });
});

server.listen(PORT, () => {
  console.log(`[book-service] berjalan di http://localhost:${PORT}`);
  console.log(`[book-service] terhubung ke user-service di ${USER_SERVICE_URL}`);
});
