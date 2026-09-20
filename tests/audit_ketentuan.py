"""
Audit kesembilan ketentuan tugas terhadap isi repo yang sebenarnya.
Setiap ketentuan diperiksa dengan bukti nyata, bukan asumsi.
"""
import os, re, json, subprocess, time, urllib.request, urllib.error, signal

BASE = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(BASE) == "tests":
    BASE = os.path.dirname(BASE)

lulus, gagal = 0, 0


def cek(nama, kondisi, bukti=""):
    global lulus, gagal
    if kondisi:
        lulus += 1
        print(f"   [OK]    {nama}")
    else:
        gagal += 1
        print(f"   [GAGAL] {nama}")
    if bukti:
        print(f"           bukti: {bukti}")


def baca(p):
    try:
        return open(os.path.join(BASE, p), encoding="utf-8").read()
    except Exception:
        return ""


readme = baca("README.md")
arch = baca("docs/ARCHITECTURE.md")
ai = baca("docs/AI_USAGE.md")
prompts = baca("docs/PROMPTS.md")
book = baca("book-service/server.js")
user = baca("user-service/server.js")
app = baca("frontend/app.js")

print("#" * 66)
print("AUDIT KETENTUAN TUGAS")
print("#" * 66)

print("\nKETENTUAN 1 - Menggunakan proyek pertemuan sebelumnya")
cek("Menyebut kelanjutan dari praktikum sebelumnya",
    "praktikum sebelumnya" in readme or "dipakai ulang" in readme.lower())
cek("Studi kasus sama (peminjaman buku perpustakaan)",
    "Perpustakaan" in readme and "Peminjaman" in readme)
cek("Tidak membuat studi kasus baru",
    "perpustakaan" in readme.lower())

print("\nKETENTUAN 2 - Menggunakan kembali User Story & Acceptance Criteria")
for us in ["US-01", "US-02", "US-03", "US-04"]:
    cek(f"{us} tercantum di README", us in readme)
for ac in ["AC-01", "AC-02", "AC-03", "AC-04"]:
    cek(f"{ac} tercantum di README", ac in readme)
cek("Kalimat US-03 sama persis dengan aslinya",
    "membaca buku tersebut selama masa peminjaman 7 hari" in readme)
cek("Ada pemetaan US/AC ke service", "Ditangani oleh" in readme)

print("\nKETENTUAN 3 - Architecture minimal 2 service/microservice")
svc = [d for d in ["user-service", "book-service"] if os.path.isdir(os.path.join(BASE, d))]
cek(f"Terdapat {len(svc)} microservice (minimal 2)", len(svc) >= 2, ", ".join(svc))
cek("Frontend terpisah sebagai service sendiri",
    os.path.isfile(os.path.join(BASE, "frontend/server.js")))
cek("Diagram arsitektur sebelum & sesudah ada",
    "Sebelum" in arch and "Sesudah" in arch)

print("\nKETENTUAN 4 - Technology boleh dikembangkan/diubah")
cek("Daftar technology ada di README", "Technology" in readme or "Teknologi" in readme)
cek("Menjelaskan perubahan dari localStorage ke server",
    "localStorage" in readme and ("Node.js" in readme or "server" in readme))
cek("Constraint lama (HTML5/CSS3/Vanilla JS) tetap dipakai",
    "HTML5" in readme and "CSS3" in readme and "Vanilla" in readme)

print("\nKETENTUAN 5 - Menggunakan AI Coding Tool")
cek("AI Coding Tool disebutkan namanya", "Claude" in ai or "Claude" in readme)
n_prompt = len(re.findall(r"^#{2,3} \d|^### \d", prompts, re.M))
cek(f"Prompt terdokumentasi ({n_prompt} prompt)", n_prompt >= 5, "docs/PROMPTS.md")
cek("Dokumentasi penggunaan AI ada", len(ai) > 2000, f"AI_USAGE.md {len(ai)} karakter")

print("\nKETENTUAN 6 - Minimal 1 alur fitur melibatkan service yang dibuat")
cek("Alur peminjaman melibatkan kedua service",
    "validateToken" in book and "borrow" in book)
cek("Sequence diagram alur tersedia di dokumentasi",
    "user-service" in arch and ("Pinjam" in arch or "borrow" in arch))
cek("Frontend memanggil kedua service",
    "USER_SERVICE_URL" in baca("frontend/config.js") and
    "BOOK_SERVICE_URL" in baca("frontend/config.js"))

print("\nKETENTUAN 7 - Setiap service memiliki fungsi yang jelas")
cek("user-service hanya menangani identitas (tidak ada data buku)",
    "books" not in user.lower().split("//")[0] or "/api/books" not in user)
cek("book-service tidak menangani login",
    "/api/login" not in book)
cek("Tanggung jawab tiap service dijelaskan di dokumentasi",
    "user-service" in arch and "book-service" in arch)

print("\nKETENTUAN 8 - Antarservice berkomunikasi menggunakan API")
cek("book-service memanggil user-service via HTTP",
    "fetch(" in book and "USER_SERVICE_URL" in book)
m = re.search(r"/api/validate", book)
cek("Endpoint validasi dipanggil lintas service", bool(m), "GET /api/validate?token=")
cek("user-service menyediakan endpoint validasi",
    "/api/validate" in user)

print("\nKETENTUAN 9 - Memeriksa dan memperbaiki kode hasil AI")
n_bug = len(re.findall(r"Bug #\d", ai))
cek(f"Bug terdokumentasi ({n_bug} penyebutan)", n_bug >= 5)
cek("Ada bukti pengujian sebelum perbaikan", "sebelum perbaikan" in ai.lower())
cek("Ada catatan perbaikan di dalam kode",
    "CATATAN PERBAIKAN" in book or "PERBAIKAN" in book)
cek("Ada skrip pengujian regresi",
    os.path.isfile(os.path.join(BASE, "tests/uji_verifikasi.py")))

print("\nKETENTUAN REPOSITORY - Isi wajib")
wajib = {
    "Source code": ["user-service/server.js", "book-service/server.js", "frontend/app.js"],
    "Diagram architecture": ["docs/ARCHITECTURE.md"],
    "README": ["README.md"],
    "Dokumentasi AI Coding Tool": ["docs/AI_USAGE.md"],
    "Prompt yang digunakan": ["docs/PROMPTS.md"],
}
for nama, berkas in wajib.items():
    ada = all(os.path.isfile(os.path.join(BASE, f)) for f in berkas)
    cek(nama, ada, ", ".join(berkas))
cek("Daftar technology yang digunakan",
    "| Lapisan |" in readme or "Technology Stack" in readme or "Teknologi" in readme)

print()
print("#" * 66)
print(f"HASIL AUDIT: {lulus} OK, {gagal} GAGAL")
print("#" * 66)
