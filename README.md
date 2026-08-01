# Monitor Perubahan Google Play Perks → Notifikasi Telegram

Setup ini mengecek halaman:
`https://playpoints.withgoogle.com/perks/intl/ALL_id/events/`

setiap jam, dari **04:00–12:00 WIB**, setiap hari, otomatis via GitHub Actions.
Kalau ada perubahan konten, kamu langsung dapat pesan di Telegram.

Kamu **tidak perlu menjalankan apa pun secara manual** — begitu setup ini selesai
(sekali saja), semuanya jalan sendiri sampai kapan pun (tidak ada batas 1 tahun,
selama repo & Actions-nya tetap ada).

---

## Langkah 1 — Buat Bot Telegram (gratis, 2 menit)

1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`, ikuti instruksinya (kasih nama & username bot)
3. BotFather akan kasih **token**, contoh: `123456789:ABCdefGhIJKlmNoPQRstuVwxYZ`
   → simpan ini, nanti dipakai sebagai `TELEGRAM_BOT_TOKEN`

4. Cari bot yang baru kamu buat di Telegram, klik **Start** (kirim pesan apa saja ke bot)
5. Buka di browser:
   `https://api.telegram.org/bot<TOKEN_KAMU>/getUpdates`
   (ganti `<TOKEN_KAMU>` dengan token dari BotFather)
6. Cari nilai `"chat":{"id": ...}` di hasil JSON-nya → itu adalah **chat_id** kamu
   → simpan ini sebagai `TELEGRAM_CHAT_ID`

---

## Langkah 2 — Buat Repository GitHub

1. Buat akun GitHub kalau belum punya (gratis): https://github.com/signup
2. Buat repository baru, boleh **public** atau **private**
   (public lebih hemat kuota menit GitHub Actions, dan kode monitoring ini
   tidak mengandung info sensitif — token & chat id disimpan terpisah sebagai Secret)
3. Upload semua file dari folder ini ke repo tersebut, dengan struktur:
   ```
   monitor.js
   package.json
   .github/workflows/monitor.yml
   ```
   Bisa lewat web GitHub (drag & drop) atau lewat `git push` kalau familiar dengan git.

---

## Langkah 3 — Tambahkan Secrets

Di repo GitHub kamu:
1. Masuk ke **Settings → Secrets and variables → Actions**
2. Klik **New repository secret**, tambahkan dua secret:
   - `TELEGRAM_BOT_TOKEN` → isi dengan token dari Langkah 1
   - `TELEGRAM_CHAT_ID` → isi dengan chat id dari Langkah 1

---

## Langkah 4 — Jalankan Pertama Kali (Baseline)

1. Masuk ke tab **Actions** di repo kamu
2. Pilih workflow **Monitor Google Play Perks**
3. Klik **Run workflow** (tombol manual trigger) sekali
4. Ini akan menyimpan kondisi awal halaman sebagai baseline (belum ada notifikasi
   yang dikirim di run pertama — itu normal, karena belum ada pembanding)

Setelah itu, jadwal otomatis (tiap jam, 04:00–12:00 WIB) akan berjalan sendiri,
dan kamu akan dapat notifikasi Telegram tiap kali ada perubahan konten dibanding
pengecekan sebelumnya.

---

## Catatan Penting

- **Jadwal GitHub Actions bisa meleset beberapa menit** dari jadwal cron pada
  jam-jam sibuk (ini keterbatasan platform gratis GitHub, bukan bug script ini).
  Biasanya meleset 1-15 menit, jarang lebih.
- Script membandingkan **seluruh teks halaman**. Kalau halaman punya elemen yang
  sering berubah sendiri (contoh: hitungan waktu real-time, iklan acak), itu bisa
  memicu "perubahan palsu". Kalau ini terjadi, kabari saya — saya bisa bantu
  persempit area yang dipantau (misal hanya bagian daftar event, bukan seluruh
  halaman).
- Semua riwayat konten tersimpan di folder `state/` di repo kamu (sebagai file teks),
  jadi kamu juga bisa lihat histori perubahan langsung dari GitHub kapan pun.
- Biaya: **Rp0**. GitHub Actions gratis untuk public repo (unlimited minutes) dan
  private repo (2.000 menit/bulan gratis) — pemakaian kita jauh di bawah itu
  (~9 run/hari × ~2 menit ≈ 540 menit/bulan).
