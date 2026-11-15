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

Tanpa `DATABASE_URL`, data disimpan di file `data/hero-db.json` dan sesi di memori. Saat pertama kali API dipanggil, server membuat file itu dari data simulasi di `lib/server/seed.js`. Untuk kembali ke data awal: hentikan server lalu jalankan `npm run reset-data`, atau pakai tombol **Reset ke data contoh** di portal admin (menu Simulasi input).

## Deploy ke Vercel (database Neon Postgres)

Di Vercel, file sistem hanya-baca dan server berjalan di banyak instance. Karena itu HERO memakai Postgres secara otomatis jika ada `DATABASE_URL`. Data, sesi login, dan batas percobaan login semuanya disimpan di sana.

1. Di dashboard Vercel, buka proyek → **Storage** → pilih **Neon** (Serverless Postgres) → **Install / Create**. Paket gratis sudah cukup.
2. Hubungkan database ke proyek ini (**Connect Project**) untuk Production, Preview, dan Development. Vercel otomatis menambahkan `DATABASE_URL` di **Settings → Environment Variables**. Jika Anda memberi awalan lain, misalnya `STORAGE_DATABASE_URL`, itu juga dikenali.
3. **Deploy ulang** (**Deployments** → deploy terakhir → **Redeploy**). Variabel lingkungan baru hanya terbaca oleh deploy yang dibuat setelah variabel itu ditambahkan.
4. Buka situsnya dan login, misalnya `teguh@hero.com` / `password123`. Permintaan pertama otomatis membuat tabel (`hero_state`, `hero_sessions`, `hero_login_attempts`) dan mengisinya dengan data simulasi.

Kembali ke data simulasi di Vercel: login sebagai Admin → **Simulasi input → Reset ke data contoh**. (`npm run reset-data` hanya untuk file lokal.)

Cookie sesi otomatis bertanda `Secure` di Vercel. Jika muncul pesan "Database belum tersambung" atau "Gagal terhubung ke database", periksa langkah 2–3. Untuk memakai database Neon yang sama dari komputer sendiri, jalankan `vercel env pull .env.local` lalu `npm run dev`.

**Cara datanya disimpan:**
- Seluruh data HERO disimpan sebagai satu dokumen JSONB di baris `hero_state`, dengan kolom `version`.
- Setiap permintaan membaca salinannya sendiri. Saat menyimpan, versinya dicek (*optimistic locking*). Jika permintaan lain sudah menyimpan lebih dulu, permintaan diulang otomatis dengan data terbaru, termasuk semua pemeriksaan hak aksesnya.
- ID sesi disimpan sebagai hash SHA-256.

### Pengaturan lewat variabel lingkungan

Secara bawaan `next start` mendengarkan di semua antarmuka jaringan. Untuk membatasi ke komputer ini saja: `npm start -- -H 127.0.0.1`.


| Variabel | Bawaan | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port server (atau `npm start -- -p 4000`) |
| `HERO_DATA_DIR` | `./data` | Folder file database |
| `HERO_DEMO` | `1` | `0` untuk menyembunyikan daftar akun demo di halaman login |
| `GEMINI_API_KEY` | (kosong) | Mengaktifkan suara neural HERO AI Assistant (Gemini TTS) lewat `/api/tts`. Key hanya ada di server. Tanpa key, dipakai suara perangkat yang paling natural |
| `GEMINI_TTS_VOICE` | `Sulafat` | Nama suara Gemini, mis. `Achernar`, `Aoede`, `Kore` |
| `DATABASE_URL` | (kosong) | URL Postgres (Neon). Jika ada, data & sesi disimpan di Postgres; jika tidak, di file + memori |
| `HERO_SECURE_COOKIE` | `0` (`1` di Vercel) | `1` jika server di belakang HTTPS (cookie sesi diberi tanda `Secure`) |

## Akun demo (data simulasi)

Semua akun memakai email `[nama]@hero.com` dan kata sandi `password123`.

**Admin:** `teguh@hero.com`, `jeremy@hero.com`, `naila@hero.com`, `abel@hero.com`, `vinson@hero.com`, `nabillah@hero.com`

**Astronot** (3 misi, 3 orang per misi; semisi = sekabin):

