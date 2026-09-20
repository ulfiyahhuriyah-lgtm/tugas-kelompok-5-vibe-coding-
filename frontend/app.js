/* =========================================================
   Perpustakaan Kampus — logika antarmuka (v2)
   Antarmuka ini tidak menyimpan aturan bisnis apa pun. Seluruh
   keputusan (boleh pinjam atau tidak, batas 3 buku, jatuh tempo)
   diambil oleh book-service setelah memverifikasi token ke
   user-service. Berkas ini hanya menampilkan dan meneruskan.
   ========================================================= */

const KUNCI_SESI = 'perpus_session';

let keadaan = {
  buku: [],
  pinjaman: [],
  riwayat: [],
  kategoriTersedia: [],
  totalBuku: 0
};

let jedaCari = null;

/* ---------------- sesi ---------------- */

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KUNCI_SESI));
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(KUNCI_SESI, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(KUNCI_SESI);
}

/* ---------------- pembantu tampilan ---------------- */

function formatDate(d) {
  return new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function aman(teks) {
  const el = document.createElement('div');
  el.textContent = teks == null ? '' : String(teks);
  return el.innerHTML;
}

let jedaToast = null;
function showToast(message, type = '') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'toast ' + type;
  clearTimeout(jedaToast);
  jedaToast = setTimeout(() => t.classList.add('sembunyi'), 4000);
}

function pasangRangka(idElemen, jumlah) {
  document.getElementById(idElemen).innerHTML =
    Array.from({ length: jumlah }, () => '<div class="rangka"></div>').join('');
}

// Sampul buku asli, dipetakan per ID buku. File-nya taruh langsung di
// folder frontend ini (sampul-B001.jpg dst — tidak perlu subfolder).
// Kalau suatu buku belum ada file sampulnya, otomatis dibuatkan sampul
// SVG gradient dari judul sebagai cadangan.
const PETA_SAMPUL = {
  B001: 'sampul-B001.jpg', // Pemrograman Dasar
  B002: 'sampul-B002.jpg', // Struktur Data (Algoritma & Struktur Data)
  B003: 'sampul-B003.jpg', // Basis Data
  B004: 'sampul-B004.jpg', // Rekayasa Perangkat Lunak
  B005: 'sampul-B005.jpg', // Jaringan Komputer
  B006: 'sampul-B006.jpg'  // Kecerdasan Buatan
};

