# AI Hari Ini — Portal Berita AI Otomatis Gratis

Portal berita AI berbahasa Indonesia yang berjalan pada Cloudflare Workers + Static Assets + D1 + Cron Triggers. Sistem mengambil RSS/Atom dari sumber teknologi dan riset, menyaring topik AI, mendeteksi duplikat, membuat ringkasan berbasis aturan, membuat cover grafis otomatis, lalu menerbitkan berita yang memenuhi skor.

## Fitur

- Homepage premium, responsif, dark mode
- Halaman artikel dan kategori
- Pencarian
- RSS dan sitemap otomatis
- Database Cloudflare D1
- Ingestion RSS/Atom otomatis setiap jam
- Filter AI, klasifikasi kategori, scoring, deduplikasi
- Berita berisiko masuk status `review`
- Cover otomatis tanpa mengambil gambar media lain
- Sumber asli selalu ditampilkan
- Tanpa API AI berbayar

## 1. Persyaratan

- Node.js 20+
- Akun GitHub gratis
- Akun Cloudflare gratis

## 2. Jalankan lokal

```bash
npm install
npm run db:local
npm run dev
```

Buka `http://localhost:8787`.

Untuk memicu cron lokal:

```bash
curl http://localhost:8787/__scheduled
```

Refresh homepage setelah proses selesai.

## 3. Buat database D1 produksi

Login ke Cloudflare:

```bash
npx wrangler login
npx wrangler d1 create ai-hari-ini-db
```

Salin `database_id` hasil perintah ke `wrangler.jsonc`, menggantikan:

```text
REPLACE_WITH_YOUR_D1_DATABASE_ID
```

Buat tabel produksi:

```bash
npm run db:remote
```

## 4. Atur URL portal

Di `wrangler.jsonc`, ubah:

```json
"SITE_URL": "https://ai-hari-ini.NAMA-AKUN.workers.dev"
```

Nama Worker juga bisa diubah pada properti `name`.

## 5. Deploy gratis

```bash
npm run deploy
```

Cloudflare akan memberikan URL `workers.dev`. Cron akan berjalan pada menit ke-7 setiap jam.

## 6. Isi berita pertama kali

Setelah deploy, tunggu cron atau jalankan dari dashboard Cloudflare. Untuk lokal, gunakan route `/__scheduled` seperti langkah di atas.

## 7. Sumber berita

Daftar sumber berada di `src/index.ts` pada konstanta `SOURCES`. Pastikan setiap feed diizinkan untuk diakses dan jangan menyalin artikel lengkap. Portal ini hanya menyimpan judul, metadata, ringkasan pendek, konteks, dan tautan sumber utama.

## 8. Aturan auto-publish

- Skor minimal default: 60
- Sumber resmi memberi skor kepercayaan lebih tinggi
- Berita baru dan deskripsi lengkap mendapat skor tambahan
- Kata berisiko seperti rumor, gugatan, kebocoran, atau klaim kesehatan membuat artikel masuk status `review`

Pengaturan tersedia di `wrangler.jsonc`:

```json
"AUTO_PUBLISH_MIN_SCORE": "60",
"MAX_POSTS_PER_RUN": "8"
```

## Catatan penting

Versi ini sengaja tidak menggunakan model generatif agar biaya rutin tetap nol dan risiko halusinasi rendah. Ringkasan dibuat dari deskripsi RSS/Atom dan template editorial. Saat portal sudah memiliki pemasukan, modul AI opsional dapat ditambahkan untuk parafrase dan analisis lebih mendalam.