| Misi | Kabin | Pemimpin Cabin | Anggota Cabin |
|---|---|---|---|
| INC-071 · Ekspedisi 71 (mulai 1 Jun 2026) | Node 2 Harmony | `raka@hero.com` (Cmdr. Raka Pratama) | `sari@hero.com`, `dimas@hero.com` |
| INC-072 · Ekspedisi 72 (mulai 20 Jul 2026) | Node 3 Tranquility | `putri@hero.com` (Cmdr. Putri Anggraini) | `bima@hero.com`, `laras@hero.com` |
| INC-073 · Ekspedisi 73 (mulai 10 Sep 2026) | Kibo JEM | `arif@hero.com` (Cmdr. Arif Hidayat) | `maya@hero.com`, `yoga@hero.com` |

Setiap astronot punya data pra-terbang dan 3 pemeriksaan di orbit (mata OD/OS, mental, vital, countermeasure), dan setiap kabin punya 3 bacaan lingkungan. Kondisinya sengaja beragam supaya semua status terlihat. Di tiap misi ada satu astronot dengan tanda SANS dan stres berat, satu sedang, dan satu normal. Kabin INC-071 juga lingkungannya paling bermasalah.

Akun Admin hanya bisa masuk lewat portal admin, dan akun astronot hanya lewat portal astronot.

**Mengganti data lama:** jika `data/hero-db.json` sudah ada dari versi sebelumnya (akun `@nasa.gov`), akun lama masih tersimpan di sana. Hentikan server, jalankan `npm run reset-data`, lalu jalankan lagi; atau login sebagai Admin lalu pakai **Simulasi input → Reset ke data contoh**.

## HERO AI Assistant (suara)

- Bahasa bawaan **Inggris**. Pilihan ID/EN diingat di browser.
- Mikrofon "Hi HERO" menyala otomatis setelah masuk, dan bisa dimatikan atau dinyalakan lewat tombol mikrofon di widget asisten (kanan bawah).
- Suara paling manusiawi didapat dengan mengisi `GEMINI_API_KEY` di Vercel (Settings → Environment Variables), lalu deploy ulang. Suara disintesis di server (`/api/tts`, hanya untuk pengguna yang sudah masuk), jadi key tidak pernah sampai ke browser.
- Tanpa key, asisten memakai suara perangkat yang paling natural, misalnya "Microsoft … Online (Natural)" di Edge atau "Google US English" di Chrome, dengan nada dan tempo normal.
- Daftar perintah (**Command list**) mengikuti role: perintah khusus Admin (Misi, Pengguna, Riset & SQL, tambah astronot, protokol) tidak tampil untuk astronot. Jika tetap diucapkan, asisten menolaknya dengan sopan.
- Logika perintah ada di `lib/voice-commands.js`. `tests/voice-commands.test.js` memastikan setiap frasa di daftar dipahami persis seperti deskripsinya, dalam kedua bahasa dan untuk kedua role.

## Autentikasi & otorisasi

### Autentikasi

HERO memakai sistem autentikasi buatan sendiri yang sudah ada sejak awal (tidak memakai Better Auth):

- Login di `/admin/login` atau `/astronot/login`. Kata sandi disimpan sebagai hash scrypt, dan login dibatasi 8 kali gagal per 10 menit.
- Sesi berupa ID acak 256-bit di cookie `hero_sid` (`HttpOnly`, `SameSite=Strict`, `Secure` di Vercel atau jika `HERO_SECURE_COOKIE=1`), disimpan di Postgres (atau memori saat lokal) sebagai hash. Sesi bertahan 8 jam sejak terakhir dipakai, termasuk setelah browser ditutup.
- Halaman diproteksi di server (`lib/server/guard-page.js`) sebelum HTML dikirim. Pengguna yang belum login dialihkan ke halaman login portal itu, dan pengguna yang membuka portal yang salah dialihkan ke portal miliknya.
- Setiap permintaan API membaca ulang akun dari database. Perubahan role atau akun yang dihapus langsung berlaku, dan sesi milik pengguna yang diangkat atau dihapus diakhiri.

### Tiga role

Role efektif dihitung di server dari database, tidak pernah dari data yang dikirim browser.

| Role | Dari mana |
|---|---|
| **Admin** | `accounts.role = 'admin'`. Boleh lebih dari satu, semua setara. |
| **Pemimpin Cabin** | Akun astronot yang tercatat di `modules.leaderAstronautId` untuk cabin tempat ia memang ditugaskan |
| **Anggota Cabin** | Akun astronot lainnya |

