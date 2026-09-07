-- ============================================================
-- ProTube — schema Supabase
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor
-- ============================================================

-- Bảng lưu cấu hình + trạng thái hẹn giờ cho từng TV.
-- Mỗi hàng = 1 TV. "id" đóng vai trò vừa là khoá chính vừa là "mật khẩu"
-- để app và trang điều khiển tìm đúng hàng của mình (xem ghi chú bảo mật
-- ở cuối file).
create table if not exists devices (
  id text primary key,
  video_ids text not null default '',  -- mỗi dòng 1 link/mã video YouTube
  playlist_id text,                    -- tuỳ chọn: điền thì app ưu tiên đọc thẳng playlist này (xem mục "Đọc thẳng playlist" trong HUONG-DAN-CHI-TIET.md)
  cached_videos jsonb,                  -- "bản đặc biệt": kết quả làm mới qua YouTube Data API chính thức (mục 3.4) — CHỈ Edge Function mới ghi được, client không sửa trực tiếp
  cached_videos_updated_at timestamptz,
  pin text not null default '123',
  disconnect_at timestamptz,        -- null = đang phát bình thường
  updated_at timestamptz not null default now()
);

-- Tự cập nhật updated_at mỗi khi có thay đổi, để trang điều khiển
-- có thể hiển thị "cập nhật lúc..." nếu cần.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists devices_set_updated_at on devices;
create trigger devices_set_updated_at
before update on devices
for each row execute function set_updated_at();

-- Bật Row Level Security — bắt buộc vì app dùng anon key (không có đăng nhập).
alter table devices enable row level security;

drop policy if exists "anon can read devices" on devices;
create policy "anon can read devices"
on devices for select
using (true);

drop policy if exists "anon can update devices" on devices;
create policy "anon can update devices"
on devices for update
using (true);

-- Giới hạn cột được phép sửa qua API công khai: không cho đổi "id"
-- (mật khẩu thiết bị) qua API. cached_videos/cached_videos_updated_at
-- vẫn được ghi chính bởi Edge Function sync-youtube-official (dùng
-- service role, bỏ qua RLS) — cho anon sửa được 2 cột này chỉ để nút
-- "Xoá cache" trên trang điều khiển hoạt động đơn giản (đặt về null);
-- không phải lỗ hổng mới vì anon vốn đã toàn quyền quyết định nội
-- dung phát qua video_ids/playlist_id rồi.
revoke update on devices from anon;
grant update (video_ids, playlist_id, cached_videos, cached_videos_updated_at, pin, disconnect_at)
  on devices to anon;

-- ------------------------------------------------------------
-- Thêm 1 thiết bị (1 TV). Đổi 2 giá trị bên dưới trước khi chạy:
--   - id: đổi thành MỘT CHUỖI NGẪU NHIÊN, khó đoán (không dùng
--     "tv-living-room" hay tên nhà bạn) — chuỗi này đóng vai trò
--     mật khẩu để điều khiển TV từ xa. Có thể tạo nhanh ở
--     https://www.uuidgenerator.net/
--   - video_ids: mỗi dòng 1 link (hoặc mã) video YouTube muốn cho bé
--     xem — dùng cách này nếu chưa deploy Edge Function đọc playlist.
--   - Muốn đọc thẳng 1 playlist cho nhanh thay vì dán từng link: sau khi
--     chạy xong file này, update thêm cột playlist_id (xem mục "Đọc
--     thẳng playlist" trong HUONG-DAN-CHI-TIET.md), ví dụ:
--       update devices set playlist_id = 'PLxxxxxxxxxxxxxxxxxxxxxxx'
--       where id = '...';
-- ------------------------------------------------------------
insert into devices (id, video_ids, pin)
values (
  'doi-thanh-chuoi-ngau-nhien-kho-doan-cua-rieng-ban',
  E'https://www.youtube.com/watch?v=XXXXXXXXXXX\nhttps://youtu.be/YYYYYYYYYYY',
  '123'
)
on conflict (id) do nothing;

-- ============================================================
-- Ghi chú bảo mật
-- ============================================================
-- App này không có đăng nhập/tài khoản — bất kỳ ai có 3 thứ sau đều
-- điều khiển được thiết bị: SUPABASE_URL, SUPABASE_ANON_KEY, và
-- "id" của thiết bị (devices.id). anon key vốn đã lộ trong code JS
-- phía client (bình thường với Supabase), nên lớp bảo vệ thực sự
-- nằm ở việc "id" là một chuỗi ngẫu nhiên đủ dài, không public file
-- này (schema.sql) hay code lên nơi công khai (repo GitHub public...)
-- kèm giá trị thật. Với nhu cầu dùng trong gia đình thì mức này là
-- hợp lý; nếu muốn chặt hơn, có thể thêm Supabase Edge Function làm
-- lớp trung gian kiểm tra thêm một mã riêng trước khi cho ghi.
