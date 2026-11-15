# HERO: portal admin dan portal astronot

HERO memantau kesehatan mata (SANS), kesehatan mental (BHP), dan lingkungan kabin ISS tiap astronot. Project ini dibangun dengan **Next.js (App Router)** dan memisahkan dua portal yang berjalan di satu server:

| Portal | Alamat | Untuk |
|---|---|---|
| Admin | `http://localhost:3000/admin` | Pengelola semua data (juga bertindak sebagai flight surgeon) |
| Astronot | `http://localhost:3000/astronot` | Astronot, termasuk pemimpin kabin |

Hak akses diperiksa di **server**, bukan hanya di tampilan. Astronot tidak menerima data di luar haknya sama sekali, dan setiap perubahan yang dikirim ke server diperiksa ulang.

## Menjalankan

Butuh Node.js 20.9 atau lebih baru.

```bash
cd hero-project
npm install
npm run dev          # mode pengembangan (hot reload) di http://localhost:3000
```

Untuk produksi:

```bash
npm run build
npm start            # next start, port 3000
```

Font Geist di-host sendiri lewat `next/font` dan React/ikon dibundel saat build, jadi browser tidak lagi memuat apa pun dari CDN.

Saat pertama kali API dipanggil, server membuat `data/hero-db.json` dari `lib/server/seed.json`. Untuk kembali ke data awal: hentikan server lalu jalankan `npm run reset-data`, atau pakai tombol **Reset ke data contoh** di portal admin (menu Simulasi input).

### Pengaturan lewat variabel lingkungan

Secara bawaan `next start` mendengarkan di semua antarmuka jaringan. Untuk membatasi ke komputer ini saja: `npm start -- -H 127.0.0.1`.


| Variabel | Bawaan | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port server (atau `npm start -- -p 4000`) |
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
├── next.config.mjs        # header keamanan, konfigurasi Next.js
├── postcss.config.mjs     # Tailwind CSS v4 lewat PostCSS
├── app/
│   ├── layout.jsx         # <html>, font Geist (next/font), globals.css
│   ├── globals.css        # palet warna, font, dan aturan dasar HERO (tema gelap) + Tailwind
│   ├── page.jsx           # halaman pilih portal
│   ├── admin/page.jsx     # portal admin
│   ├── astronot/page.jsx  # portal astronot
│   └── api/               # Route Handler, satu folder per endpoint (lihat tabel API)
├── components/
│   ├── hero-portal.jsx    # memuat aplikasi hanya di browser (next/dynamic, ssr: false)
│   └── hero-app.jsx       # aplikasi React HERO (dipakai kedua portal lewat prop `portal`)
├── lib/
│   ├── rf-models.js       # model Random Forest (glaukoma, mental, kabin) dalam JavaScript
│   └── server/            # hanya dipakai di server
│       ├── http.js        # pembantu Route Handler: CSRF, sesi, JSON, error
│       ├── access.js      # SEMUA aturan hak akses (saring data & periksa perubahan)
│       ├── auth.js        # hash kata sandi scrypt, sesi, cookie, batas percobaan login
│       ├── store.js       # baca/tulis database JSON secara atomik
│       └── seed.json      # data awal (kata sandi polos hanya di sini, di-hash saat dimuat)
└── data/                  # dibuat otomatis, berisi hero-db.json
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

Endpoint lain di bawah `/api/` dijawab `404` dalam format JSON.

## Catatan keamanan

Ini prototipe. Sebelum dipakai sungguhan:

- jalankan di belakang HTTPS dan set `HERO_SECURE_COOKIE=1`;
- ganti semua kata sandi demo dan set `HERO_DEMO=0`;
- sesi disimpan di memori, jadi semua pengguna perlu masuk lagi setelah server dimulai ulang. Karena itu jalankan sebagai **satu proses Node** (`next start` atau server mandiri); platform serverless seperti Vercel tidak cocok tanpa memindahkan sesi dan data ke penyimpanan bersama;
- batas percobaan login memakai alamat dari header `X-Forwarded-For` (entri paling kanan), karena Route Handler Next.js tidak bisa membaca socket. Taruh server di belakang reverse proxy yang mengisi header ini;
- database berupa satu file JSON; untuk banyak pengguna sekaligus, pindahkan ke database sungguhan (skema PostgreSQL ada di menu Riset & SQL).

## Mengubah tampilan

Tailwind CSS v4 dikompilasi otomatis oleh Next.js lewat PostCSS, jadi kelas baru di `app/` atau `components/` langsung berlaku tanpa langkah kompilasi manual.

`app/globals.css` berisi palet warna, font, dan aturan dasar HERO (tema gelap).
