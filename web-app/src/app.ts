// ============================================================
// ProTube — TV app (TypeScript)
// File này compile ra js/app.js bằng `npm run build` (xem package.json).
// Không dùng import/export — chỉ 1 file, biên dịch thẳng bằng tsc,
// không cần bundler, để deploy đơn giản trên cả 3 nền tảng.
// ============================================================

interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  DEVICE_ID: string;
  DEFAULT_VIDEO_IDS: string;
  DEFAULT_PIN: string;
}

interface Video {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface DeviceRow {
  video_ids: string;
  playlist_id: string | null;
  cached_videos: Video[] | null;
  cached_videos_updated_at: string | null;
  pin: string;
  disconnect_at: string | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  /** 'remote' = lấy từ Supabase (mục Trang chủ mặc định) — thứ tự ưu
   *  tiên: cached_videos (đã làm mới qua YouTube Data API chính thức)
   *  > playlist_id (đọc trực tiếp, không chính thức) > video_ids (dán
   *  từng link). 'static' = gõ cứng ngay trong file này. */
  source: 'remote' | 'static';
  videoIds?: string[];
  playlistId?: string;
}

declare const YT: any;
declare const tizen: any;

// ------------------------------------------------------------
// Cấu hình (đọc từ js/config.js -> window.APP_CONFIG)
// ------------------------------------------------------------
const APP_CONFIG = (window as any).APP_CONFIG as AppConfig | undefined;

if (!APP_CONFIG) {
  document.body.innerHTML =
    '<div style="color:#fff;font-family:sans-serif;padding:40px;">' +
    'Chưa có js/config.js — copy js/config.example.js thành js/config.js ' +
    'rồi điền cấu hình thật trước khi chạy.</div>';
  throw new Error('Thiếu js/config.js');
}

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  DEVICE_ID,
  DEFAULT_VIDEO_IDS,
  DEFAULT_PIN,
} = APP_CONFIG;

const CONFIG_POLL_INTERVAL_MS = 20000;
const GRID_COLUMNS = 4;
const TIZEN_BACK_KEYCODE = 10009;
const WEBOS_BACK_KEYCODE = 461;

// ------------------------------------------------------------
// Icon (SVG nội bộ, gọn nhẹ, không phụ thuộc bộ icon ngoài)
// ------------------------------------------------------------
const ICON_HOME =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/>' +
  '<path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/></svg>';

const ICON_STAR =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 ' +
  '1.7 7-6.3-3.8L5.7 21l1.7-7L2 8.2l7.1-.6z"/></svg>';

// Anh em thêm mục mới ở đây. "remote" luôn phải có đúng 1 mục đầu tiên
// (Trang chủ) — các mục "static" phía sau dùng danh sách video gõ cứng.
const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Trang chủ', icon: ICON_HOME, source: 'remote' },
  // Ví dụ thêm 1 mục nữa (dán link hoặc mã video, mỗi phần tử 1 video):
  // { id: 'nhac', label: 'Bài hát', icon: ICON_STAR, source: 'static',
  //   videoIds: ['dQw4w9WgXcQ', 'https://youtu.be/anotherID11'] },
];

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
type Mode = 'grid' | 'player' | 'disconnected';
type Area = 'sidebar' | 'content';

const state = {
  mode: 'grid' as Mode,
  area: 'content' as Area,

  videos: [] as Video[],
  contentFocus: -1, // -1 = hero, 0..n-1 = chỉ số trong grid (đã bỏ video đầu ra làm hero)

  activeNavId: NAV_ITEMS[0].id,
  sidebarFocusIndex: 0,

  pin: DEFAULT_PIN,
  remoteVideoIdsRaw: DEFAULT_VIDEO_IDS, // danh sách (thô) lấy từ Supabase, dùng cho mục "remote"
  remotePlaylistId: '' as string, // nếu có điền, ưu tiên dùng cái này thay vì remoteVideoIdsRaw
  remoteCachedVideos: null as Video[] | null, // ưu tiên cao nhất — lấy qua YouTube Data API chính thức (xem mục 3.4)
  disconnectAt: null as number | null,
  timerId: 0 as any,
  keyBuffer: '',
  bufferClearTimeout: 0 as any,
  player: null as any,
};

