// functions/index.js
//
// 2 Cloud Function tương đương 2 Edge Function bên bản Supabase:
//   - getPlaylist          : đọc thẳng 1 playlist YouTube công khai, không cần API key.
//   - syncYoutubeOfficial   : gọi YouTube Data API v3 CHÍNH THỨC, nhưng chỉ khi có người
//                             chủ động bấm nút trên trang điều khiển — không tự động chạy.
//
// Deploy: xem HUONG-DAN-CHI-TIET.md, mục 14.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const YOUTUBE_API_KEY = defineSecret('YOUTUBE_API_KEY');

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// ------------------------------------------------------------
// getPlaylist — đọc trang playlist YouTube công khai, tách danh sách
// video ra từ dữ liệu JSON YouTube tự nhúng trong HTML (ytInitialData).
// KHÔNG dùng YouTube Data API, KHÔNG cần API key. Cách không chính
// thức — nếu YouTube đổi cấu trúc trang, function này có thể cần sửa
// lại đoạn tách dữ liệu bên dưới. Playlist phải Công khai/Unlisted.
// ------------------------------------------------------------
exports.getPlaylist = onRequest(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const playlistId = req.query.id;
  if (!playlistId) {
    return res.status(400).json({ error: 'Thiếu tham số ?id=<playlist_id>' });
  }

  try {
    const ytUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const ytRes = await fetch(ytUrl, {
      headers: {
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const html = await ytRes.text();

    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!match) {
      return res.status(502).json({
        error: 'Không đọc được playlist — playlist có thể riêng tư, sai ID, hoặc YouTube đã đổi định dạng trang.',
      });
    }

    const data = JSON.parse(match[1]);
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const sectionContents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const itemContents = sectionContents[0]?.itemSectionRenderer?.contents || [];
    const playlistItems = itemContents[0]?.playlistVideoListRenderer?.contents || [];

    const videos = playlistItems
      .map((item) => item.playlistVideoRenderer)
      .filter((v) => v && v.videoId)
      .map((v) => {
        const thumbs = v.thumbnail?.thumbnails || [];
        return {
          videoId: v.videoId,
          title: (v.title?.runs || []).map((r) => r.text).join('') || v.videoId,
          thumbnail:
            thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        };
      });

    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ------------------------------------------------------------
// syncYoutubeOfficial — "bản đặc biệt": gọi YouTube Data API v3 chính
// thức đúng 1 lần mỗi khi được gọi (không có vòng lặp tự động nào gọi
// hàm này), lấy tối đa 50 video/lần (1 unit quota), rồi ghi kết quả
// thẳng vào Firestore bằng Admin SDK (bỏ qua Security Rules).
// ------------------------------------------------------------
exports.syncYoutubeOfficial = onRequest(
  { secrets: [YOUTUBE_API_KEY] },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');

    try {
      const { device_id, playlist_id } = req.body || {};
      if (!device_id || !playlist_id) {
        return res.status(400).json({ error: 'Thiếu device_id hoặc playlist_id trong body' });
      }

      const apiKey = YOUTUBE_API_KEY.value();
      const ytUrl =
        `https://www.googleapis.com/youtube/v3/playlistItems` +
        `?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlist_id)}&key=${apiKey}`;
      const ytRes = await fetch(ytUrl);
      const ytData = await ytRes.json();

      if (!ytRes.ok) {
        return res.status(ytRes.status).json({ error: ytData?.error?.message || 'YouTube Data API lỗi' });
      }

      const videos = (ytData.items || [])
        .filter((it) => it.snippet?.resourceId?.videoId)
        .map((it) => ({
          videoId: it.snippet.resourceId.videoId,
          title: it.snippet.title,
          thumbnail: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.default?.url || '',
        }));

      await admin
        .firestore()
        .collection('devices')
        .doc(device_id)
        .set(
          { cached_videos: videos, cached_videos_updated_at: new Date().toISOString() },
          { merge: true }
        );

      return res.status(200).json({ ok: true, count: videos.length });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }
);
