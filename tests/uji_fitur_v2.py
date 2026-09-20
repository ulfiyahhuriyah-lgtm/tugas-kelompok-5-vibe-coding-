"""Uji fitur baru pada pengembangan v2 (pencarian, penyaringan, riwayat, sisa hari)."""
import subprocess, time, json, urllib.request, urllib.error, os, signal

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
procs = []
lulus = gagal = 0


def cek(nama, kondisi, bukti=""):
    global lulus, gagal
    if kondisi:
        lulus += 1
        print(f"   [LULUS] {nama} {bukti}")
    else:
        gagal += 1
        print(f"   [GAGAL] {nama} {bukti}")


def start(script, port):
    f = open(f"/tmp/svc_{port}.log", "w")
    procs.append(subprocess.Popen(["node", script], cwd=BASE, stdout=f, stderr=f,
                                  stdin=subprocess.DEVNULL, start_new_session=True))


def req(method, url, body=None, timeout=5):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"err": str(e)}


start("user-service/server.js", 4001)
start("book-service/server.js", 4002)
time.sleep(2.5)

try:
    print("#" * 64)
    print("UJI FITUR BARU v2")
    print("#" * 64)

    _, d = req("POST", "http://localhost:4001/api/login", {"nim": "2441919061", "nama": "Ridho"})
    tok = d["token"]

    print("\n1. DATA BUKU DIPERKAYA")
    st, d = req("GET", "http://localhost:4002/api/books")
    b = d["books"][0]
    for f in ["kategori", "tahun", "isbn", "sinopsis"]:
        cek(f"Field '{f}' tersedia", f in b, f"({b.get(f)})" if f != "sinopsis" else "")
    cek("Daftar kategori dikirim", "kategori" in d and len(d["kategori"]) >= 3,
        f"({d.get('kategori')})")
    cek("Jumlah total & ditampilkan dikirim", d.get("total") == 6 and d.get("ditampilkan") == 6)

    print("\n2. PENCARIAN (?q=)")
    st, d = req("GET", "http://localhost:4002/api/books?q=data")
    judul = [x["title"] for x in d["books"]]
    cek("Cari 'data' menemukan hasil relevan", len(d["books"]) >= 2, f"({judul})")
    st, d = req("GET", "http://localhost:4002/api/books?q=MAYA")
    cek("Pencarian tidak peka huruf besar/kecil", len(d["books"]) == 1,
        f"({[x['title'] for x in d['books']]})")
    st, d = req("GET", "http://localhost:4002/api/books?q=tidakada")
    cek("Kata kunci tanpa hasil mengembalikan daftar kosong", d["books"] == [])

    print("\n3. PENYARINGAN (?kategori= & ?status=)")
    st, d = req("GET", "http://localhost:4002/api/books?kategori=Jaringan")
    cek("Saring kategori 'Jaringan'", len(d["books"]) == 1,
        f"({[x['title'] for x in d['books']]})")
    st, d = req("GET", "http://localhost:4002/api/books?status=tersedia")
    cek("Saring status 'tersedia'", len(d["books"]) == 6, f"({d['ditampilkan']} buku)")

    print("\n4. SISA HARI PADA PEMINJAMAN")
    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": tok})
    cek("Pinjam B001 berhasil", st == 201)
    st, d = req("GET", f"http://localhost:4002/api/loans?token={tok}")
    l = d["loans"][0]
    cek("Field 'sisaHari' tersedia", "sisaHari" in l, f"({l.get('sisaHari')} hari)")
    cek("Sisa hari bernilai 7", l.get("sisaHari") == 7)
    cek("Field 'terlambat' tersedia dan false", l.get("terlambat") is False)

    print("\n5. RIWAYAT PEMINJAMAN (endpoint baru)")
    st, d = req("GET", f"http://localhost:4002/api/loans/history?token={tok}")
    cek("Riwayat masih kosong sebelum pengembalian", st == 200 and d["loans"] == [],
        f"(HTTP {st})")
    st, dl = req("GET", f"http://localhost:4002/api/loans?token={tok}")
    lid = dl["loans"][0]["id"]
    req("POST", f"http://localhost:4002/api/loans/{lid}/return", {"token": tok})
    st, d = req("GET", f"http://localhost:4002/api/loans/history?token={tok}")
    cek("Setelah dikembalikan, muncul di riwayat", st == 200 and len(d["loans"]) == 1,
        f"({len(d.get('loans', []))} entri)")
    cek("Riwayat memuat detail buku",
        d["loans"] and d["loans"][0].get("book", {}).get("title") == "Pemrograman Dasar")
    cek("Riwayat memuat tanggal pengembalian", bool(d["loans"][0].get("returnDate")))

    print("\n6. OTORISASI ENDPOINT BARU")
    st, d = req("GET", "http://localhost:4002/api/loans/history")
    cek("Riwayat tanpa token ditolak", st == 401, f"(HTTP {st})")
    st, d = req("GET", "http://localhost:4002/api/loans/history?token=palsu")
    cek("Riwayat dengan token palsu ditolak", st == 401, f"(HTTP {st})")
    _, d2 = req("POST", "http://localhost:4001/api/login", {"nim": "9999", "nama": "Orang Lain"})
    st, d = req("GET", f"http://localhost:4002/api/loans/history?token={d2['token']}")
    cek("Token lain hanya melihat riwayatnya sendiri", st == 200 and d["loans"] == [],
        f"({len(d.get('loans', []))} entri)")

    print("\n7. REGRESI FITUR LAMA")
    st, d = req("GET", "http://localhost:4002/api/books")
    cek("Daftar buku tetap 6", len(d["books"]) == 6)
    st, d = req("POST", "http://localhost:4002/api/books/B002/borrow", {"token": tok})
    cek("AC-01 pinjam masih berjalan", st == 201, f"(HTTP {st})")
    st, d = req("POST", "http://localhost:4002/api/books/B002/borrow", {"token": tok})
    cek("AC-03 buku dipinjam ditolak", st == 409, f"(HTTP {st})")

    print()
    print("#" * 64)
    print(f"RINGKASAN FITUR v2: {lulus} LULUS, {gagal} GAGAL")
    print("#" * 64)

finally:
    for pr in procs:
        try:
            os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
        except Exception:
            pass