**Cabin** = modul tempat tinggal kru (`modules`). Astronot masuk cabin lewat `assignments.quartersModuleId`. Tidak ada tabel baru: struktur user, cabin, dan pemimpin sudah ada sebelumnya.

| Data / fitur | Admin | Pemimpin Cabin | Anggota Cabin |
|---|---|---|---|
| Profil & data kesehatan diri sendiri | Kelola | Kelola | Kelola |
| Profil & data kesehatan rekan sekabin | Kelola | Hanya lihat | Hanya lihat |
| Astronot & data di cabin lain | Kelola | Tidak terlihat | Tidak terlihat |
| Data lingkungan cabin | Semua cabin | Kelola cabin yang dipimpinnya | Hanya lihat cabinnya |
| Misi & kabin, penugasan, pendaftaran astronot, akun | Kelola | Lihat milik sendiri* | Lihat milik sendiri* |
| Menunjuk Pemimpin Cabin (per cabin) | Ya | Tidak | Tidak |
| Persetujuan protokol (LBNP, lingkungan, BHP) | Ya | Hanya lihat | Hanya lihat |
| Menu Pengguna, mengangkat Admin, Riset & SQL, reset data | Ya | Tidak | Tidak |

\* Jadwal pemeriksaan dan durasi penugasan sendiri boleh diubah.

### Perubahan role

Satu-satunya jalan untuk mengubah role adalah `POST /api/admin/users/:id/role` dengan body `{ "role": "admin" }`, dan hanya bisa dipakai Admin. Kolom `role` tidak bisa diubah lewat `/api/sync`.

| Dari | Ke | Hasil |
|---|---|---|
| Pemimpin Cabin / Anggota Cabin | Admin | Diizinkan. Kepemimpinan cabinnya dilepas; profil & data kesehatan tetap ada; ia masuk lagi lewat portal admin. |
| Admin | Admin | `409`, sudah Admin |
| Admin | Pemimpin / Anggota Cabin (atau role apa pun) | `403`, role Admin terlindungi |
| Pemimpin ↔ Anggota | | `403` lewat endpoint ini. Pemimpin ditunjuk per cabin di **Misi → Ganti pemimpin** (lihat di bawah). |
| Akun sendiri | | `403` |

Proteksi Admin juga berlaku di `/api/sync`: Admin tidak bisa menghapus akun Admin lain atau mengubah email, nama, maupun kata sandinya. Setiap Admin hanya mengelola akunnya sendiri. Akun Admin juga tidak bisa ditunjuk sebagai Pemimpin Cabin.

Pemeriksaan dan perubahan role berjalan dalam satu langkah sinkron di proses Node, tanpa `await` di antaranya, jadi tidak bisa diselipi permintaan lain.

### Di mana aturannya

| File | Isi |
|---|---|
| `lib/server/authz.js` | Helper terpusat: `getCurrentUser`, `requireAuth`, `requireRole`, `checkPermission`, `checkCabinAccess`, `canChangeRole`, `promoteToAdmin`, `portalRedirect` |
| `lib/server/access.js` | Penyaringan data per pengguna (`filterDb`) dan pemeriksaan tiap perubahan dari `/api/sync` |
| `lib/server/http.js` | Pembungkus Route Handler: CSRF, 401 jika belum login, 403 jika role tidak sesuai (`handler(fn, { roles: ['admin'] })`) |
| `lib/server/guard-page.js` | Proteksi halaman portal di server |

Menu di aplikasi menyesuaikan role (Admin melihat semua menu termasuk **Pengguna** dan **Riset & SQL**), tetapi itu hanya untuk tampilan. Semua aturan tetap diperiksa di server.

### Menunjuk Pemimpin Cabin

Hanya Admin yang bisa menentukan siapa Pemimpin Cabin, lewat **Misi → Ganti pemimpin** pada misi yang bersangkutan (`PUT /api/admin/missions/:id/leader`).

- Pilihannya hanya kru misi itu. Akun Admin tidak bisa dipilih, dan kabin juga boleh dibiarkan tanpa pemimpin.
- Pemimpin lama otomatis menjadi Anggota Cabin, dan pemimpin baru langsung bisa mengisi data lingkungan kabin tanpa perlu login ulang.
- Pemimpin dan Anggota Cabin mendapat `403` jika mencoba mengubahnya, baik lewat endpoint ini maupun `/api/sync`.

