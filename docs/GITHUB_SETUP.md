# Panduan Push ke GitHub (Repository Public, Satu Kelompok)

1. **Buat repository baru di GitHub** (Public), misalnya `perpustakaan-microservice`.
2. **Tambahkan seluruh anggota kelompok** sebagai collaborator (Settings → Collaborators), atau buat di bawah GitHub Organization kelompok — pastikan semua anggota bisa push ke repo yang SAMA (ketentuan tugas: satu kelompok satu repository).
3. Di folder proyek ini, jalankan:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: microservice perpustakaan (user-service, book-service, frontend)"
   git branch -M main
   git remote add origin https://github.com/<username-atau-org>/perpustakaan-microservice.git
   git push -u origin main
   ```
4. **Setiap anggota wajib melakukan commit sendiri** (bukan hanya satu orang push semuanya) — misalnya:
   - Anggota A: commit implementasi `user-service`
   - Anggota B: commit implementasi `book-service`
   - Anggota C: commit `frontend` + diagram arsitektur
   
   Contoh alur per anggota (setelah clone repo yang sama):
   ```bash
   git clone https://github.com/<username-atau-org>/perpustakaan-microservice.git
   cd perpustakaan-microservice
   # ...lakukan perubahan sesuai bagian masing-masing...
   git add .
   git commit -m "feat: tambah validasi input pada book-service"
   git push
   ```
5. Isi tabel **Kontribusi Anggota Kelompok** di `README.md` sesuai pembagian kerja sebenarnya.
6. Sebelum submit, pastikan repository berstatus **Public** (Settings → General → Change repository visibility) agar dapat diakses saat penilaian.
