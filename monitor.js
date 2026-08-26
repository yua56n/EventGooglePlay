// monitor.js
// Memantau perubahan konten di halaman Google Play Perks (SPA, butuh render JS)
// dan mengirim notifikasi Telegram + WhatsApp jika ada perubahan.

const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');

const TARGET_URL = 'https://playpoints.withgoogle.com/perks/intl/ALL_id/events/';
const STATE_FILE = 'state/last-content.txt';
const HASH_FILE = 'state/last-hash.txt';
const ACK_FILE = 'state/ack-state.json';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE; // format: 62812xxxxxxx (tanpa + atau 0 di depan)
const WHATSAPP_APIKEY = process.env.WHATSAPP_APIKEY;

async function sendWhatsAppMessage(text) {
  if (!WHATSAPP_PHONE || !WHATSAPP_APIKEY) {
    console.log('WhatsApp belum dikonfigurasi, lewati.');
    return;
  }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(text)}&apikey=${WHATSAPP_APIKEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`Gagal kirim WhatsApp: ${res.status} ${body}`);
    }
  } catch (err) {
    console.error('Error kirim WhatsApp:', err.message);
  }
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal kirim Telegram: ${res.status} ${body}`);
  }
}

// Versi dengan tombol "Sudah saya lihat" — dipakai khusus untuk notifikasi perubahan
async function sendTelegramMessageWithAckButton(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '✅ Sudah saya lihat, stop reminder', callback_data: 'ack' }]],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal kirim Telegram: ${res.status} ${body}`);
  }
}

function simpleDiffSummary(oldText, newText, maxLines = 15) {
  const oldLines = oldText.split('\n').map(l => l.trim()).filter(Boolean);
  const newLines = newText.split('\n').map(l => l.trim()).filter(Boolean);

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter(l => !oldSet.has(l)).slice(0, maxLines);
  const removed = oldLines.filter(l => !newSet.has(l)).slice(0, maxLines);

  let summary = '';
  if (added.length) {
    summary += '➕ Baru:\n' + added.map(l => `  + ${l}`).join('\n') + '\n';
  }
  if (removed.length) {
    summary += '➖ Hilang:\n' + removed.map(l => `  - ${l}`).join('\n') + '\n';
  }
  if (!summary) {
    summary = '(Perubahan terdeteksi tapi tidak berupa baris teks yang jelas — cek manual)';
  }
  return summary;
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset di environment/secrets.');
  }

  fs.mkdirSync('state', { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  console.log('Membuka halaman...');
  await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 60000 });

  // Beri waktu tambahan untuk konten SPA selesai render
  await page.waitForTimeout(8000);

  const content = await page.evaluate(() => document.body.innerText);
  await browser.close();

  const normalized = content
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');

  const newHash = crypto.createHash('sha256').update(normalized).digest('hex');

  let oldHash = null;
  let oldContent = '';
  if (fs.existsSync(HASH_FILE)) {
    oldHash = fs.readFileSync(HASH_FILE, 'utf-8').trim();
    oldContent = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf-8') : '';
  }

  if (oldHash === null) {
    // Baseline pertama kali, belum ada pembanding
    fs.writeFileSync(HASH_FILE, newHash);
    fs.writeFileSync(STATE_FILE, normalized);
    console.log('Baseline pertama disimpan. Belum ada notifikasi dikirim.');
    return;
  }

  if (newHash !== oldHash) {
    console.log('Perubahan terdeteksi! Mengirim notifikasi...');
    const diff = simpleDiffSummary(oldContent, normalized);
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const message =
      `🔔 Perubahan terdeteksi di Google Play Perks\n` +
      `Waktu: ${now} WIB\n` +
      `URL: ${TARGET_URL}\n\n` +
      diff.slice(0, 3500); // batasi panjang pesan Telegram

    await sendTelegramMessageWithAckButton(message);
    await sendWhatsAppMessage(message);

    // Simpan status "menunggu konfirmasi" supaya reminder.js tahu harus kirim ulang.
    // startedAt dipakai reminder.js untuk menghitung kapan batas waktu reminder habis.
    fs.writeFileSync(
      ACK_FILE,
      JSON.stringify(
        { pending: true, message, offset: 0, sentCount: 1, startedAt: Date.now() },
        null,
        2
      )
    );

    fs.writeFileSync(HASH_FILE, newHash);
    fs.writeFileSync(STATE_FILE, normalized);
    console.log('Selesai. State diperbarui.');
  } else {
    console.log('Tidak ada perubahan.');
  }
}

main().catch(async (err) => {
  console.error(err);
  // Coba kirim notifikasi error juga supaya kamu tahu kalau monitoring gagal jalan
  try {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(`⚠️ Monitoring error: ${err.message}`);
    }
  } catch (_) {}
  process.exit(1);
});