const els = {
  sidebar: document.getElementById('sidebar') as HTMLElement,
  sidebarItems: document.getElementById('sidebar-items') as HTMLElement,
  contentEyebrow: document.getElementById('content-eyebrow') as HTMLElement,
  contentWelcome: document.getElementById('content-welcome') as HTMLElement,
  screenGrid: document.getElementById('screen-grid') as HTMLElement,
  screenPlayer: document.getElementById('screen-player') as HTMLElement,
  screenOffline: document.getElementById('screen-offline') as HTMLElement,
  loadingState: document.getElementById('loading-state') as HTMLElement,
  emptyState: document.getElementById('empty-state') as HTMLElement,
  contentBody: document.getElementById('content-body') as HTMLElement,
  heroCard: document.getElementById('hero-card') as HTMLElement,
  heroThumb: document.getElementById('hero-thumb') as HTMLImageElement,
  heroTitle: document.getElementById('hero-title') as HTMLElement,
  grid: document.getElementById('grid') as HTMLElement,
  playerSlot: document.getElementById('ytplayer-slot') as HTMLElement,
};

// ------------------------------------------------------------
// Supabase (gọi thẳng REST/PostgREST, không cần thư viện supabase-js)
// ------------------------------------------------------------
async function supabaseGet(query: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase GET lỗi: ${res.status}`);
  return res.json();
}

async function supabasePatch(query: string, body: Partial<DeviceRow>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH lỗi: ${res.status}`);
}

async function fetchDeviceConfig(): Promise<DeviceRow | null> {
  const rows = await supabaseGet(
    `devices?id=eq.${encodeURIComponent(DEVICE_ID)}&select=video_ids,playlist_id,cached_videos,cached_videos_updated_at,pin,disconnect_at`
  );
  return rows[0] || null;
}

// ------------------------------------------------------------
// YouTube — KHÔNG dùng YouTube Data API / Google Cloud Console.
// Chỉ cần dán link (hoặc mã) từng video, không cần API key, không cần
// tài khoản Google Cloud, không bị bắt bật 2FA.
//   - Ảnh thumbnail: suy ra thẳng từ mã video (URL cố định của YouTube).
//   - Tiêu đề: lấy qua oEmbed công khai (không cần đăng nhập/khoá gì).
//     Nếu oEmbed lỗi vì bất kỳ lý do gì (mất mạng, đổi định dạng...),
//     video vẫn hiển thị được, chỉ là tiêu đề tạm hiện ra mã video.
// ------------------------------------------------------------
function parseVideoId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s; // đã là mã video (11 ký tự)
  const m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function splitRawIds(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function fetchVideoMeta(videoId: string): Promise<Video> {
  try {
    const oembedUrl =
      `https://www.youtube.com/oembed?format=json&url=` +
      encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error('oEmbed lỗi');
    const data = await res.json();
    return {
      videoId,
      title: data.title || videoId,
      thumbnail: data.thumbnail_url || thumbnailUrl(videoId),
    };
  } catch (e) {
    // Vẫn hiển thị video được dù không lấy được tiêu đề — không có
    // điểm lỗi nào khiến cả danh sách bị sập theo.
    return { videoId, title: videoId, thumbnail: thumbnailUrl(videoId) };
  }
}

async function fetchVideosByRawList(rawList: string[]): Promise<Video[]> {
  const ids = rawList.map(parseVideoId).filter((x): x is string => !!x);
  return Promise.all(ids.map(fetchVideoMeta));
}

// ------------------------------------------------------------
// Đọc thẳng 1 playlist YouTube — vẫn KHÔNG cần API key/Google Cloud.
// Gọi 1 Supabase Edge Function (do mình tự deploy, xem
// supabase/functions/get-playlist) — function đó tải trang playlist
// công khai rồi tách danh sách video ra, y như cách các công cụ tải
// video vẫn làm, không qua YouTube Data API.
// Cách này NHANH hơn dán từng link, nhưng có 2 điều cần nhớ:
//   - Playlist phải để "Công khai" hoặc "Không công khai" (Unlisted),
//     không được "Riêng tư", vì function không đăng nhập tài khoản nào.
//   - Đây là cách không chính thức — nếu YouTube đổi cấu trúc trang,
//     function có thể phải cập nhật lại. Nếu không muốn phụ thuộc điều
//     này, cứ dùng cách dán từng link (fetchVideosByRawList) là chắc
//     ăn nhất.
// ------------------------------------------------------------
async function fetchVideosByPlaylist(playlistId: string): Promise<Video[]> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/get-playlist?id=${encodeURIComponent(playlistId)}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Edge Function lỗi: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.videos || []) as Video[];
}