function hashTeks(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function bungkusJudul(judul, maxKarakter = 14, maxBaris = 4) {
  const kata = judul.split(' ');
  const baris = [];
  let sekarang = '';
  kata.forEach(k => {
    const coba = sekarang ? sekarang + ' ' + k : k;
    if (coba.length > maxKarakter && sekarang) {
      baris.push(sekarang);
      sekarang = k;
    } else {
      sekarang = coba;
    }
  });
  if (sekarang) baris.push(sekarang);
  if (baris.length > maxBaris) {
    const potong = baris.slice(0, maxBaris);
    potong[maxBaris - 1] = potong[maxBaris - 1].slice(0, maxKarakter - 1) + '…';
    return potong;
  }
  return baris;
}

function sampulCadangan(b) {
  const hue = hashTeks(b.kategori || b.title || 'buku') % 360;
  const warnaAtas = `hsl(${hue}, 46%, 30%)`;
  const warnaBawah = `hsl(${(hue + 26) % 360}, 50%, 18%)`;

  const baris = bungkusJudul(b.title || '');
  const tinggiBaris = 18;
  const mulaiY = 106 - ((baris.length - 1) * tinggiBaris) / 2;
  const teksJudul = baris
    .map((br, i) => `<tspan x="80" y="${mulaiY + i * tinggiBaris}">${aman(br)}</tspan>`)
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="220" viewBox="0 0 160 220">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${warnaAtas}"/>
          <stop offset="1" stop-color="${warnaBawah}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="220" fill="url(#g)"/>
      <rect x="7" y="7" width="146" height="206" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
      <line x1="20" y1="20" x2="20" y2="200" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
      <text font-family="Georgia, serif" font-size="15" fill="#f7f4ec" text-anchor="middle" font-weight="600">${teksJudul}</text>
      <text x="80" y="196" font-family="Georgia, serif" font-size="10" fill="rgba(247,244,236,0.75)" text-anchor="middle">${aman(b.author || '')}</text>
    </svg>`.replace(/\s+/g, ' ').trim();

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function sampulBuku(b) {
  const file = PETA_SAMPUL[b.id];
  return file || sampulCadangan(b);
}

/* ---------------- tab: Daftar Buku / Pengembalian ---------------- */

document.querySelectorAll('.tab-btn').forEach(tombol => {
  tombol.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('aktif'));
    tombol.classList.add('aktif');
    document.querySelectorAll('.tab-konten').forEach(el => el.classList.add('sembunyi'));
    document.getElementById('tab-' + tombol.dataset.tab).classList.remove('sembunyi');
  });
});

/* ---------------- panggilan service ---------------- */

async function fetchBooks(filter = {}) {
  const p = new URLSearchParams();
  if (filter.q) p.set('q', filter.q);
  if (filter.kategori) p.set('kategori', filter.kategori);
  if (filter.status) p.set('status', filter.status);
  const sisip = p.toString() ? `?${p}` : '';

  const res = await fetch(`${CONFIG.BOOK_SERVICE_URL}/api/books${sisip}`);
  if (!res.ok) throw new Error('book-service membalas ' + res.status);
  return res.json();
}

// Mengirim token (bukan nim) — book-service menentukan sendiri milik siapa
// data yang boleh dikembalikan, setelah memvalidasi token ke user-service.
async function fetchLoans(token) {
  const res = await fetch(`${CONFIG.BOOK_SERVICE_URL}/api/loans?token=${encodeURIComponent(token)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.loans;
}

async function fetchHistory(token) {
  const res = await fetch(`${CONFIG.BOOK_SERVICE_URL}/api/loans/history?token=${encodeURIComponent(token)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.loans;
}

/* ---------------- status layanan ----------------
   PENGEMBANGAN v2: menampilkan hidup atau matinya tiap microservice.
   Ini langsung menjawab pelajaran dari Bug #6 — dulu, service yang mati
   membuat halaman kosong tanpa petunjuk apa pun. */

async function periksaLayanan() {
  const daftar = [
    { nama: 'user-service', url: CONFIG.USER_SERVICE_URL },
    { nama: 'book-service', url: CONFIG.BOOK_SERVICE_URL }
  ];

  const hasil = await Promise.all(daftar.map(async s => {
    try {
      const res = await fetch(`${s.url}/api/health`, { cache: 'no-store' });
      return { ...s, hidup: res.ok };
    } catch {
      return { ...s, hidup: false };
    }
  }));

  document.getElementById('status-layanan').innerHTML = hasil.map(s =>
    `<span class="lampu ${s.hidup ? 'lampu-hidup' : 'lampu-mati'}"
           title="${aman(s.nama)} ${s.hidup ? 'berjalan' : 'tidak merespons'} di ${aman(s.url)}">
       ${aman(s.nama.replace('-service', ''))}
     </span>`
  ).join('');

  return hasil;
}

/* ---------------- alur masuk ---------------- */

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nim = document.getElementById('nim').value.trim();
  const nama = document.getElementById('nama').value.trim();
  const galat = document.getElementById('login-error');
  const tombol = e.target.querySelector('button[type="submit"]');

  galat.classList.add('sembunyi');

  if (!nim || !nama) {
    galat.textContent = 'NIM dan nama harus diisi.';
    galat.classList.remove('sembunyi');
    return;
  }

  tombol.disabled = true;
  tombol.textContent = 'Menghubungkan...';

  try {
    const res = await fetch(`${CONFIG.USER_SERVICE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim, nama })
    });
    const data = await res.json();

    if (!res.ok) {
      galat.textContent = data.error || 'Tidak dapat masuk.';
      galat.classList.remove('sembunyi');
      return;
    }

    setSession({ token: data.token, user: data.user });
    enterApp();
  } catch {
    galat.textContent =
      'user-service tidak merespons di ' + CONFIG.USER_SERVICE_URL +
      '. Jalankan service tersebut lalu coba lagi.';
    galat.classList.remove('sembunyi');
  } finally {
    tombol.disabled = false;
    tombol.textContent = 'Masuk';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  document.getElementById('app-section').classList.add('sembunyi');
  document.getElementById('login-section').classList.remove('sembunyi');
  document.getElementById('login-form').reset();
});

