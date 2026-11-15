# HERO: portal admin dan portal astronot

HERO memantau kesehatan mata (SANS), kesehatan mental (BHP), dan lingkungan kabin ISS tiap astronot. Project ini memisahkan dua website yang berjalan di satu server:

| Portal | Alamat | Untuk |
|---|---|---|
| Admin | `http://localhost:3000/admin/` | Pengelola semua data (juga bertindak sebagai flight surgeon) |
| Astronot | `http://localhost:3000/astronot/` | Astronot, termasuk pemimpin kabin |

Hak akses diperiksa di **server**, bukan hanya di tampilan. Astronot tidak menerima data di luar haknya sama sekali, dan setiap perubahan yang dikirim ke server diperiksa ulang.

## Menjalankan

Butuh Node.js 18 atau lebih baru. Tidak ada paket yang perlu di-install.

```bash
cd hero-project
npm start            # atau: node server/server.js
```

Lalu buka `http://localhost:3000`. Browser perlu internet karena React dan font dimuat dari CDN (esm.sh dan Google Fonts).

Saat pertama dijalankan, server membuat `data/hero-db.json` dari `server/seed.json`. Untuk kembali ke data awal: hentikan server lalu jalankan `npm run reset-data`, atau pakai tombol **Reset ke data contoh** di portal admin (menu Simulasi input).

### Pengaturan lewat variabel lingkungan

| Variabel | Bawaan | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port server |
| `HOST` | `127.0.0.1` | Pakai `0.0.0.0` agar bisa diakses dari perangkat lain di jaringan |
| `HERO_DATA_DIR` | `./data` | Folder file database |
| `HERO_DEMO` | `1` | `0` untuk menyembunyikan daftar akun demo di halaman login |
| `HERO_SECURE_COOKIE` | `0` | `1` jika server di belakang HTTPS (cookie sesi diberi tanda `Secure`) |

## Akun demo

Kata sandi semua akun: `password123`.

| Akun | Peran | Modul kabin |
|---|---|---|
| `admin@nasa.gov` | Admin | Semua |
| `alex.vinson@nasa.gov` | Astronot, **pemimpin kabin** | INC-004 Node 2 (bersama Marcus) |
| `marcus.vance@nasa.gov` | Astronot | INC-004 Node 2 (bersama Alex) |
| `elena.rostova@nasa.gov` | Astronot, **pemimpin kabin** | INC-051 Node 2 (bersama Kenji) |
| `kenji.takahashi@jaxa.jp` | Astronot | INC-051 Node 2 (bersama Elena) |

Akun admin hanya bisa masuk lewat portal admin, dan akun astronot hanya lewat portal astronot.

## Hak akses

| Data | Admin | Astronot | Pemimpin kabin (tambahan) |
|---|---|---|---|
| Profil & pemeriksaan diri sendiri (mata, mental, vital, countermeasure) | Lihat & kelola | Lihat & kelola | |
| Profil & pemeriksaan rekan sekabin | Lihat & kelola | Hanya lihat | |
| Astronot di modul kabin lain | Lihat & kelola | Tidak terlihat | |
| Bacaan lingkungan kabin modulnya | Lihat & kelola | Hanya lihat | Kelola |
| Penugasan misi, modul, misi baru | Kelola | Lihat milik sendiri (jadwal pemeriksaan & durasi boleh diubah) | |
| Menetapkan pemimpin kabin | Ya | Tidak | |
| Mendaftarkan astronot & akun baru | Ya | Tidak | |
| Menyetujui/menghentikan protokol (LBNP, lingkungan, BHP) | Ya | Hanya lihat | |
| Reset data contoh | Ya | Tidak | |

"Rekan sekabin" berarti astronot yang ditugaskan di modul kabin (`quartersModuleId`) yang sama dengan salah satu penugasan Anda. Data dari misi lain milik rekan tersebut tetap tidak terlihat.

Admin mengganti pemimpin kabin di **Simulasi input → Profil & penugasan** (pilih astronot di modul itu). Pemimpin kabin harus kru yang memang ditugaskan di modul tersebut.

## Struktur project

```
hero-project/
├── package.json
├── server/
│   ├── server.js      # HTTP server, routing API, file statis
│   ├── access.js      # SEMUA aturan hak akses (saring data & periksa perubahan)
│   ├── auth.js        # hash kata sandi scrypt, sesi, cookie, batas percobaan login
│   ├── store.js       # baca/tulis database JSON secara atomik
│   └── seed.json      # data awal (kata sandi polos hanya di sini, di-hash saat dimuat)
├── tailwind/theme.css # sumber Tailwind untuk hero.css
├── public/
│   ├── index.html     # halaman pilih portal
│   ├── admin/index.html
│   ├── astronot/index.html
│   └── shared/
│       ├── app.js         # aplikasi React (dipakai kedua portal; portal ditentukan window.HERO_PORTAL)
│       ├── hero.css       # Tailwind CSS yang sudah dikompilasi
│       └── rf-models.js   # model Random Forest (glaukoma, mental, kabin) dalam JavaScript
└── data/              # dibuat otomatis, berisi hero-db.json
```

## API

Semua permintaan yang mengubah data wajib membawa header `X-HERO-Request: 1` (perlindungan CSRF, ditambah cookie `SameSite=Strict`).

| Metode | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/demo-accounts?portal=admin\|astronot` | Daftar akun demo (mati jika `HERO_DEMO=0`) |
| `POST` | `/api/login` | `{ email, password, portal }` |
| `POST` | `/api/logout` | Mengakhiri sesi |
| `GET` | `/api/session?portal=...` | Pengguna aktif + data yang boleh dilihat |
| `GET` | `/api/db` | Data yang boleh dilihat |
| `POST` | `/api/sync` | `{ changes: [{ table, op: 'insert'\|'update'\|'delete', row }] }`; perubahan yang tidak diizinkan ditolak satu per satu dengan alasannya |
| `POST` | `/api/admin/reset` | Reset ke data contoh (admin) |

## Catatan keamanan

Ini prototipe. Sebelum dipakai sungguhan:

- jalankan di belakang HTTPS dan set `HERO_SECURE_COOKIE=1`;
- ganti semua kata sandi demo dan set `HERO_DEMO=0`;
- sesi disimpan di memori, jadi semua pengguna perlu masuk lagi setelah server dimulai ulang;
- database berupa satu file JSON; untuk banyak pengguna sekaligus, pindahkan ke database sungguhan (skema PostgreSQL ada di menu Riset & SQL).

## Mengubah tampilan

`public/shared/hero.css` adalah hasil kompilasi Tailwind CSS v4 dari kelas yang dipakai di folder `public/`. Jika Anda menambah kelas Tailwind baru, kompilasi ulang (butuh internet untuk `npx`):

```bash
npx @tailwindcss/cli -i tailwind/theme.css -o public/shared/hero.css
```

`tailwind/theme.css` berisi palet warna, font, dan aturan dasar HERO (tema gelap).