/** Thứ tự ưu tiên: cachedVideos (đã làm mới qua YouTube Data API chính
 *  thức, xem mục 3.4) > playlistId (đọc trực tiếp) > videoIds (dán
 *  từng link). Chỉ tốn quota Google khi ai đó chủ động bấm "Làm mới từ
 *  YouTube" trên trang điều khiển — vòng lặp bình thường của app
 *  (poll Supabase mỗi 20s) không bao giờ gọi thẳng tới Google. */
async function resolveVideos(source: {
  cachedVideos?: Video[] | null;
  playlistId?: string;
  videoIds?: string[];
}): Promise<Video[]> {
  if (source.cachedVideos && source.cachedVideos.length > 0) {
    return source.cachedVideos;
  }
  if (source.playlistId) {
    try {
      return await fetchVideosByPlaylist(source.playlistId);
    } catch (e) {
      return []; // playlist lỗi (riêng tư, sai ID, function chưa deploy...) -> hiện trạng thái trống thay vì crash
    }
  }
  return fetchVideosByRawList(source.videoIds || []);
}

let ytApiReady = false;
let ytApiReadyResolvers: Array<() => void> = [];
(window as any).onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  ytApiReadyResolvers.forEach((r) => r());
  ytApiReadyResolvers = [];
};
function whenYouTubeApiReady(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => ytApiReadyResolvers.push(resolve));
}

// ------------------------------------------------------------
// Điều khiển "mất wifi" giả
// ------------------------------------------------------------
function applyDisconnectAt(iso: string | null) {
  clearTimeout(state.timerId);
  const newTs = iso ? new Date(iso).getTime() : null;
  state.disconnectAt = newTs;

  if (!newTs) {
    if (state.mode === 'disconnected') restoreFromDisconnect();
    return;
  }
  const delay = newTs - Date.now();
  if (delay <= 0) showDisconnectOverlay();
  else state.timerId = setTimeout(showDisconnectOverlay, delay);
}

function scheduleDisconnect(minutes: number) {
  if (minutes === 0) {
    applyDisconnectAt(null);
    supabasePatch(`devices?id=eq.${encodeURIComponent(DEVICE_ID)}`, {
      disconnect_at: null,
    }).catch(() => {});
    return;
  }
  const target = new Date(Date.now() + minutes * 60000).toISOString();
  applyDisconnectAt(target);
  supabasePatch(`devices?id=eq.${encodeURIComponent(DEVICE_ID)}`, {
    disconnect_at: target,
  }).catch(() => {});
}

function showDisconnectOverlay() {
  state.mode = 'disconnected';
  if (state.player && state.player.pauseVideo) {
    try { state.player.pauseVideo(); } catch (e) {}
  }
  setActiveScreen(els.screenOffline);
}

function restoreFromDisconnect() {
  state.mode = 'grid';
  setActiveScreen(els.screenGrid);
}

