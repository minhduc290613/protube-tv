// Copy this file to config.js (same folder) and fill in real values.
// config.js is gitignored — it never gets committed.
// DEVICE_ID must be identical to the one in remote-control/config.js.
//
// File này CỐ TÌNH viết bằng JS thuần (không phải TypeScript) — đây là
// nơi duy nhất người không rành lập trình cũng cần sửa, nên giữ đơn giản
// nhất có thể. Phần logic phức tạp nằm ở src/app.ts (biên dịch ra js/app.js).
//
// KHÔNG cần YouTube API key / Google Cloud Console gì cả — chỉ cần dán
// link (hoặc mã) từng video, mỗi dòng 1 video.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-SUPABASE-ANON-KEY',
  DEVICE_ID: 'doi-thanh-chuoi-ngau-nhien-kho-doan-cua-rieng-ban',

  // Dùng khi chưa lấy được cấu hình từ Supabase (ví dụ lần đầu chạy mà
  // chưa có internet). Mỗi dòng 1 link hoặc mã video YouTube.
  DEFAULT_VIDEO_IDS: `
https://www.youtube.com/watch?v=XXXXXXXXXXX
https://youtu.be/YYYYYYYYYYY
`,
  DEFAULT_PIN: '123',
};
