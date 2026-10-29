# WasteTrack

Prototipe pengelolaan sampah dengan frontend React, REST API Express, dan database SQLite lokal.

## Struktur

```text
frontend/   React + Vite, UI dan konfigurasi frontend
backend/    Express REST API dan koneksi SQLite
database/   Skema SQLite dan data awal kategori
```

## Persiapan

1. Gunakan Node.js 22.12+ (menggunakan modul SQLite bawaan Node.js).
2. Jalankan `npm install` dari folder root.
3. Salin `backend/.env.example` menjadi `backend/.env`.
4. Atur nama, email, serta kata sandi admin awal pada variabel `BOOTSTRAP_ADMIN_*`. Akun admin hanya dibuat jika email tersebut belum ada; gunakan kata sandi kuat dan jangan bagikan file `.env`.
5. Untuk mengaktifkan notifikasi WhatsApp, isi `FONNTE_TOKEN` di `backend/.env` dengan token API dari [Fonnte](https://docs.fonnte.com/token-api-key/). Token tidak diperlukan untuk menjalankan aplikasi; tanpa token, permintaan dan perubahan status tetap diproses tanpa mengirim WhatsApp.

Database SQLite dan tabel akan dibuat otomatis pada `backend/data/wastetrack.sqlite` saat API pertama kali dijalankan. Lokasi file dapat diubah melalui `SQLITE_PATH`.

## Menjalankan

Buka dua terminal dari folder root:

```sh
npm run dev
```

```sh
npm run dev:backend
```

Frontend tersedia di `http://localhost:5173`, API di `http://localhost:4000`. Frontend meneruskan request `/api` ke backend.

Perintah pemeriksaan:

```sh
npm run build
npm run lint
```

## Endpoint API

- `GET /api/health`
- `POST /api/auth/register` untuk membuat akun nasabah.
- `POST /api/auth/login`, `GET /api/auth/me`, dan `POST /api/auth/logout` menggunakan bearer token.
- `GET /api/admin/users` dan `POST /api/admin/users` khusus admin; admin dapat mendaftarkan petugas atau admin lain.
- `POST /api/rewards/redeem` khusus nasabah; saldo poin dikurangi secara atomik dan permintaan penukaran tercatat.
- `GET /api/categories`
- `GET /api/dashboard/summary` untuk akun yang sedang masuk.
- `GET /api/pickups` (nasabah hanya melihat miliknya, petugas melihat pekerjaan yang ditugaskan/menunggu, admin melihat semua).
- `POST /api/pickups` khusus nasabah dengan `pickupDate`, `pickupAddress`, serta array `details` berisi `categoryId` dan `weightKg`.
- `PATCH /api/pickups/:id/status` khusus petugas/admin; petugas menugaskan dan memperbarui status jemput, admin memvalidasi setoran yang telah dijemput.

Poin baru masuk ke saldo hanya saat transaksi berubah menjadi `completed`. Detail menyimpan snapshot harga poin saat permintaan dibuat supaya perubahan harga kategori tidak mengubah hitungan transaksi lama. Penukaran poin memeriksa dan mengurangi saldo di server dalam transaksi database.

Jika `FONNTE_TOKEN` dikonfigurasi, WasteTrack mengirim WhatsApp ke nomor telepon nasabah saat permintaan penjemputan dibuat, ditugaskan ke petugas, dijemput, dan selesai diverifikasi. Nomor telepon diambil dari profil nasabah. Status pengiriman dikembalikan oleh API dan ditampilkan di notifikasi aplikasi; kegagalan Fonnte tidak membatalkan transaksi.

Sesi disimpan sebagai hash di database, berlaku selama 12 jam, dan dicabut saat logout. Pendaftaran publik hanya membuat akun nasabah; akun petugas/admin dibuat melalui admin yang sudah masuk. Ringkasan grafik historis masih memakai ilustrasi statis.