function setActiveScreen(el: HTMLElement) {
  [els.screenGrid, els.screenPlayer, els.screenOffline].forEach((s) =>
    s.classList.remove('is-active')
  );
  el.classList.add('is-active');
}

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------
function renderSidebar() {
  els.sidebarItems.innerHTML = NAV_ITEMS.map((item, i) => {
    const isActive = item.id === state.activeNavId;
    const isFocused = state.area === 'sidebar' && i === state.sidebarFocusIndex;
    const cls = ['nav-item', isActive ? 'is-active' : '', isFocused ? 'is-focused' : '']
      .filter(Boolean)
      .join(' ');
    return `
      <div class="${cls}" data-index="${i}">
        <span class="nav-item__icon">${item.icon}</span>
        <span class="nav-item__label">${escapeHtml(item.label)}</span>
      </div>`;
  }).join('');
}

function updateSidebarVisual() {
  els.sidebar.classList.toggle('is-expanded', state.area === 'sidebar');
  renderSidebar();
}

function currentNavItem(): NavItem {
  return NAV_ITEMS.find((n) => n.id === state.activeNavId) || NAV_ITEMS[0];
}

async function selectNavItem(index: number) {
  const item = NAV_ITEMS[index];
  if (!item) return;
  state.activeNavId = item.id;
  state.area = 'content';
  state.contentFocus = -1;

  els.contentEyebrow.textContent = item.label;
  els.contentWelcome.textContent =
    item.id === 'home' ? 'Chào bé quay lại nè 👋' : 'Cùng xem nào! 🎈';

  renderLoading();
  try {
    state.videos =
      item.source === 'remote'
        ? await resolveVideos({
            cachedVideos: state.remoteCachedVideos,
            playlistId: state.remotePlaylistId,
            videoIds: splitRawIds(state.remoteVideoIdsRaw),
          })
        : await resolveVideos({ playlistId: item.playlistId, videoIds: item.videoIds });
  } catch (e) {
    state.videos = [];
  }
  renderContent();
  updateSidebarVisual();
}

// ------------------------------------------------------------
// Vẽ nội dung: hero + lưới video
// ------------------------------------------------------------
function renderLoading() {
  els.loadingState.style.display = 'flex';
  els.emptyState.style.display = 'none';
  els.contentBody.style.display = 'none';
}

function gridVideos(): Video[] {
  return state.videos.slice(1);
}

function renderContent() {
  els.loadingState.style.display = 'none';

  if (state.videos.length === 0) {
    els.emptyState.style.display = 'flex';
    els.contentBody.style.display = 'none';
    return;
  }
  els.emptyState.style.display = 'none';
  els.contentBody.style.display = 'block';

  const hero = state.videos[0];
  els.heroThumb.src = hero.thumbnail;
  els.heroTitle.textContent = hero.title;

  const rest = gridVideos();
  els.grid.innerHTML = rest
    .map(
      (v, i) => `
      <div class="card" data-index="${i}">
        <img class="card__thumb" src="${v.thumbnail}" alt="" />
        <div class="card__title">${escapeHtml(v.title)}</div>
      </div>`
    )
    .join('');

  updateContentFocusVisual();
}

function updateContentFocusVisual() {
  els.heroCard.classList.toggle(
    'is-focused',
    state.area === 'content' && state.contentFocus === -1
  );
  const cards = els.grid.querySelectorAll('.card');
  cards.forEach((c) => {
    const idx = Number((c as HTMLElement).dataset.index);
    c.classList.toggle('is-focused', state.area === 'content' && idx === state.contentFocus);
  });
  const focused = els.grid.querySelector('.is-focused');
  if (focused) focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------------------------------
// Trình phát video
// ------------------------------------------------------------
async function playVideo(video: Video | undefined) {
  if (!video) return;
  state.mode = 'player';
  setActiveScreen(els.screenPlayer);

  els.playerSlot.innerHTML = '<div id="ytplayer"></div>';
  await whenYouTubeApiReady();

  state.player = new YT.Player('ytplayer', {
    width: '100%',
    height: '100%',
    videoId: video.videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1,
    },
    events: {
      onStateChange: (e: any) => {
        if (e.data === YT.PlayerState.ENDED) stopAndReturnToGrid();
      },
    },
  });
}

