# DBeaver dan Postman

## DBeaver

DBeaver adalah aplikasi untuk mengelola database. Jalankan server PostgreSQL melalui `scripts/Start-Database.ps1`, atau pakai server PostgreSQL yang sudah terpasang, sebelum membuat koneksi.

1. Pilih **Database → New Database Connection → PostgreSQL**.
2. Isi konfigurasi berikut untuk PostgreSQL portabel proyek:

| Field | Nilai |
|---|---|
| Host | 127.0.0.1 |
| Port | 5432 |
| Database | eiembeauty |
| Username | eiem |
| Password | eiem_local_password |
| SSL | Disable untuk localhost |

3. Klik **Test Connection**; jika diminta driver PostgreSQL, izinkan unduhan driver DBeaver.
4. Jalankan backend agar migrasi/seed dibuat, lalu refresh koneksi dan buka **Schemas → public → Tables**.
5. Enam tabel soal tersedia sebagai ms_user, ms_distributor, ms_outlet, ms_product, tr_order_header, tr_order_detail. Tabel user_sessions mendukung login.

SQL untuk melihat pesanan:

```sql
SELECT h.order_number, h.order_date, h.order_status,
       h.outlet_name, h.distributor_name,
       SUM(d.qty_ordered) AS total_qty,
       SUM(d.total_price) AS total_harga
FROM tr_order_header h
JOIN tr_order_detail d USING (order_number)
GROUP BY h.order_number
ORDER BY h.order_date DESC;
```

Password akun berada sebagai hash bcrypt pada ms_user.user_password. Nomor handphone pengguna menjadi primary key; tidak ada password pengguna bawaan. Data distributor/outlet/produk tersedia dari seed. Riwayat order baru muncul setelah checkout atau pengujian API/browser.

## Postman

1. Jalankan PostgreSQL dan Go backend. Frontend tidak diperlukan untuk mencoba API langsung.
2. Pilih **Import**, lalu pilih kedua file pada folder `postman`:
   - eiembeauty.postman_collection.json
   - localhost.postman_environment.json
3. Aktifkan environment **eiembeauty localhost**.
4. Biarkan cookie jar aktif; login menyimpan cookie HttpOnly eiem_session otomatis. Tidak memakai bearer token.
5. Jalankan collection berurutan melalui **Run collection**, atau buka request satu per satu.

Ada 17 request dengan assertion otomatis: health, distributor, outlet STD/JKT, registrasi, password salah, login, akun aktif, produk, preview, kuantitas tidak valid, simpan order, retry tanpa duplikasi, riwayat, detail, logout, dan akses sesudah logout.

Environment base_url = `http://127.0.0.1:8080/api`. Variabel phone dibuat otomatis saat registrasi jika masih kosong; password fixture = `TestPassword123!`. Variabel idempotency_key dan order_number diisi otomatis. Untuk membuat akun baru pada run berikutnya, kosongkan phone. Akun/order pengujian disimpan di database lokal dan dapat diperiksa di DBeaver.

Contoh checkout adalah 5 EI-A01 + 3 EI-A03 = 8 unit / Rp300.000. Kalau Anda mengubah harga atau seed melalui DBeaver, sesuaikan assertion/body expected_total di Postman.

Untuk menjalankan collection tanpa membuka aplikasi Postman, gunakan Newman yang disertakan sebagai alat pengujian:

```powershell
Set-Location D:\WorkStation\eiembeauty\tools
npm.cmd run test:api
```

Hasil eksekusi yang benar-benar dijalankan selama pembangunan dicatat pada `docs/TEST_REPORT.md`.
