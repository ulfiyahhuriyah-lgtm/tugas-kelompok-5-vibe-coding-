import subprocess, time, json, urllib.request, urllib.error, os, signal, socket

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
    pr = subprocess.Popen(["node", script], cwd=BASE, stdout=f, stderr=f,
                          stdin=subprocess.DEVNULL, start_new_session=True)
    procs.append(pr)


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


def login(nim, nama):
    return req("POST", "http://localhost:4001/api/login", {"nim": nim, "nama": nama})[1].get("token")


def raw_get(path):
    s = socket.create_connection(("localhost", 4000), timeout=5)
    s.sendall(f"GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".encode())
    data = b""
    try:
        while True:
            c = s.recv(4096)
            if not c:
                break
            data += c
    except Exception:
        pass
    s.close()
    return data.decode(errors="replace")


start("user-service/server.js", 4001)
start("book-service/server.js", 4002)
start("frontend/server.js", 4000)
time.sleep(2.5)

try:
    p("#" * 64)
    p("BAGIAN 1 — REGRESI: memastikan AC lama MASIH berjalan")
    p("#" * 64)
    tok = login("2441919061", "Ridho")
    cek("US-01 login menerbitkan token", bool(tok))

    st, d = req("POST", "http://localhost:4001/api/login", {"nim": "9", "nama": ""})
    cek("Validasi input login kosong ditolak", st == 400, f"(HTTP {st})")

    st, d = req("GET", "http://localhost:4002/api/books")
    cek("US-02 daftar buku tampil", st == 200 and len(d["books"]) == 6, f"({len(d.get('books', []))} buku)")

    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": tok})
    ok01 = st == 201
    if ok01:
        bd = d["loan"]["borrowDate"][:10]
        dd = d["loan"]["dueDate"][:10]
        from datetime import date
        selisih = (date.fromisoformat(dd) - date.fromisoformat(bd)).days
        cek("AC-01 pinjam buku tersedia", True, f"(HTTP 201, jatuh tempo +{selisih} hari)")
        cek("AC-01 masa pinjam tepat 7 hari", selisih == 7, f"(selisih={selisih})")
        cek("AC-01 status buku berubah", d["book"]["available"] is False)
    else:
        cek("AC-01 pinjam buku tersedia", False, f"(HTTP {st})")

    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": tok})
    cek("AC-03 buku sudah dipinjam ditolak", st == 409, f"(HTTP {st})")

    st, d = req("POST", "http://localhost:4002/api/books/B002/borrow", {"token": "palsu-123"})
    cek("Token palsu ditolak (antar-service)", st == 401, f"(HTTP {st})")

    req("POST", "http://localhost:4002/api/books/B002/borrow", {"token": tok})
    req("POST", "http://localhost:4002/api/books/B003/borrow", {"token": tok})
    st, d = req("POST", "http://localhost:4002/api/books/B004/borrow", {"token": tok})
    cek("AC-02 buku ke-4 ditolak", st == 409, f"(HTTP {st})")

    st, d = req("GET", f"http://localhost:4002/api/loans?token={tok}")
    cek("AC-04 lihat peminjaman saya", st == 200 and len(d.get("loans", [])) == 3,
        f"({len(d.get('loans', []))} loan aktif)")

    p()
    p("#" * 64)
    p("BAGIAN 2 — VERIFIKASI PERBAIKAN KEEMPAT BUG")
    p("#" * 64)

    p("BUG #1 — Return tanpa token / milik orang lain")
    tokX = login("2441919005", "Yuliani")
    st, d = req("GET", f"http://localhost:4002/api/loans?token={tok}")
    loan_ridho = d["loans"][0]["id"]
    st, d = req("POST", f"http://localhost:4002/api/loans/{loan_ridho}/return")
    cek("Return TANPA token ditolak", st == 401, f"(HTTP {st})")
    st, d = req("POST", f"http://localhost:4002/api/loans/{loan_ridho}/return", {"token": tokX})
    cek("Return dengan token ORANG LAIN ditolak", st == 403, f"(HTTP {st})")
    st, d = req("GET", "http://localhost:4002/api/books")
    b1 = [x for x in d["books"] if x["id"] == "B001"][0]
    cek("Buku korban tetap berstatus dipinjam", b1["available"] is False)

    p()
    p("BUG #2 — Idempotensi return")
    st, d = req("POST", f"http://localhost:4002/api/loans/{loan_ridho}/return", {"token": tok})
    cek("Pemilik sah berhasil mengembalikan", st == 200, f"(HTTP {st})")
    st, d = req("POST", f"http://localhost:4002/api/loans/{loan_ridho}/return", {"token": tok})
    cek("Return KEDUA kalinya ditolak", st == 409, f"(HTTP {st})")

    p()
    p("BUG #2b — Return ganda tidak boleh membebaskan buku orang lain")
    tokF = login("2441919023", "Firda")
    tokG = login("2441919054", "Huriyah")
    st, dF = req("POST", "http://localhost:4002/api/books/B005/borrow", {"token": tokF})
    lidF = dF["loan"]["id"]
    req("POST", f"http://localhost:4002/api/loans/{lidF}/return", {"token": tokF})
    st, dG = req("POST", "http://localhost:4002/api/books/B005/borrow", {"token": tokG})
    ok = st == 201
    req("POST", f"http://localhost:4002/api/loans/{lidF}/return", {"token": tokF})
    st, d = req("GET", "http://localhost:4002/api/books")
    b5 = [x for x in d["books"] if x["id"] == "B005"][0]
    cek("Buku milik G tetap terkunci setelah F return ulang",
        ok and b5["available"] is False and b5["borrowedBy"] == "2441919054",
        f"(available={b5['available']}, borrowedBy={b5['borrowedBy']})")

    p()
    p("BUG #3 — Privasi data peminjaman")
    st, d = req("GET", "http://localhost:4002/api/loans?nim=6666")
    cek("Akses via ?nim= (tanpa token) ditolak", st == 401, f"(HTTP {st})")
    st, d = req("GET", f"http://localhost:4002/api/loans?token={tokG}")
    milik_g = all(l["nim"] == "2441919054" for l in d.get("loans", []))
    cek("Token hanya mengembalikan data pemiliknya", st == 200 and milik_g,
        f"({len(d.get('loans', []))} loan, semua milik G={milik_g})")

    p()
    p("BUG #4 — Path traversal frontend")
    resp = raw_get("/../book-service/server.js")
    status = resp.split("\r\n")[0]
    bocor = "MAX_ACTIVE_BOOKS" in resp
    cek("Traversal ke folder lain diblokir", not bocor, f"({status})")
    resp = raw_get("/")
    cek("Halaman normal tetap dapat diakses", "200 OK" in resp.split("\r\n")[0],
        f"({resp.split(chr(13))[0]})")
    resp = raw_get("/style.css")
    cek("Aset statis tetap dapat diakses", "200 OK" in resp.split("\r\n")[0])

    p()
    p("#" * 64)
    p(f"RINGKASAN: {lulus} LULUS, {gagal} GAGAL")
    p("#" * 64)

finally:
    for pr in procs:
        try:
            os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
        except Exception:
            pass
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil_verifikasi.txt"), "w") as f:
        f.write("\n".join(out))
