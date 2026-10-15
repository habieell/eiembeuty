# eiem.beauty — Portal Pemesanan Mitra

Aplikasi responsif mobile-first sesuai flow dan aset Word: Next.js + TypeScript, REST API Go Gin, dan PostgreSQL lokal. Login menggunakan nomor handphone dan password bcrypt. Registrasi memilih distributor lalu outlet yang sesuai. Pesanan disimpan dalam satu transaksi dan dapat dilihat kembali melalui riwayat/detail.

## Struktur proyek

```text
backend/             Go Gin, autentikasi, checkout, pengujian API
  db/                SQL schema dan seed
frontend/            Next.js App Router, UI responsif, pengujian Playwright
  app/               halaman dan stylesheet
  components/        UI dan state akun/cart
  lib/               API client dan tipe
  public/assets/     logo dan tiga gambar produk asli Word
tools/               PostgreSQL portabel lokal (opsional)
scripts/             setup, start, test PowerShell dan ekstraksi Word
docs/                pemetaan spesifikasi, laporan pengujian, semua media asli
postman/             collection 17 request dan environment localhost
```

## Persiapan Windows PowerShell

Memerlukan Node.js 22 LTS atau lebih baru, npm, dan Go 1.24 atau lebih baru pada PATH. Unduhan dependensi memerlukan internet saat setup; aplikasi setelah setup hanya menggunakan localhost. Semua gambar dan font berasal dari file lokal/sistem, tanpa CDN.

Tipografi memakai **Poppins** Regular, Medium, dan SemiBold untuk tampilan toko kecantikan yang lebih lembut. File font serta lisensi OFL disimpan di `frontend/public/fonts`, sehingga font tetap tersedia tanpa internet.

```powershell
Set-Location D:\WorkStation\eiembeauty
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1
```

Setup menggunakan lockfile npm dan go.sum, mengunduh dependensi, serta menyalin contoh konfigurasi jika file env belum ada. Pengaturan yang sudah ada tidak ditimpa. `npm.cmd` menghindari pembatasan execution policy pada npm.ps1.

## Menjalankan semuanya lokal

Jalankan tiga terminal PowerShell dari folder proyek, berurutan:

```powershell
# Terminal 1 — PostgreSQL sungguhan, tanpa memasang service Windows
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Database.ps1
```

Tunggu pesan PostgreSQL siap, lalu:

```powershell
# Terminal 2 — migrasi dan backend
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Backend.ps1
```

Tunggu API siap di port 8080, lalu:

```powershell
# Terminal 3 — frontend
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Frontend.ps1
```