function stopAndReturnToGrid() {
  if (state.player && state.player.stopVideo) {
    try { state.player.stopVideo(); } catch (e) {}
  }
  state.player = null;
  state.mode = 'grid';
  setActiveScreen(els.screenGrid);
  updateContentFocusVisual();
}

function togglePlayPause() {
  if (!state.player) return;
  const s = state.player.getPlayerState && state.player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) state.player.pauseVideo();
  else state.player.playVideo();
}

function seek(deltaSeconds: number) {
  if (!state.player || !state.player.getCurrentTime) return;
  const t = state.player.getCurrentTime() + deltaSeconds;
  state.player.seekTo(Math.max(0, t), true);
}

// ------------------------------------------------------------
// Điều hướng bằng remote
// ------------------------------------------------------------
function handleSidebarKey(e: KeyboardEvent) {
  const max = NAV_ITEMS.length - 1;
  if (e.key === 'ArrowDown') {
    state.sidebarFocusIndex = Math.min(max, state.sidebarFocusIndex + 1);
  } else if (e.key === 'ArrowUp') {
    state.sidebarFocusIndex = Math.max(0, state.sidebarFocusIndex - 1);
  } else if (e.key === 'Enter') {
    selectNavItem(state.sidebarFocusIndex);
    return;
  } else if (e.key === 'ArrowRight' || isBackKey(e)) {
    state.area = 'content';
  } else {
    return;
  }
  updateSidebarVisual();
}

function handleContentKey(e: KeyboardEvent) {
  const cols = GRID_COLUMNS;
  const rest = gridVideos();
  const max = rest.length - 1;

  switch (e.key) {
    case 'ArrowLeft': {
      const atLeftEdge = state.contentFocus === -1 || state.contentFocus % cols === 0;
      if (atLeftEdge) {
        state.area = 'sidebar';
        state.sidebarFocusIndex = NAV_ITEMS.findIndex((n) => n.id === state.activeNavId);
        updateSidebarVisual();
      } else {
        state.contentFocus -= 1;
      }
      break;
    }
    case 'ArrowRight':
      if (state.contentFocus >= 0 && state.contentFocus < max && (state.contentFocus + 1) % cols !== 0) {
        state.contentFocus += 1;
      }
      break;
    case 'ArrowDown':
      if (state.contentFocus === -1) {
        if (max >= 0) state.contentFocus = 0;
      } else if (state.contentFocus + cols <= max) {
        state.contentFocus += cols;
      }
      break;
    case 'ArrowUp':
      if (state.contentFocus >= 0) {
        state.contentFocus = state.contentFocus - cols >= 0 ? state.contentFocus - cols : -1;
      }
      break;
    case 'Enter':
      playVideo(state.contentFocus === -1 ? state.videos[0] : rest[state.contentFocus]);
      return;
    default:
      return;
  }
  updateContentFocusVisual();
}

function handlePlayerKey(e: KeyboardEvent) {
  if (e.key === 'Enter') togglePlayPause();
  else if (e.key === 'ArrowLeft') seek(-10);
  else if (e.key === 'ArrowRight') seek(10);
  else if (isBackKey(e)) stopAndReturnToGrid();
}

function isBackKey(e: KeyboardEvent): boolean {
  return (
    e.key === 'Backspace' ||
    e.key === 'Escape' ||
    e.key === 'GoBack' ||
    e.keyCode === TIZEN_BACK_KEYCODE ||
    e.keyCode === WEBOS_BACK_KEYCODE
  );
}