### Misi = kabin

Setiap misi punya tepat satu kabin, dan **astronot yang semisi selalu sekabin**. Dengan begitu mereka otomatis bisa saling melihat data (lihat tabel di atas).

- Admin mengelola misi di menu **Misi**: tambah, ubah (nama, tanggal, nama kabin), dan hapus. Membuat misi otomatis membuat kabinnya. Kode misi tidak bisa diubah.
- Misi yang masih punya astronot tidak bisa dihapus, supaya data kesehatan mereka tidak hilang. Misi kosong dihapus bersama kabin dan data lingkungan kabinnya.
- Astronot baru, baik dari **Kru → Daftarkan astronot** maupun **Simulasi input → Tambah astronot baru**, wajib memilih misi yang sudah ada. Misi tidak lagi dibuat otomatis dari kode yang diketik.
- Server selalu menentukan kabin dari misi penugasan, jadi `quartersModuleId` yang dikirim browser diabaikan. Misi dan kabin juga tidak bisa dibuat atau dihapus lewat `/api/sync`.
- Pemimpin kabin yang penugasannya dihapus otomatis dilepas dari kabin itu.

### Akun & kata sandi

Admin mengelola akun di menu **Pengguna**:

- **Tambah:** akun Admin baru, atau akun untuk astronot yang belum punya akun.
- **Ubah:** email dan kata sandi akun astronot, atau data akunnya sendiri.
- **Hapus:** akun Pemimpin/Anggota Cabin. Profil dan data kesehatannya tetap ada. Akun Admin tidak bisa dihapus.

Aturan kata sandi ada di `lib/password-policy.js`, dan dipakai sama persis oleh form di browser maupun server:

- 8–128 karakter, berisi huruf dan angka;
- tidak diawali atau diakhiri spasi;
- tidak sama dengan email atau bagian sebelum `@`;
- kolom "Ulangi kata sandi" harus sama.

Astronot baru tidak lagi mendapat kata sandi bawaan `password123`. Kata sandi juga tidak pernah disimpan di draf browser (localStorage). Mengganti kata sandi akun lain mengakhiri semua sesinya.

`/api/sync` sekarang **atomik**: jika satu perubahan saja ditolak, tidak ada yang disimpan. Contohnya, pendaftaran dengan kata sandi lemah tidak lagi meninggalkan astronot tanpa akun.

### Menguji

```bash
npm test
```