function enterApp() {
  const session = getSession();
  if (!session) return;

  document.getElementById('login-section').classList.add('sembunyi');
  document.getElementById('app-section').classList.remove('sembunyi');
  document.getElementById('welcome-text').textContent =
    `${session.user.nama} · ${session.user.nim}`;

  periksaLayanan();
  renderAll();
}

/* ---------------- pemuatan data ---------------- */

// CATATAN PERBAIKAN (lihat docs/AI_USAGE.md — Bug #6):
// Versi sebelumnya memakai Promise.all() tanpa try/catch sama sekali. Bila
// book-service belum dijalankan atau mati, fetch() melempar error, seluruh
// baris di bawahnya tidak pernah dieksekusi, dan halaman hanya menampilkan
// panel kosong tanpa pesan apa pun. Pengguna mengira datanya hilang, padahal
// service-nya yang tidak aktif. Kegagalan kini ditangani dan dijelaskan.
async function renderAll() {
  const session = getSession();
  if (!session) return;

  const filter = bacaFilter();
  pasangRangka('book-list', 3);
  pasangRangka('loan-list', 1);

  let dataBuku, pinjaman, riwayat;
  try {
    [dataBuku, pinjaman, riwayat] = await Promise.all([
      fetchBooks(filter),
      fetchLoans(session.token),
      fetchHistory(session.token)
    ]);
  } catch (err) {
    console.error('Gagal memuat data dari book-service:', err);
    tampilkanGagalMuat();
    periksaLayanan();
    showToast('book-service tidak merespons. Jalankan service tersebut lalu muat ulang halaman.', 'galat');
    return;
  }

  keadaan.buku = dataBuku.books;
  keadaan.totalBuku = dataBuku.total;
  keadaan.kategoriTersedia = dataBuku.kategori || [];
  keadaan.pinjaman = pinjaman;
  keadaan.riwayat = riwayat;

  isiPilihanKategori();
  renderPita(pinjaman);
  renderInfoHasil(dataBuku, filter);
  renderBookList(dataBuku.books, pinjaman.length);
  renderLoanList(pinjaman);
  renderHistoryList(riwayat);
}

function tampilkanGagalMuat() {
  document.getElementById('book-list').innerHTML = `
    <div class="galat-muat">
      <strong>Katalog tidak dapat dimuat</strong>
      book-service di ${aman(CONFIG.BOOK_SERVICE_URL)} tidak merespons.
      Jalankan service tersebut, lalu muat ulang halaman ini.
      <code>cd book-service &amp;&amp; node server.js</code>
    </div>`;
  document.getElementById('loan-list').innerHTML =
    '<div class="kosong">Data pinjaman tidak dapat dimuat.</div>';
  document.getElementById('history-list').innerHTML = '';
  document.getElementById('info-hasil').textContent = '';
}

/* ---------------- penyaringan ---------------- */

function bacaFilter() {
  return {
    q: document.getElementById('cari').value.trim(),
    kategori: document.getElementById('saring-kategori').value,
    status: document.getElementById('saring-status').value
  };
}

