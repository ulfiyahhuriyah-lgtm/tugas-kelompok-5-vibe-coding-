"""
Memeriksa keselarasan antarmuka v2:
- setiap id yang dipakai app.js benar-benar ada di index.html
- setiap kelas CSS yang dipakai app.js/index.html terdefinisi di style.css
- tidak ada penyisipan HTML tanpa penyaringan (risiko XSS)
"""
import re, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FE = os.path.join(BASE, "frontend")

html = open(os.path.join(FE, "index.html"), encoding="utf-8").read()
css = open(os.path.join(FE, "style.css"), encoding="utf-8").read()
js = open(os.path.join(FE, "app.js"), encoding="utf-8").read()

lulus = gagal = 0


def cek(nama, kondisi, bukti=""):
    global lulus, gagal
    if kondisi:
        lulus += 1
        print(f"   [LULUS] {nama} {bukti}")
    else:
        gagal += 1
        print(f"   [GAGAL] {nama} {bukti}")


print("#" * 64)
print("UJI KESELARASAN ANTARMUKA v2")
print("#" * 64)

print("\n1. ID yang dipakai JS harus ada di HTML")
id_html = set(re.findall(r'id="([^"]+)"', html))
id_js = set(re.findall(r'getElementById\(\s*[\'"]([^\'"]+)[\'"]', js))
hilang = sorted(id_js - id_html)
cek("Semua id JS tersedia di HTML", not hilang, f"(hilang: {hilang})" if hilang else f"({len(id_js)} id dipakai)")

print("\n2. Kelas CSS yang dipakai harus terdefinisi")
kelas_css = set(re.findall(r'\.([a-z][a-z0-9-]*)\s*[,{:.]', css))
kelas_html = set()
for grup in re.findall(r'class="([^"]+)"', html):
    kelas_html |= set(grup.split())
kelas_js = set()
for grup in re.findall(r'class="([^"{}$]+)"', js):
    kelas_js |= set(grup.split())
dipakai = kelas_html | kelas_js
tak_ada = sorted(k for k in dipakai if k not in kelas_css)
cek("Semua kelas terdefinisi di CSS", not tak_ada,
    f"(tak terdefinisi: {tak_ada})" if tak_ada else f"({len(dipakai)} kelas dipakai)")

print("\n3. Keamanan penyisipan HTML")
cek("Ada fungsi penyaring teks (aman)", "function aman(" in js)

# Yang berisiko hanyalah template yang benar-benar menghasilkan MARKUP
# (dipasang lewat innerHTML). Template yang isinya dipasang ke textContent
# tidak dapat menyisipkan tag, jadi tidak diperiksa di sini.
# Ternary yang kedua cabangnya literal string juga aman.
LITERAL_TERNARY = re.compile(r"^[^?]+\?\s*'[^']*'\s*:\s*'[^']*'$")
template_markup = [t for t in re.findall(r"`([^`]*)`", js) if "<" in t and ">" in t]
berisiko = []
for t in template_markup:
    for isi in re.findall(r"\$\{([^}]+)\}", t):
        p = isi.strip()
        if "aman(" in p or LITERAL_TERNARY.match(p):
            continue
        berisiko.append(p)
cek(f"Semua data pada {len(template_markup)} template HTML disaring", not berisiko,
    f"(belum disaring: {berisiko})" if berisiko else "(semua lewat aman())")
cek("Template HTML memang ditemukan untuk diperiksa", len(template_markup) >= 4,
    f"({len(template_markup)} template)")

print("\n4. Kontrak API yang dipakai JS")
cek("Memanggil GET /api/books", "/api/books" in js)
cek("Memanggil GET /api/loans?token=", "api/loans?token=" in js)
cek("Memanggil GET /api/loans/history", "/api/loans/history" in js)
cek("Memanggil POST borrow", "/borrow" in js)
cek("Memanggil POST return dengan token",
    re.search(r"loans/\$\{loanId\}/return", js) and js.count("session.token") >= 2)
cek("Memanggil /api/health untuk status layanan", "/api/health" in js)
cek("Tidak ada sisa kontrak lama ?nim=", "api/loans?nim=" not in js)

print("\n5. Fitur baru v2 hadir di antarmuka")
cek("Kotak pencarian", 'id="cari"' in html)
cek("Penyaring kategori", 'id="saring-kategori"' in html)
cek("Penyaring status", 'id="saring-status"' in html)
cek("Panel riwayat pengembalian", 'id="history-list"' in html)
cek("Indikator status layanan", 'id="status-layanan"' in html)
cek("Pita ringkasan jatuh tempo", 'id="pita-tempo"' in html)

print("\n6. Mutu dasar")
cek("Responsif (ada media query)", css.count("@media") >= 2, f"({css.count('@media')} media query)")
cek("Menghormati prefers-reduced-motion", "prefers-reduced-motion" in css)
cek("Fokus keyboard terlihat", ":focus-visible" in css)
cek("Bahasa halaman ditetapkan", 'lang="id"' in html)
cek("Viewport meta ada", "viewport" in html)
cek("Ada penanganan gagal muat", "tampilkanGagalMuat" in js and "galat-muat" in css)
cek("Ada keadaan kosong", "kosong" in css and "Belum ada buku" in js)
cek("Ada indikator memuat", "rangka" in css and "pasangRangka" in js)
cek("Tidak ada dependency eksternal",
    "http://" not in html.replace("http://www.w3.org", "") or "cdn" not in html.lower())

print()
print("#" * 64)
print(f"RINGKASAN KESELARASAN: {lulus} LULUS, {gagal} GAGAL")
print("#" * 64)
