// supabase/functions/sync-youtube-official/index.ts
//
// "Bản đặc biệt" — dùng YouTube Data API v3 CHÍNH THỨC qua Google Cloud
// Console, nhưng thiết kế để tốn quota tối thiểu:
//
//   - Chỉ gọi Google khi có người CHỦ ĐỘNG bấm nút "Làm mới từ YouTube"
//     trên trang điều khiển — vòng lặp bình thường của app (TV poll
//     Supabase mỗi 20s) không bao giờ tự động gọi Google.
//   - Mỗi lần bấm chỉ tốn ĐÚNG 1 unit quota (playlistItems.list, 1
//     unit/lần, lấy tối đa 50 video trong 1 lần gọi — không phân trang
//     trừ khi playlist trên 50 video).
//   - Kết quả được cache thẳng vào Supabase (cột cached_videos) — nếu
//     sau này có thêm TV thứ 2 dùng chung playlist, TV đó đọc cache có
//     sẵn, không tốn thêm quota nào.
//   - API key nằm trong Supabase secrets (biến môi trường phía server),
//     KHÔNG BAO GIỜ lộ ra code JS phía client — khác với cách cũ (để
//     thẳng key trong config.js) vốn ai mở DevTools cũng lấy được key.
//
// Deploy + cấu hình: xem HUONG-DAN-CHI-TIET.md, mục 3.4.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { device_id, playlist_id } = await req.json();
    if (!device_id || !playlist_id) {
      return json({ error: 'Thiếu device_id hoặc playlist_id trong body' }, 400);
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return json(
        { error: 'Server chưa cấu hình YOUTUBE_API_KEY — chạy: supabase secrets set YOUTUBE_API_KEY=xxxx' },
        500
      );
    }

    // 1 lần gọi = 1 unit quota, lấy tối đa 50 video/lần.
    const ytUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlist_id)}&key=${apiKey}`;
    const ytRes = await fetch(ytUrl);
    const ytData = await ytRes.json();

    if (!ytRes.ok) {
      return json({ error: ytData?.error?.message || 'YouTube Data API lỗi' }, ytRes.status);
    }

    const videos = (ytData.items || [])
      .filter((it: any) => it.snippet?.resourceId?.videoId)
      .map((it: any) => ({
        videoId: it.snippet.resourceId.videoId as string,
        title: it.snippet.title as string,
        thumbnail:
          it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.default?.url || '',
      }));

    // Dùng service role key (biến môi trường Supabase tự cấp sẵn cho mọi
    // Edge Function, không cần tự khai báo) để ghi thẳng vào bảng, bỏ
    // qua RLS.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { error } = await supabase
      .from('devices')
      .update({
        cached_videos: videos,
        cached_videos_updated_at: new Date().toISOString(),
      })
      .eq('id', device_id);

    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, count: videos.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