Ada 98 uji yang memanggil Route Handler sungguhan dengan database sementara. 43 skenario dijalankan dua kali: dalam mode file dan dalam mode Postgres (`tests/pg-*.test.js`, memakai database tiruan `tests/fake-pg.js`). `tests/postgres.test.js` menambahkan 5 uji khusus Postgres: pengisian awal, sesi di database, batas login, penulisan bersamaan, dan optimistic locking. `tests/rbac.test.js` menguji akses tanpa login, salah portal, isolasi cabin, IDOR, `cabinId` palsu, upaya menurunkan/menghapus/mengambil alih Admin, pengangkatan Admin, dan beberapa Admin bersamaan. `tests/admin-crud.test.js` menguji aturan kata sandi, CRUD akun, CRUD misi, semisi = sekabin, dan sinkronisasi atomik. `tests/cabin-leader.test.js` menguji penggantian Pemimpin Cabin. `tests/seed.test.js` memeriksa data simulasi (15 akun bisa masuk, 3 orang per misi, isolasi kabin). Uji lainnya memakai data uji tetap di `tests/fixtures/seed.json`, jadi tidak terpengaruh perubahan data demo.

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
│   ├── admin/             # portal admin: page.jsx + login/page.jsx
│   ├── astronot/          # portal astronot: page.jsx + login/page.jsx
│   └── api/               # Route Handler, satu folder per endpoint (lihat tabel API)
├── components/
│   ├── hero-portal.jsx    # memuat aplikasi hanya di browser (next/dynamic, ssr: false)
│   ├── hero-app.jsx       # aplikasi React HERO (dipakai kedua portal lewat prop `portal`)
│   ├── users-page.jsx     # halaman Pengguna: CRUD akun & angkat Admin (khusus Admin)
│   ├── missions-page.jsx  # halaman Misi: CRUD misi & kabinnya (khusus Admin)
│   └── admin-api.js       # pemanggil API & gaya tombol halaman Admin
├── lib/
│   ├── password-policy.js # aturan kata sandi (dipakai browser & server)
│   ├── rf-models.js       # model Random Forest (glaukoma, mental, kabin) dalam JavaScript
│   └── server/            # hanya dipakai di server
│       ├── authz.js       # helper otorisasi terpusat (role, permission, cabin, perubahan role)
│       ├── guard-page.js  # proteksi halaman portal di server
│       ├── missions.js    # aturan misi = kabin (buat, ubah, hapus)
│       ├── http.js        # pembantu Route Handler: CSRF, sesi, role, JSON, error
│       ├── access.js      # SEMUA aturan hak akses (saring data & periksa perubahan)
│       ├── auth.js        # hash kata sandi scrypt, sesi, cookie, batas percobaan login
│       ├── store.js       # baca/tulis data: Postgres (optimistic locking) atau file JSON
│       ├── pg.js          # koneksi & semua SQL Postgres (Neon), aktif jika DATABASE_URL ada
│       └── seed.js        # data simulasi awal (kata sandi polos hanya di sini, di-hash saat dimuat)
├── tests/                 # uji otorisasi & fitur Admin (npm test)
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
| `POST` | `/api/sync` | `{ changes: [{ table, op: 'insert'\|'update'\|'delete', row }] }`; atomik: jika ada yang ditolak, tidak ada yang disimpan dan semua alasannya dikembalikan |
| `POST` | `/api/admin/reset` | Reset ke data contoh (Admin) |
| `GET` | `/api/admin/users` | Semua pengguna dengan role efektif & cabin (Admin) |
| `POST` | `/api/admin/users` | Buat akun: `{ kind: 'admin', name, title?, email, password }` atau `{ kind: 'astronaut', astronautId, email, password }` (Admin) |
| `PATCH` | `/api/admin/users/:id` | Ubah `email`, `password` (dan `name`, `title` untuk akun Admin sendiri) (Admin) |
| `DELETE` | `/api/admin/users/:id` | Hapus akun Pemimpin/Anggota Cabin (Admin) |
| `GET` | `/api/admin/missions` | Misi beserta kabin, pemimpin, dan krunya (Admin) |
| `POST` | `/api/admin/missions` | `{ id, name, startDate, endDate?, cabinName? }`, membuat misi dan kabinnya (Admin) |
| `PATCH` | `/api/admin/missions/:id` | Ubah `name`, `startDate`, `endDate`, `cabinName` (Admin) |
| `PUT` | `/api/admin/missions/:id/leader` | `{ astronautId }` atau `{ astronautId: null }`, menunjuk/mengganti Pemimpin Cabin (Admin) |
| `DELETE` | `/api/admin/missions/:id` | Hapus misi kosong beserta kabinnya; `409` jika masih ada astronot (Admin) |
| `POST` | `/api/admin/users/:id/role` | `{ role: 'admin' }`, mengangkat Pemimpin/Anggota Cabin menjadi Admin (Admin) |

Endpoint lain di bawah `/api/` dijawab `404` dalam format JSON.

## Catatan keamanan

Ini prototipe. Sebelum dipakai sungguhan:

- jalankan di belakang HTTPS (di Vercel sudah otomatis), atau set `HERO_SECURE_COOKIE=1`;
- ganti semua kata sandi demo dan set `HERO_DEMO=0`;
- tanpa `DATABASE_URL`, sesi disimpan di memori dan data di satu file, jadi jalankan sebagai **satu proses Node**. Untuk Vercel atau banyak instance, pakai Postgres (lihat Deploy ke Vercel);
- batas percobaan login memakai alamat dari header `X-Forwarded-For` (entri paling kanan), karena Route Handler Next.js tidak bisa membaca socket. Taruh server di belakang reverse proxy yang mengisi header ini;
- di Postgres seluruh data masih disimpan sebagai satu dokumen JSONB, sehingga setiap penyimpanan menulis ulang seluruh data. Ini cukup untuk puluhan pengguna. Untuk skala lebih besar, pecah menjadi tabel-tabel (skema relasional ada di menu Riset & SQL).

## Mengubah tampilan

Tailwind CSS v4 dikompilasi otomatis oleh Next.js lewat PostCSS, jadi kelas baru di `app/` atau `components/` langsung berlaku tanpa langkah kompilasi manual.

`app/globals.css` berisi palet warna, font, dan aturan dasar HERO (tema gelap).
