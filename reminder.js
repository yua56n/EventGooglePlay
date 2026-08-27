// reminder.js
// Jalan tiap 15 menit (dipicu cron-job.org). Cek apakah tombol "Sudah saya lihat"
// sudah ditekan di Telegram. Kalau belum, kirim ulang pesan pengingat.
// Reminder otomatis berhenti sendiri setelah MAX_REMINDER_HOURS jam, meski belum dikonfirmasi.

const fs = require('fs');

// ⏱️ GANTI ANGKA INI SAJA untuk ubah berapa lama reminder berlangsung (dalam jam)
const MAX_REMINDER_HOURS = 10;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ACK_FILE = 'state/ack-state.json';

async function getUpdates(offset) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=0`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) throw new Error('Gagal getUpdates: ' + JSON.stringify(data));
  return data.result;
}

async function answerCallbackQuery(callbackQueryId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function sendPlainMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

async function sendReminderWithButton(text, sentCount) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const header = `🔁 Pengingat #${sentCount} — kamu belum konfirmasi pesan ini:\n\n`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: header + text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '✅ Sudah saya lihat, stop reminder', callback_data: 'ack' }]],
      },
    }),
  });
}

async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset.');
  }

  if (!fs.existsSync(ACK_FILE)) {
    console.log('Belum ada state ack. Tidak ada yang perlu dilakukan.');
    return;
  }

  const state = JSON.parse(fs.readFileSync(ACK_FILE, 'utf-8'));

  if (!state.pending) {
    console.log('Tidak ada reminder yang pending. Selesai.');
    return;
  }

  // Cek apakah sudah melewati batas waktu maksimal reminder
  const startedAt = state.startedAt || Date.now();
  const elapsedHours = (Date.now() - startedAt) / (1000 * 60 * 60);

  if (elapsedHours >= MAX_REMINDER_HOURS) {
    state.pending = false;
    fs.writeFileSync(ACK_FILE, JSON.stringify(state, null, 2));
    await sendPlainMessage(
      `⏹️ Reminder dihentikan otomatis setelah ${MAX_REMINDER_HOURS} jam (belum sempat dikonfirmasi).`
    );
    console.log(`Sudah lewat ${MAX_REMINDER_HOURS} jam. Reminder dihentikan otomatis.`);
    return;
  }

  console.log('Cek apakah tombol sudah ditekan...');
  const updates = await getUpdates(state.offset || 0);

  let acknowledged = false;
  let maxUpdateId = (state.offset || 0) - 1;

  for (const update of updates) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;

    const cb = update.callback_query;
    // Catatan: cb.message bisa kosong/undefined dari Telegram untuk pesan yang
    // tidak lagi "fresh", jadi kita TIDAK bergantung padanya. Karena ini bot
    // pribadi (cuma 1 chat_id yang pernah berinteraksi), cek cb.data saja
    // sudah cukup aman dan jauh lebih reliable.
    if (cb && cb.data === 'ack') {
      acknowledged = true;
      await answerCallbackQuery(cb.id, 'Oke, reminder dihentikan ✅');
    }
  }

  // Update offset supaya update yang sama tidak diproses ulang di run berikutnya
  state.offset = maxUpdateId + 1;

  if (acknowledged) {
    state.pending = false;
    fs.writeFileSync(ACK_FILE, JSON.stringify(state, null, 2));
    await sendPlainMessage('🔕 Reminder dihentikan, terima kasih sudah konfirmasi.');
    console.log('Dikonfirmasi. Reminder dihentikan.');
    return;
  }

  // Belum dikonfirmasi -> kirim ulang reminder
  state.sentCount = (state.sentCount || 1) + 1;
  await sendReminderWithButton(state.message, state.sentCount);
  fs.writeFileSync(ACK_FILE, JSON.stringify(state, null, 2));
  console.log(`Reminder ke-${state.sentCount} dikirim. Masih menunggu konfirmasi.`);
}

main().catch((err) => {
  console.error('Reminder error:', err);
  process.exit(1);
});
