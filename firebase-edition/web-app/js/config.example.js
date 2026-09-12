// Copy this file to config.js (same folder) and fill in real values.
// config.js is gitignored — it never gets committed.
// DEVICE_ID must be identical to the one in remote-control/config.js.
//
// Bản này dùng Firebase (Firestore + Cloud Functions) thay vì Supabase.
// FIREBASE_API_KEY là "Web API key" — an toàn để để trong code client
// (Firebase không có khái niệm "anon key" như Supabase, security thật
// sự nằm ở Firestore Security Rules, xem firestore.rules).
window.APP_CONFIG = {
  FIREBASE_PROJECT_ID: 'your-firebase-project-id',
  FIREBASE_API_KEY: 'YOUR-FIREBASE-WEB-API-KEY',
  DEVICE_ID: 'doi-thanh-chuoi-ngau-nhien-kho-doan-cua-rieng-ban',

  // Điền sau khi `firebase deploy --only functions` — copy đúng URL
  // của function "getPlaylist" hiện trong output của lệnh đó. Để trống
  // nếu không dùng cách "đọc thẳng playlist" / "bản đặc biệt".
  GET_PLAYLIST_FUNCTION_URL: '',

  // Dùng khi chưa lấy được cấu hình từ Firestore (ví dụ lần đầu chạy mà
  // chưa có internet). Mỗi dòng 1 link hoặc mã video YouTube.
  DEFAULT_VIDEO_IDS: `
https://www.youtube.com/watch?v=XXXXXXXXXXX
https://youtu.be/YYYYYYYYYYY
`,
  DEFAULT_PIN: '123',
};
