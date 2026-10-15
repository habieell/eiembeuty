# Hasil pengujian lokal

Tanggal: **15 Oktober 2026**, zona pengguna Asia/Jakarta.

## Ringkasan hasil yang dijalankan

| Pemeriksaan | Hasil |
|---|---|
| Next.js production build dan TypeScript | PASS |
| go vet ./... | PASS |
| TestNormalizePhone | PASS |
| TestAPIIntegration dengan PostgreSQL 18.0 sungguhan | PASS, 11 subtest, tidak di-skip |
| Postman collection melalui Newman | PASS, 17 request / 30 assertion / 0 gagal |
| Browser Chrome 375 × 812 | PASS, seluruh alur |
| Browser Chrome 768 × 1024 | PASS, seluruh alur |
| Browser Chrome 1440 × 1000 | PASS, seluruh alur |

Run browser akhir menggunakan server Next.js production (`npm start`), Go API di 127.0.0.1:8080, dan PostgreSQL di 127.0.0.1:5432. Ringkasan Playwright: **3 passed**, 0 skipped, 0 unexpected, 0 flaky; durasi 43,6 detik. Setiap alur memeriksa tidak ada overflow horizontal, tidak ada error JavaScript halaman, dan tidak ada HTTP 5xx. Screenshot final setelah penyesuaian Poppins tersimpan di `docs/screenshots` (21 gambar). Ini pengujian emulasi viewport Chrome pada Windows, bukan pengujian perangkat fisik atau Safari/Firefox.

## Pengujian integration Go

Suite membuat schema terisolasi `test_eiem_*`, menjalankan SQL schema/seed dua kali untuk memastikan dapat diulang, lalu menghapus schema pengujian. Subtest yang lulus:

1. Authorization dan outlet yang terfilter berdasarkan distributor.
2. Validasi registrasi, outlet/distributor tidak cocok, nomor duplikat, dan verifikasi hash bcrypt di database.
3. Password salah, login benar, cookie HttpOnly/SameSite, dan penolakan origin asing.
4. Penolakan SKU tidak dikenal, kuantitas nol, SKU duplikat, harga tambahan dari client, expected_total salah, dan idempotency key kosong.
5. Preview 8 unit / Rp300.000; simpan 1 header dan 2 detail; retry menghasilkan order yang sama.
6. Riwayat/detail dan harga snapshot tetap Rp30.000 setelah harga katalog diubah menjadi Rp31.000 pada schema pengujian.
7. Akun lain tidak dapat melihat riwayat/detail akun pertama (404 untuk detail).
8. Dua permintaan checkout bersamaan dengan key sama menghasilkan tepat satu order baru.
9. Trigger pengujian memaksa kegagalan pada detail kedua: tidak ada header/detail parsial yang tersimpan. Setelah trigger dilepas, retry berhasil.
10. Logout mencabut sesi; sesi yang kadaluarsa ditolak.
11. Pembatasan percobaan login menghasilkan HTTP 429.

HTTP 500 pada subtest rollback memang dipicu sengaja untuk menguji transaksi. Subtest tersebut lulus karena semua baris transaksi dibatalkan. Run awal tanpa TEST_DATABASE_URL ditandai SKIP; hasil yang dilaporkan di atas berasal dari run berikutnya dengan PostgreSQL sungguhan dan seluruh subtest aktif.

## Alur browser pada setiap viewport

Registrasi → outlet awal disabled → pilih STD/Angga Kosmetik → ganti JKT dan pastikan outlet direset → kembali STD → registrasi berhasil → login salah ditolak → login benar → dashboard → pilih produk → kuantitas nol disabled → tambah 5 EI-A01, 1 EI-A02, 3 EI-A03 → hapus EI-A02 → kurangi/tambah EI-A01 → refresh cart → total 8 unit / Rp300.000 → preview checkout → simpan → cart kosong → dashboard sukses → detail → refresh detail → riwayat berisi satu order akun pengujian → logout → URL detail mengarahkan kembali ke login.

Pengujian awal menemukan label dropdown yang kurang tegas untuk pencarian berdasarkan label, pesan registrasi yang hilang pada navigasi antarhalaman, dan locator test yang berbenturan dengan live region Next.js. Label dan persistensi pesan diperbaiki; locator dipersempit. Run akhir pada ketiga viewport lulus.

## Postman dan lingkungan lokal

Collection diuji melalui Newman terhadap backend HTTP sungguhan. Semua 17 request dan 30 assertion lulus. Aplikasi desktop Postman dan DBeaver tidak dioperasikan otomatis; file impor Postman serta konfigurasi koneksi DBeaver disediakan di `docs/DBEAVER_POSTMAN.md`.

Runtime pembangunan: Windows, Go 1.27.2, Node.js 25.3.0, Next.js 16.4.1, PostgreSQL portabel 18.0. File lock mengikat versi dependensi yang digunakan.

Pengujian sempat terhalang izin filesystem/koneksi localhost pada sandbox Windows; eksekusi yang memerlukan akses tersebut diulang dengan izin host. Unduhan Chromium Playwright terputus; run browser menggunakan Chrome yang sudah terpasang (`E2E_BROWSER_CHANNEL=chrome`).

Dokumen Word dibaca melalui XML beserta semua tabel dan 15 media embedded. Media diperiksa langsung, dan empat aset aplikasi disalin dari sumber tanpa modifikasi. Rendering halaman Word tidak dapat dijalankan karena LibreOffice tidak tersedia; tidak ada klaim bahwa rendering halaman Word telah diverifikasi.

## Mengulang pengujian

Ikuti bagian Pengujian lokal pada README. Jalankan PostgreSQL, API, serta frontend terlebih dahulu. Jika memakai browser yang sudah terpasang:

```powershell
$env:E2E_BROWSER_CHANNEL='chrome'
powershell -ExecutionPolicy Bypass -File .\scripts\Test-Local.ps1
```

Untuk collection Postman dari terminal, masuk ke tools lalu jalankan `npm.cmd run test:api`. Akun dan order browser/Newman adalah data pengujian dan tetap tersimpan pada database aplikasi lokal; pengujian integration Go menggunakan schema sementara.

## Penyesuaian font beauty

Font diganti menjadi Poppins Regular, Medium, dan SemiBold, tersimpan lokal bersama lisensi OFL. Build production di D:/WorkStation/eiembeauty/frontend lulus setelah perubahan font. Suite browser diulang pada preview dev localhost yang aktif, dengan runner dari proyek D:; ketiga ukuran layar kembali lulus (3 passed, 22,8 detik). Suite memeriksa computed font-family Poppins, font berhasil dimuat, seluruh alur order, tidak ada overflow horizontal, error JavaScript, atau HTTP 5xx.

Akun dan pesanan dari database preview sebelumnya disalin ke database lokal proyek D: dalam transaksi tanpa menimpa record yang sudah ada. Data runtime tidak dimasukkan ke ZIP sumber.
