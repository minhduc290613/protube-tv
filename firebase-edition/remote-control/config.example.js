// Copy this file to config.js (same folder) and fill in real values.
// config.js is gitignored — it never gets committed.
// FIREBASE_PROJECT_ID, FIREBASE_API_KEY, DEVICE_ID must be identical to
// firebase-edition/web-app/js/config.js.
window.APP_CONFIG = {
  FIREBASE_PROJECT_ID: 'your-firebase-project-id',
  FIREBASE_API_KEY: 'YOUR-FIREBASE-WEB-API-KEY',
  DEVICE_ID: 'doi-thanh-chuoi-ngau-nhien-kho-doan-cua-rieng-ban',

  // Điền sau khi `firebase deploy --only functions` — copy đúng URL của
  // function "syncYoutubeOfficial". Chỉ cần nếu dùng "bản đặc biệt".
  SYNC_OFFICIAL_FUNCTION_URL: '',
};