function isiPilihanKategori() {
  const sel = document.getElementById('saring-kategori');
  if (sel.options.length > 1) return; // cukup sekali
  keadaan.kategoriTersedia.forEach(k => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    sel.appendChild(o);
  });
}

document.getElementById('cari').addEventListener('input', () => {
  clearTimeout(jedaCari);
  jedaCari = setTimeout(renderAll, 280);
});
document.getElementById('saring-kategori').addEventListener('change', renderAll);
document.getElementById('saring-status').addEventListener('change', renderAll);

/* ---------------- penggambaran ---------------- */

function renderPita(pinjaman) {
  document.getElementById('active-count').textContent = pinjaman.length;

  const tempo = document.getElementById('pita-tempo');
  if (pinjaman.length === 0) {
    tempo.textContent = 'Belum ada jatuh tempo';
    tempo.className = 'pita-tempo-mandiri';
    return;
  }

  const terdekat = pinjaman[0]; // sudah diurutkan server berdasarkan sisa hari
  if (terdekat.terlambat) {
    tempo.textContent = `Terlambat ${Math.abs(terdekat.sisaHari)} hari: ${terdekat.book.title}`;
    tempo.className = 'pita-tempo-mandiri pita-tempo-dekat';
  } else {
    tempo.textContent = `Jatuh tempo terdekat ${terdekat.sisaHari} hari lagi: ${terdekat.book.title}`;
    tempo.className = 'pita-tempo-mandiri' + (terdekat.sisaHari <= 2 ? ' pita-tempo-dekat' : '');
  }
}

function renderInfoHasil(data, filter) {
  const el = document.getElementById('info-hasil');
  const adaFilter = filter.q || filter.kategori || filter.status;
  el.textContent = adaFilter
    ? `Menampilkan ${data.ditampilkan} dari ${data.total} buku`
    : `${data.total} buku dalam koleksi`;
}

function renderBookList(books, jumlahAktif) {
  const wadah = document.getElementById('book-list');
  const penuh = jumlahAktif >= 3;

  if (books.length === 0) {
    wadah.innerHTML = `
      <div class="kosong">
        <strong>Tidak ada buku yang cocok</strong>
        Ubah kata kunci atau hapus penyaringnya.
      </div>`;
    return;
  }

  wadah.innerHTML = books.map(b => {
    let label = 'Pinjam';
    let mati = false;
    if (!b.available) { label = 'Sedang dipinjam'; mati = true; }
    else if (penuh)   { label = 'Batas 3 buku'; mati = true; }

    return `
      <article class="kartu-buku ${b.available ? 'tersedia' : 'dipinjam'}">
        <img class="buku-sampul" src="${sampulBuku(b)}" alt="Sampul ${aman(b.title)}" loading="lazy">
        <div>
          <div class="buku-judul-baris">
            <h3 class="buku-judul">${aman(b.title)}</h3>
            <span class="tanda ${b.available ? 'tanda-tersedia' : 'tanda-dipinjam'}">
              ${b.available ? 'Tersedia' : 'Dipinjam'}
            </span>
          </div>
          <p class="buku-penulis">${aman(b.author)}</p>
          <p class="buku-sinopsis">${aman(b.sinopsis)}</p>
          <div class="buku-tanda">
            <span class="tanda mono">${aman(b.id)} · ${aman(b.tahun)}</span>
            <span class="tanda">${aman(b.kategori)}</span>
            <span class="tanda mono">${aman(b.isbn)}</span>
          </div>
        </div>
        <button class="tombol-pinjam" data-pinjam="${aman(b.id)}" ${mati ? 'disabled' : ''}>
          ${aman(label)}
        </button>
      </article>`;
  }).join('');

  wadah.querySelectorAll('[data-pinjam]').forEach(btn => {
    btn.addEventListener('click', () => borrowBook(btn.dataset.pinjam));
  });
}

