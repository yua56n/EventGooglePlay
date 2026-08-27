// reminder.js
// Jalan tiap 15 menit (dipicu cron-job.org). Cek apakah kamu sudah kirim
// pesan "/sayabaca" di chat Telegram. Kalau belum, kirim ulang pesan pengingat.
// Reminder otomatis berhenti sendiri setelah MAX_REMINDER_HOURS jam, meski belum dikonfirmasi.

const fs = require('fs');

// ⏱️ GANTI ANGKA INI SAJA untuk ubah berapa lama reminder berlangsung (dalam jam)
const MAX_REMINDER_HOURS = 10;

const ACK_COMMAND = '/sayabaca';

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

async function sendPlainMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

async function sendReminder(text, sentCount) {
  const header = `🔁 Pengingat #${sentCount} — kamu belum ketik ${ACK_COMMAND}:\n\n`;
  await sendPlainMessage(header + text + `\n\n💬 Ketik ${ACK_COMMAND} untuk menghentikan reminder.`);
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

  console.log(`Cek apakah ada pesan ${ACK_COMMAND}...`);
  const updates = await getUpdates(state.offset || 0);

  let acknowledged = false;
  let maxUpdateId = (state.offset || 0) - 1;

  for (const update of updates) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;

    const msg = update.message;
    if (
      msg &&
      msg.text &&
      msg.text.trim().toLowerCase() === ACK_COMMAND &&
      String(msg.chat?.id) === String(TELEGRAM_CHAT_ID)
    ) {
      acknowledged = true;
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
  await sendReminder(state.message, state.sentCount);
  fs.writeFileSync(ACK_FILE, JSON.stringify(state, null, 2));
  console.log(`Reminder ke-${state.sentCount} dikirim. Masih menunggu konfirmasi.`);
}

main().catch((err) => {
  console.error('Reminder error:', err);
  process.exit(1);
});