function onKeyDown(e: KeyboardEvent) {
  // Nhập PIN + số phút hoạt động bất kể đang ở màn hình nào, và
  // KHÔNG hiện bất cứ phản hồi gì trên giao diện.
  if (e.keyCode >= 48 && e.keyCode <= 57) {
    const digit = String(e.keyCode - 48);
    state.keyBuffer = (state.keyBuffer + digit).slice(-10);
    clearTimeout(state.bufferClearTimeout);
    state.bufferClearTimeout = setTimeout(() => (state.keyBuffer = ''), 5000);

    const re = new RegExp(`${state.pin}(\\d{2})$`);
    const match = state.keyBuffer.match(re);
    if (match) {
      scheduleDisconnect(parseInt(match[1], 10));
      state.keyBuffer = '';
    }
    return;
  }

  if (state.mode === 'disconnected') return; // "mất wifi" thì mọi phím khác vô hiệu
  if (state.mode === 'player') { handlePlayerKey(e); return; }

  // mode === 'grid'
  if (state.area === 'sidebar') handleSidebarKey(e);
  else handleContentKey(e);
}

function registerTizenKeys() {
  try {
    if ((window as any).tizen && tizen.tvinputdevice && tizen.tvinputdevice.registerKey) {
      tizen.tvinputdevice.registerKey('Back');
      tizen.tvinputdevice.registerKey('MediaPlayPause');
    }
  } catch (e) {
    // Không chạy trên TV Tizen thật — bỏ qua.
  }
}

// ------------------------------------------------------------
// Đồng bộ cấu hình từ Supabase (playlist "Trang chủ" / PIN / hẹn giờ từ xa)
// ------------------------------------------------------------
function startConfigPolling() {
  setInterval(async () => {
    const cfg = await fetchDeviceConfig().catch(() => null);
    if (!cfg) return;

    if (cfg.pin) state.pin = cfg.pin;

    const newTs = cfg.disconnect_at ? new Date(cfg.disconnect_at).getTime() : null;
    if (newTs !== state.disconnectAt) applyDisconnectAt(cfg.disconnect_at);

    const newPlaylistId = cfg.playlist_id || '';
    const videoIdsChanged = cfg.video_ids && cfg.video_ids !== state.remoteVideoIdsRaw;
    const playlistChanged = newPlaylistId !== state.remotePlaylistId;
    const cachedChanged =
      JSON.stringify(cfg.cached_videos || null) !== JSON.stringify(state.remoteCachedVideos);

    if (videoIdsChanged) state.remoteVideoIdsRaw = cfg.video_ids;
    if (playlistChanged) state.remotePlaylistId = newPlaylistId;
    if (cachedChanged) state.remoteCachedVideos = cfg.cached_videos || null;

    if ((videoIdsChanged || playlistChanged || cachedChanged) && currentNavItem().source === 'remote') {
      resolveVideos({
        cachedVideos: state.remoteCachedVideos,
        playlistId: state.remotePlaylistId,
        videoIds: splitRawIds(state.remoteVideoIdsRaw),
      })
        .then((videos) => {
          state.videos = videos;
          state.contentFocus = -1;
          if (state.mode === 'grid') renderContent();
        })
        .catch(() => {});
    }
  }, CONFIG_POLL_INTERVAL_MS);
}

// ------------------------------------------------------------
// Khởi động
// ------------------------------------------------------------
async function init() {
  registerTizenKeys();
  window.addEventListener('keydown', onKeyDown);
  renderSidebar();

  const cfg = await fetchDeviceConfig().catch(() => null);
  state.pin = cfg?.pin || DEFAULT_PIN;
  state.remoteVideoIdsRaw = cfg?.video_ids || DEFAULT_VIDEO_IDS;
  state.remotePlaylistId = cfg?.playlist_id || '';
  state.remoteCachedVideos = cfg?.cached_videos || null;
  applyDisconnectAt(cfg?.disconnect_at || null);

  await selectNavItem(0); // tải mục "Trang chủ" mặc định
  startConfigPolling();
}

init();