Buka [http://localhost:3000](http://localhost:3000), pilih **Daftar di sini**, lalu registrasi. Tidak ada akun/password pengguna bawaan. Pilih **CV. Sagara Timur Dewata → Angga Kosmetik** untuk mengikuti contoh di Word. Tekan Ctrl+C di masing-masing terminal untuk berhenti. Database portabel menyimpan data di `.local/postgres`, sehingga order tetap ada setelah restart.

Panduan koneksi **DBeaver** dan import **Postman** tersedia di `docs/DBEAVER_POSTMAN.md`. Collection dan environment berada di folder `postman`.

## Konfigurasi env

`backend/.env`:

```dotenv
DATABASE_URL=postgres://eiem:eiem_local_password@127.0.0.1:5432/eiembeauty?sslmode=disable
ADDR=127.0.0.1:8080
FRONTEND_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
COOKIE_SECURE=false
GIN_MODE=release
```

`frontend/.env.local`:

```dotenv
API_ORIGIN=http://127.0.0.1:8080
```

Next.js meneruskan `/api/*` ke Go sehingga cookie HttpOnly memakai origin frontend yang sama. Token acak disimpan sebagai SHA-256 di database, berumur 24 jam, dan dicabut saat logout. Password disimpan sebagai bcrypt. `COOKIE_SECURE=false` untuk HTTP localhost. Gunakan satu alamat frontend secara konsisten karena localhost dan 127.0.0.1 mempunyai penyimpanan browser/cookie berbeda. Restart frontend setelah mengganti env.

## Alternatif PostgreSQL yang sudah terpasang

Lewati terminal database portabel jika PostgreSQL sendiri sudah berjalan. Setup dapat memakai `-SkipPortableDatabase`. Contoh SQL dijalankan melalui psql sebagai administrator database:

```powershell
psql -U postgres -h 127.0.0.1 -c "CREATE ROLE eiem LOGIN PASSWORD 'eiem_local_password';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE eiembeauty OWNER eiem;"
```

Sesuaikan DATABASE_URL. Dari `backend`, jalankan `go run . migrate` lalu `go run .`. Migrasi dan seed dapat dijalankan kembali tanpa menghapus data. SQL juga dapat dibaca/dijalankan dari `backend/db/001_schema.sql` dan `002_seed.sql`. Jika port 5432 sudah dipakai, gunakan instance yang ada atau set `$env:PGPORT='5433'` sebelum menjalankan database portabel, lalu sesuaikan DATABASE_URL dan URL pengujian.

## Pengujian lokal

Lihat `docs/TEST_REPORT.md` untuk hasil yang benar-benar dijalankan. Suite integration membuat schema sementara `test_eiem_*`, menjalankan migrasi/seed, lalu menghapus schema tersebut. Ia tidak membersihkan tabel aplikasi. Akun/order browser test ditambahkan sebagai data pengujian di database aplikasi.

Dengan ketiga server aktif:

```powershell
Set-Location frontend
npx.cmd playwright install chromium
Set-Location ..
powershell -ExecutionPolicy Bypass -File .\scripts\Test-Local.ps1
```

Atau per bagian:

```powershell
Set-Location backend
$env:TEST_DATABASE_URL='postgres://eiem:eiem_local_password@127.0.0.1:5432/eiembeauty?sslmode=disable'
go test -count=1 -v ./...
go vet ./...
Set-Location ..\frontend
npm.cmd run build
npm.cmd run test:e2e
```

Tanpa TEST_DATABASE_URL, test integration Go ditandai **SKIP**, bukan lulus. Playwright memakai frontend di `http://localhost:3000`; override dengan `$env:E2E_BASE_URL`. Pengujian browser menguji registrasi, dropdown, login, cart, checkout, riwayat, detail, logout, dan overflow pada viewport ponsel/tablet/desktop. Jika Chromium belum diunduh atau server tidak aktif, tes browser gagal.

Jika Chrome atau Edge sudah terpasang, Anda dapat memakai `$env:E2E_BROWSER_CHANNEL='chrome'` atau `'msedge'` sebelum `npm.cmd run test:e2e`, sehingga unduhan Chromium tidak diperlukan.

Untuk menjalankan hasil production build lokal: hentikan frontend dev, lalu `npm.cmd run build` dan `npm.cmd start` di folder frontend.

## API

| Method | Endpoint | Kegunaan |
|---|---|---|
| GET | /api/health | Kesiapan database |
| GET | /api/distributors | Daftar distributor |
| GET | /api/outlets?distributor=STD | Outlet berdasarkan distributor |
| POST | /api/auth/register | phone_number, user_name, password, kode_outlet, kode_distributor |
| POST | /api/auth/login | phone_number, password |
| GET | /api/auth/me | Akun aktif |
| POST | /api/auth/logout | Cabut sesi |
| GET | /api/products | Katalog |
| POST | /api/checkout/preview | Ringkasan dengan harga database |
| POST | /api/orders | Simpan transactional, header Idempotency-Key wajib |
| GET | /api/orders | Riwayat akun aktif |
| GET | /api/orders/:number | Detail milik akun aktif |

Contoh body checkout:

```json
{"items":[{"kode_sku":"EI-A01","quantity":5},{"kode_sku":"EI-A03","quantity":3}],"expected_total":300000}
```

Kirim Content-Type application/json dan Idempotency-Key acak 16–64 karakter (mis. UUID) ketika menyimpan pesanan. Gunakan key yang sama untuk retry pesanan yang sama. Server memvalidasi kuantitas 1–999, menolak SKU duplikat/tidak dikenal, mengabaikan harga lokal dengan menolak field harga tambahan, dan membandingkan expected_total dengan harga database. Kegagalan salah satu detail membatalkan seluruh transaksi. Harga dan nama produk disimpan sebagai snapshot. Tidak ada pengurangan stok karena tabel stok tidak diberikan pada soal.

## Periksa manual

1. Registrasi nomor baru, ubah distributor dan pastikan pilihan outlet sebelumnya direset.
2. Login, buka Buat Pesanan; tambah 5 EI-A01 dan 3 EI-A03.
3. Keranjang menampilkan 8 unit / Rp300.000. Uji tambah, kurang, dan hapus.
4. Checkout, simpan, lalu lihat konfirmasi di dashboard dan detail melalui riwayat.
5. Refresh detail dan restart backend/database; order tetap tersimpan.
6. Login akun lain dan pastikan order akun pertama tidak terlihat.
7. Uji lebar ponsel 375px, tablet 768px, desktop 1440px serta navigasi keyboard.

Penjelasan tabel, penyesuaian tipe, fixture tambahan, dan pemetaan semua gambar tersedia di `docs/REQUIREMENTS.md`.

Dokumentasi dependensi: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [Go Gin](https://gin-gonic.com/docs/), [PostgreSQL](https://www.postgresql.org/docs/), [PostgreSQL portabel](https://github.com/leinelissen/embedded-postgres).
# eiembeuty
