/* =========================================================
   USER-SERVICE
   Tanggung jawab: autentikasi mahasiswa (login) & validasi token.
   Tidak menyimpan buku / peminjaman — itu tanggung jawab book-service.
   Teknologi: Node.js core (http, crypto) — tanpa framework/dependency.
   ========================================================= */

const http = require('http');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 4001;

// In-memory session store: token -> { nim, nama, createdAt }
// Catatan: prototype ini menyimpan sesi di memori (bukan database sungguhan),
// konsisten dengan batasan praktikum sebelumnya (localStorage/simulasi).
const sessions = {};
// Data mahasiswa sebagai acuan validasi Nim dan Nama 
const students = [
  {
    nim: '2441919005',
    nama: 'Yuliani'
},
{
    nim: '2441919023',
    nama: 'Firda'
},
{
    nim: '2441919054',
    nama: 'Huriyah'
},
{
    nim: '2441919061',
    nama: 'Ridho'
},
{
    nim: '2441919022',
    nama: 'Aya'
},

]

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

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return sendJSON(res, 204, {});
  }

  // Health check — dipakai book-service / monitoring untuk cek service hidup
  if (path === '/api/health' && req.method === 'GET') {
    return sendJSON(res, 200, { status: 'ok', service: 'user-service' });
  }

  // POST /api/login  { nim, nama } -> { token, user }
  if (path === '/api/login' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nim = (body.nim || '').toString().trim();
      const nama = (body.nama || '').toString().trim();

      // Requirement: "Students must log in using their name and NIM"
      // -> keduanya wajib diisi bebas (free text), tidak dibatasi daftar tertentu.
      if (!nim || !nama) {
        return sendJSON(res, 400, { error: 'NIM dan Nama wajib diisi.' });
      }
      const student = students.find(
         s => s.nim === nim && s.nama.toLowerCase() === nama.toLowerCase()
      );

      if (!student) {
        return sendJSON(res, 401, {
        error: 'NIM dan Nama tidak sesuai.'
        });
      }
      const token = crypto.randomUUID();
      sessions[token] = { nim, nama, createdAt: Date.now() };

      return sendJSON(res, 200, { token, user: { nim, nama } });
    } catch (err) {
      return sendJSON(res, 400, { error: 'Request body tidak valid (JSON diharapkan).' });
    }
  }

  // GET /api/validate?token=xxx -> { valid, user }
  // Endpoint ini yang dipanggil book-service (komunikasi antar-service via API)
  // untuk memverifikasi identitas mahasiswa sebelum memproses peminjaman.
  if (path === '/api/validate' && req.method === 'GET') {
    const token = parsed.query.token;
    const session = token && sessions[token];

    if (!session) {
      return sendJSON(res, 401, { valid: false, error: 'Token tidak valid atau sudah kedaluwarsa.' });
    }
    return sendJSON(res, 200, { valid: true, user: { nim: session.nim, nama: session.nama } });
  }

  return sendJSON(res, 404, { error: 'Endpoint tidak ditemukan.' });
});

server.listen(PORT, () => {
  console.log(`[user-service] berjalan di http://localhost:${PORT}`);
});