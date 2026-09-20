/* Static file server sederhana untuk frontend — tanpa dependency. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = decodeURIComponent(urlPath.split('?')[0]);

  // PERBAIKAN (lihat docs/AI_USAGE.md — Bug #5):
  // Versi sebelumnya langsung melakukan path.join(ROOT, req.url), sehingga
  // permintaan seperti GET /../book-service/server.js menembus keluar folder
  // frontend dan membocorkan source code service lain. Jalur kini dinormalisasi
  // lalu dipastikan tetap berada di dalam ROOT sebelum dibaca.
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[frontend] berjalan di http://localhost:${PORT}`);
});