import subprocess, time, json, urllib.request, urllib.error, os, signal, threading

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
procs = []
out = []


def p(s):
    print(s)
    out.append(str(s))


def start(script, port):
    f = open(f"/tmp/svc_{port}.log", "w")
    pr = subprocess.Popen(["node", script], cwd=BASE, stdout=f, stderr=f,
                          stdin=subprocess.DEVNULL, start_new_session=True)
    procs.append(pr)
    return pr


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
    _, d = req("POST", "http://localhost:4001/api/login", {"nim": nim, "nama": nama})
    return d.get("token")


start("user-service/server.js", 4001)
start("book-service/server.js", 4002)
time.sleep(2.5)

try:
    tokA = login("1111", "Mahasiswa A")

    p("=" * 62)
    p("UJI B - Endpoint RETURN: bisakah orang lain mengembalikan buku A?")
    p("=" * 62)
    st, d = req("POST", "http://localhost:4002/api/books/B001/borrow", {"token": tokA})
    loanid = d["loan"]["id"]
    p(f"Mahasiswa A (nim 1111) pinjam B001 -> HTTP {st}, loanId={loanid}")
    p("Penyerang kirim POST /api/loans/<id>/return TANPA token apa pun:")
    st2, d2 = req("POST", f"http://localhost:4002/api/loans/{loanid}/return")
    p(f"   -> HTTP {st2}  {json.dumps(d2)[:110]}")
    st3, d3 = req("GET", "http://localhost:4002/api/books")
    b = [x for x in d3["books"] if x["id"] == "B001"][0]
    p(f"   -> Status B001 sesudahnya: available={b['available']}, borrowedBy={b['borrowedBy']}")
    if st2 == 200 and b["available"]:
        p(">>> TEMUAN BUG #1: endpoint return TIDAK memvalidasi token sama sekali")
    else:
        p(">>> OK")

    p("")
    p("=" * 62)
    p("UJI C - Race condition: 6 request pinjam serentak (batas 3)")
    p("=" * 62)
    tokC = login("3333", "Mahasiswa C")
    res = {}

    def borrow(bid):
        res[bid] = req("POST", f"http://localhost:4002/api/books/{bid}/borrow", {"token": tokC})[0]

    ths = [threading.Thread(target=borrow, args=(x,))
           for x in ["B001", "B002", "B003", "B004", "B005", "B006"]]
    for t in ths:
        t.start()
    for t in ths:
        t.join(timeout=10)
    p("   Status per request: " + ", ".join(f"{k}:{v}" for k, v in sorted(res.items())))
    st, d = req("GET", "http://localhost:4002/api/loans?nim=3333")
    n = len(d.get("loans", []))
    p(f"   -> Pinjaman aktif Mahasiswa C: {n} buku")
    if n > 3:
        p(">>> TEMUAN BUG #2: batas 3 tembus akibat race condition")
    else:
        p(">>> OK: batas 3 dipatuhi")

    p("")
    p("=" * 62)
    p("UJI D - Return loan yang tidak ada")
    p("=" * 62)
    st, d = req("POST", "http://localhost:4002/api/loans/L-ngawur/return")
    p(f"   -> HTTP {st}  {json.dumps(d)[:100]}")

    p("")
    p("=" * 62)
    p("UJI E - Return DUA KALI loan yang sama (idempotensi)")
    p("=" * 62)
    tokD = login("4444", "Mahasiswa D")
    st, d = req("POST", "http://localhost:4002/api/books/B002/borrow", {"token": tokD})
    if st == 201:
        lid = d["loan"]["id"]
        s1, _ = req("POST", f"http://localhost:4002/api/loans/{lid}/return")
        s2, _ = req("POST", f"http://localhost:4002/api/loans/{lid}/return")
        p(f"   Return #1 -> HTTP {s1} | Return #2 -> HTTP {s2}")
        if s2 == 200:
            p(">>> TEMUAN BUG #3: return ganda diterima (idempotensi tidak dijaga)")
        else:
            p(">>> OK")
    else:
        p(f"   (B002 tidak tersedia saat ini, HTTP {st})")

    p("")
    p("=" * 62)
    p("UJI F - GET /api/loans tanpa otorisasi (privasi data mahasiswa lain)")
    p("=" * 62)
    st, d = req("GET", "http://localhost:4002/api/loans?nim=1111")
    p(f"   Siapa pun bisa baca pinjaman nim 1111 -> HTTP {st}, {len(d.get('loans', []))} loan")
    if st == 200:
        p(">>> TEMUAN BUG #4: data peminjaman mahasiswa dapat dibaca tanpa login")

finally:
    for pr in procs:
        try:
            os.killpg(os.getpgid(pr.pid), signal.SIGKILL)
        except Exception:
            pass
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil_adversarial.txt"), "w") as f:
        f.write("\n".join(out))
