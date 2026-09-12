// supabase/functions/get-playlist/index.ts
//
// Đọc 1 playlist YouTube công khai (hoặc "Không công khai"/Unlisted) và
// trả về danh sách video — KHÔNG dùng YouTube Data API, KHÔNG cần API
// key, KHÔNG cần tài khoản Google Cloud Console.
//
// Cách làm: tải thẳng trang playlist công khai (giống trình duyệt bình
// thường mở trang đó), rồi tách phần dữ liệu JSON mà YouTube nhúng sẵn
// trong HTML (biến `ytInitialData`) để lấy danh sách video ra.
//
// Đây LÀ CÁCH KHÔNG CHÍNH THỨC — nếu YouTube đổi cấu trúc trang, hàm
// này có thể phải cập nhật lại đường dẫn bên trong `ytInitialData`.
// Playlist phải để "Công khai" hoặc "Không công khai" — không được
// "Riêng tư", vì hàm này không đăng nhập bất kỳ tài khoản nào.
//
// Deploy: xem hướng dẫn trong help.md, mục "Đọc thẳng playlist".

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deno = (globalThis as typeof globalThis & {
  Deno: {
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const playlistId = url.searchParams.get('id');
  if (!playlistId) {
    return json({ error: 'Thiếu tham số ?id=<playlist_id>' }, 400);
  }

  try {
    const ytUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const res = await fetch(ytUrl, {
      headers: {
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const html = await res.text();

    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!match) {
      return json(
        { error: 'Không đọc được playlist — playlist có thể riêng tư, sai ID, hoặc YouTube đã đổi định dạng trang.' },
        502
      );
    }

    const data = JSON.parse(match[1]);

    // Đường dẫn bên trong ytInitialData khá sâu, có thể lệch tuỳ loại
    // playlist — thử vài đường dẫn phổ biến trước khi bỏ cuộc.
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const sectionContents =
      tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const itemContents =
      sectionContents[0]?.itemSectionRenderer?.contents || [];
    const playlistItems: any[] =
      itemContents[0]?.playlistVideoListRenderer?.contents || [];

    const videos = playlistItems
      .map((item) => item.playlistVideoRenderer)
      .filter((v) => v && v.videoId)
      .map((v) => {
        const thumbs = v.thumbnail?.thumbnails || [];
        return {
          videoId: v.videoId as string,
          title: (v.title?.runs || []).map((r: any) => r.text).join('') || v.videoId,
          thumbnail:
            thumbs[thumbs.length - 1]?.url ||
            `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        };
      });

    return json({ videos });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