function renderLoanList(loans) {
  const wadah = document.getElementById('loan-list');

  if (loans.length === 0) {
    wadah.innerHTML = `
      <div class="kosong">
        <strong>Belum ada buku yang dipinjam</strong>
        Pilih buku dari katalog untuk mulai meminjam.
      </div>`;
    return;
  }

  wadah.innerHTML = loans.map(l => {
    const judul = l.book ? l.book.title : l.bookId;
    const genting = l.terlambat || l.sisaHari <= 2;
    const sisa = l.terlambat
      ? `Terlambat ${Math.abs(l.sisaHari)} hari`
      : `Sisa ${l.sisaHari} hari`;

    return `
      <article class="slip">
        <div class="slip-kepala">SLIP PEMINJAMAN · ${aman(l.bookId)}</div>
        <h3 class="slip-judul">${aman(judul)}</h3>
        <div class="stempel ${l.terlambat ? 'stempel-lewat' : ''}">
          <span class="stempel-label">HARUS KEMBALI</span>
          ${aman(formatDate(l.dueDate))}
        </div>
        <div class="slip-baris"><span>Tanggal pinjam</span><span>${aman(formatDate(l.borrowDate))}</span></div>
        <p class="slip-sisa ${genting ? 'slip-sisa-genting' : ''}">${aman(sisa)}</p>
        <button class="tombol-kembali" data-kembali="${aman(l.id)}">Kembalikan buku</button>
      </article>`;
  }).join('');

  wadah.querySelectorAll('[data-kembali]').forEach(btn => {
    btn.addEventListener('click', () => returnBook(btn.dataset.kembali));
  });
}

function renderHistoryList(riwayat) {
  const wadah = document.getElementById('history-list');

  if (riwayat.length === 0) {
    wadah.innerHTML = '<div class="kosong">Belum ada buku yang dikembalikan.</div>';
    return;
  }

  wadah.innerHTML = riwayat.map(l => `
    <article class="slip slip-riwayat">
      <h3 class="slip-judul">${aman(l.book ? l.book.title : l.bookId)}</h3>
      <div class="slip-baris">
        <span>Dikembalikan</span>
        <span>${aman(formatDate(l.returnDate))}</span>
      </div>
    </article>`).join('');
}

/* ---------------- aksi ---------------- */

async function borrowBook(bookId) {
  const session = getSession();
  try {
    const res = await fetch(`${CONFIG.BOOK_SERVICE_URL}/api/books/${bookId}/borrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();

    if (res.status === 401) {
      showToast('Sesi berakhir. Silakan masuk kembali.', 'galat');
      clearSession();
      document.getElementById('app-section').classList.add('sembunyi');
      document.getElementById('login-section').classList.remove('sembunyi');
      return;
    }
    if (!res.ok) {
      showToast(data.error || 'Peminjaman gagal.', 'galat');
      renderAll();
      return;
    }

    showToast(`${data.book.title} dipinjam. Kembalikan sebelum ${formatDate(data.loan.dueDate)}.`, 'sukses');
    renderAll();
  } catch {
    showToast('book-service tidak merespons. Periksa apakah service tersebut berjalan.', 'galat');
    periksaLayanan();
  }
}

async function returnBook(loanId) {
  const session = getSession();
  try {
    const res = await fetch(`${CONFIG.BOOK_SERVICE_URL}/api/loans/${loanId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Pengembalian gagal.', 'galat');
      renderAll();
      return;
    }

    showToast(`${data.book ? data.book.title : 'Buku'} dikembalikan.`, 'sukses');
    renderAll();
  } catch {
    showToast('book-service tidak merespons. Periksa apakah service tersebut berjalan.', 'galat');
    periksaLayanan();
  }
}

/* ---------------- mulai ---------------- */

if (getSession()) {
  enterApp();
}

// Perbarui lampu status secara berkala agar service yang mati langsung terlihat.
setInterval(() => {
  if (getSession() && !document.getElementById('app-section').classList.contains('sembunyi')) {
    periksaLayanan();
  }
}, 15000);
