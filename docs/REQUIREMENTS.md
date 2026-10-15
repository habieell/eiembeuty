# Spesifikasi dan pemetaan dokumen

Sumber: lampiran **Soal Coding Test.docx**, IT Developer – PT Cantik Alami Sehat, dari percakapan Cari Test Coding. Semua teks XML Word, enam tabel, dan 15 gambar embedded diekstrak. Gambar diperiksa langsung; rendering halaman Word tidak tersedia karena runtime tidak menyediakan LibreOffice. Salinan media asli tersedia di `docs/reference`, dan aset aplikasi disalin tanpa mengubah isi gambarnya.

## Alur

Flowchart image1: login menggunakan nomor handphone → registrasi bila belum terdaftar → login → dashboard → buat pesanan → pilih produk → keranjang → checkout → simpan → kembali ke dashboard → riwayat pesanan. Halaman detail tersedia dari riwayat.

## Referensi UI dan aset

| Media | Isi |
|---|---|
| image1.png | Flowchart lengkap |
| image2.png | Login |
| image3.png | Registrasi dengan distributor dan outlet bergantung |
| image4.png | Dashboard, outlet, distributor, buat pesanan, riwayat |
| image5.png–image6.png | Form pemesanan, 3 produk, harga, jumlah, tambah keranjang |
| image7.png | Keranjang, hapus produk, total, checkout |
| image8.png | Ringkasan checkout dan simpan pesanan |
| image9.png | Riwayat order |
| image10.png–image11.png | Detail order dan total |
| image12.png | Logo asli → public/assets/logo.png |
| image13.png | EI-A01 Acne + Anti-Aging Serum 20ml → acne-serum.png |
| image14.png | EI-A02 Hydration Booster Serum 20ml → hydration-serum.png |
| image15.png | EI-A03 Brightening Serum 20ml → brightening-serum.png |

Harga dari screenshot: EI-A01 Rp30.000; EI-A02 Rp40.000; EI-A03 Rp50.000. Contoh order 5 EI-A01 + 3 EI-A03 = 8 unit / Rp300.000 digunakan dalam pengujian. Outlet BAL-STD-00240 Angga Kosmetik dan distributor STD CV. Sagara Timur Dewata mengikuti screenshot. Dewata Beauty dan distributor/outlet Jakarta merupakan data fixture tambahan untuk menguji dropdown bergantung, bukan data resmi yang dinyatakan di Word.

## Enam tabel sumber

| Tabel Word | Implementasi | Field sumber |
|---|---|---|
| Ms User | ms_user | PhoneNumber (PK), UserName, UserPassword, KodeOutlet, KodeDistributor |
| MsDistributor | ms_distributor | KodeDistributor (PK), NamaDistributor |
| MsOutlet | ms_outlet | KodeOutlet (PK), NamaOutlet, KodeDistributor |
| MsProduct | ms_product | KodeSKU (PK), NamaSKU, ImageURL, HargaJual |
| TrOrderHeader | tr_order_header | OrderNumber (PK), OrderDate, PhoneNumber, KodeOutlet, KodeDistributor, OrderStatus |
| TrOrderDetail | tr_order_detail | OrderNumber + LineNumber (PK), KodeSKU, QtyOrdered, UnitPrice, TotalPrice |

Nama SQL memakai snake_case. Tanggal memakai timestamptz, kuantitas memakai integer, dan harga memakai numeric rupiah tanpa pecahan (semua harga seed berupa rupiah bulat), menggantikan varchar pada tabel contoh agar validasi dan perhitungan terjamin. Foreign key gabungan memastikan outlet milik distributor. Snapshot nama, gambar, serta harga menjaga detail order lama ketika katalog berubah. Tabel tambahan user_sessions menyimpan hash token sesi; cart disimpan lokal per akun. Idempotency key mencegah duplikasi checkout yang diulang.

## Penyesuaian responsif

Palet biru muda/teal, kartu putih, logo, aset produk, field registrasi, isi dashboard, dan alur halaman mengikuti referensi. Desktop menggunakan lebar konten maksimal 1160px, katalog tiga kolom, keranjang/checkout dua kolom; tablet dua kolom katalog; ponsel satu kolom dengan navigasi bawah. Form mempunyai label dan fokus keyboard. Ukuran 375px, 768px, dan 1440px menjadi target pengujian browser.

Tidak ada pembayaran eksternal, ongkir, upload, pengiriman notifikasi, atau perubahan status admin dalam dokumen. Simpan pesanan mencatat status awal **Menunggu Diproses**.
