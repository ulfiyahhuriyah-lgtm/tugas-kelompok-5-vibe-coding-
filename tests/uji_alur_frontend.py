"""
Meniru persis urutan pemanggilan yang dilakukan frontend/app.js di browser,
untuk memastikan penyesuaian kontrak API (token) tidak memutus alur UI.
"""
import subprocess, time, json, urllib.request, urllib.error, os, signal, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
procs = []
out = []
lulus = 0
gagal = 0


def p(s=""):
    print(s)
    out.append(str(s))


def cek(nama, kondisi, detail=""):
    global lulus, gagal
    if kondisi:
        lulus += 1
        p(f"   [LULUS] {nama} {detail}")
    else:
        gagal += 1
        p(f"   [GAGAL] {nama} {detail}")


def start(script, port):
    f = open(f"/tmp/svc_{port}.log", "w")
    procs.append(subprocess.Popen(["node", script], cwd=BASE, stdout=f, stderr=f,
                                  stdin=subprocess.DEVNULL, start_new_session=True))


def req(method, url, body=None, timeout=5, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode(errors="replace")
            return resp.status, (txt if raw else json.loads(txt or "{}"))
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors="replace")
        if raw:
            return e.code, txt
        try:
            return e.code, json.loads(txt or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, ({"err": str(e)} if not raw else str(e))


start("user-service/server.js", 4001)
start("book-service/server.js", 4002)
start("frontend/server.js", 4000)
time.sleep(2.5)

try:
    p("#" * 64)
    p("SIMULASI ALUR BROWSER (meniru frontend/app.js)")
    p("#" * 64)

    p("LANGKAH 0 — Browser memuat halaman & aset")
    for aset in ["/", "/style.css", "/config.js", "/app.js"]:
        st, _ = req("GET", "http://localhost:4000" + aset, raw=True)
        cek(f"Muat {aset}", st == 200, f"(HTTP {st})")

    p()
    p("LANGKAH 0b — Konsistensi app.js dengan kontrak API baru")
    _, appjs = req("GET", "http://localhost:4000/app.js", raw=True)
    cek("fetchLoans memakai ?token=", "api/loans?token=" in appjs)
    cek("returnBook mengirim token", re.search(r"loans/\$\{loanId\}/return", appjs) and
        appjs.count("session.token") >= 2)
    cek("Tidak ada sisa ?nim= di frontend", "api/loans?nim=" not in appjs)

    p()
    p("LANGKAH 1 — Submit form login (US-01)")
    st, d = req("POST", "http://localhost:4001/api/login",
                {"nim": "2441919054", "nama": "Huriyah Ulfiah"})
    token = d.get("token")
    cek("Login berhasil & token diterbitkan", st == 200 and bool(token), f"(HTTP {st})")

    p()
    p("LANGKAH 2 — renderAll(): ambil buku + pinjaman secara paralel")
    st1, books = req("GET", "http://localhost:4002/api/books")
    st2, loans = req("GET", f"http://localhost:4002/api/loans?token={token}")
    cek("fetchBooks()", st1 == 200 and len(books["books"]) == 6, f"({len(books['books'])} buku)")
    cek("fetchLoans(token) saat masih kosong", st2 == 200 and loans["loans"] == [],
        f"({len(loans['loans'])} loan)")

    p()
    p("LANGKAH 3 — Klik tombol 'Pinjam' pada buku pertama (AC-01)")
    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": token})
    cek("borrowBook() berhasil", st == 201, f"(HTTP {st})")
    loan_id = d["loan"]["id"] if st == 201 else None
    if st == 201:
        cek("Toast dapat menampilkan judul & jatuh tempo",
            bool(d["book"]["title"]) and bool(d["loan"]["dueDate"]))

    p()
    p("LANGKAH 4 — renderAll() ulang: panel 'Peminjaman Saya' terisi (AC-04)")
    st, loans = req("GET", f"http://localhost:4002/api/loans?token={token}")
    ok = st == 200 and len(loans["loans"]) == 1
    cek("Pinjaman muncul di panel", ok, f"({len(loans.get('loans', []))} loan)")
    if ok:
        l = loans["loans"][0]
        cek("Judul buku ikut terkirim (loan.book)", l.get("book") and l["book"]["title"] == "Pemrograman Dasar",
            f"({l['book']['title'] if l.get('book') else 'None'})")
        cek("Tanggal pinjam & jatuh tempo tersedia",
            bool(l.get("borrowDate")) and bool(l.get("dueDate")))

    p()
    p("LANGKAH 5 — Klik tombol 'Kembalikan'")
    st, d = req("POST", f"http://localhost:4002/api/loans/{loan_id}/return", {"token": token})
    cek("returnBook() berhasil", st == 200, f"(HTTP {st})")
    st, books = req("GET", "http://localhost:4002/api/books")
    b1 = [x for x in books["books"] if x["id"] == "B001"][0]
    cek("Buku kembali berstatus tersedia", b1["available"] is True)
    st, loans = req("GET", f"http://localhost:4002/api/loans?token={token}")
    cek("Panel 'Peminjaman Saya' kembali kosong", len(loans["loans"]) == 0,
        f"({len(loans['loans'])} loan)")

    p()
    p("LANGKAH 6 — Sesi kedaluwarsa: token ditolak -> UI paksa login ulang")
    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": "sesi-sudah-mati"})
    cek("borrow dengan token mati -> 401", st == 401, f"(HTTP {st})")
    st, d = req("GET", "http://localhost:4002/api/loans?token=sesi-sudah-mati")
    cek("fetchLoans dengan token mati -> 401 (app.js balas [])", st == 401, f"(HTTP {st})")

    p()
    p("#" * 64)
    p(f"RINGKASAN ALUR BROWSER: {lulus} LULUS, {gagal} GAGAL")
    p("#" * 64)

finally:
    for pr in procs:
        try:
            os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
        except Exception:
            pass
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil_alur_frontend.txt"), "w") as f:
        f.write("\n".join(out))
