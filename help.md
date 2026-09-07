# ProTube — app YouTube riêng cho con, chạy trên Tizen / webOS / Android TV

App web chạy được trên cả 3 hệ điều hành TV phổ biến nhất (Samsung Tizen, LG webOS, Android TV/Google TV), dùng **chung một bộ code** — chỉ khác lớp vỏ đóng gói mỗi nền tảng. App phát video theo danh sách do mình chọn, với 3 cách lấy danh sách để tuỳ chọn: dán từng link (chắc ăn nhất), đọc thẳng 1 playlist (nhanh, không chính thức, không cần Google Cloud Console), hoặc dùng YouTube Data API chính thức qua Google Cloud Console nhưng tốn quota tối thiểu (bản đặc biệt, mục 3.4). Có tính năng hẹn giờ "mất wifi" giả để kết thúc giờ xem êm đẹp (giải thích chi tiết ở phần dưới).

Mình không bàn chuyện kiểm soát trẻ em đúng-sai ở đây — đây thuần là chia sẻ kỹ thuật, mỗi nhà tự điều chỉnh theo nhu cầu riêng.

---

## Mục lục

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Giao diện: sidebar thu gọn/mở rộng + hero](#2-giao-diện-sidebar-thu-gọnmở-rộng--hero)
3. [Chuẩn bị chung](#3-chuẩn-bị-chung-làm-1-lần-dùng-cho-cả-3-nền-tảng)
4. [Cài Node.js và build TypeScript](#4-cài-nodejs-và-build-typescript)
5. [Test trên trình duyệt trước khi lên TV](#5-test-trên-trình-duyệt-trước-khi-lên-tv)
6. [Triển khai lên Samsung Tizen](#6-triển-khai-lên-samsung-tizen)
7. [Triển khai lên LG webOS](#7-triển-khai-lên-lg-webos)
8. [Triển khai lên Android TV / Google TV](#8-triển-khai-lên-android-tv--google-tv)
9. [Trang điều khiển từ xa](#9-trang-điều-khiển-từ-xa-trên-điện-thoại)
10. [Cơ chế hẹn giờ "mất wifi" hoạt động thế nào](#10-cơ-chế-hẹn-giờ-mất-wifi-hoạt-động-thế-nào)
11. [Tuỳ biến thêm](#11-tuỳ-biến-thêm)
12. [Bảo mật cần biết](#12-bảo-mật-cần-biết)
13. [Xử lý sự cố](#13-xử-lý-sự-cố)

---

## 1. Kiến trúc tổng quan

```
                    ┌───────────────────────────┐
                    │   web-app/  (dùng chung)    │
                    │   HTML + CSS + TypeScript   │
                    └──────────────┬─────────────┘
                                   │ mỗi nền tảng chỉ thêm 1 lớp vỏ mỏng
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
┌───────────────┐         ┌───────────────┐         ┌────────────────────┐
│ Tizen (Samsung)│         │ webOS (LG)     │         │ Android TV/Google TV│
│ config.xml     │         │ appinfo.json   │         │ WebView (Kotlin)     │
└───────────────┘         └───────────────┘         └────────────────────┘
        │                          │                          │
        └──────────────┬───────────┴──────────────────────────┘
                       ▼
              ┌─────────────────┐        ┌───────────────────┐
              │    Supabase      │◄──────►│  Trang điều khiển   │
              │ (cấu hình + hẹn   │  ghi   │  (mở trên điện     │
              │  giờ "mất wifi") │ trực   │  thoại)             │
              └─────────────────┘  tiếp  └───────────────────┘
```

Cả 3 nền tảng đều load **cùng một** `index.html` + `css/style.css` + `js/app.js` từ thư mục `web-app/`. Khác biệt nền tảng chỉ nằm ở cách "gói" nó lại:

- **Tizen**: đóng gói thành `.wgt` qua VS Code + Tizen extension.
- **webOS**: đóng gói thành `.ipk` qua webOS CLI.
- **Android TV**: không có kiểu đóng gói HTML5 app trực tiếp như 2 hãng trên, nên dùng một app Android nhỏ (viết bằng Kotlin) chỉ chứa **1 WebView** load thẳng `web-app/` — về bản chất vẫn là cùng 1 web app, chỉ có thêm lớp vỏ Android để cài lên Play Store / sideload được.

`js/app.js` được biên dịch sẵn từ `src/app.ts` (TypeScript) — xem [mục 4](#4-cài-nodejs-và-build-typescript).

---

## 2. Giao diện: sidebar thu gọn/mở rộng + hero

Giao diện lấy cảm hứng từ cách các app TV lớn tổ chức màn hình chính: một thanh điều hướng dọc bên trái, thu gọn lại chỉ còn icon khi không dùng tới, tự mở rộng ra kèm chữ khi remote focus vào đó.

**Cách điều hướng:**

| Đang ở đâu | Bấm | Kết quả |
|---|---|---|
| Đang ở video đầu tiên bên trái (cột 0) hoặc ô hero | `◄` | Sidebar mở rộng ra, hiện tên các mục |
| Trong sidebar | `▲` `▼` | Di chuyển giữa các mục |
| Trong sidebar | `OK/Enter` | Chọn mục đó, tải nội dung tương ứng, sidebar tự thu gọn lại |
| Trong sidebar | `►` hoặc `Back` | Thu gọn lại, không đổi mục đang xem |
| Ở màn hình chính | `▲▼◄►` | Di chuyển giữa ô hero (video nổi bật) và lưới video bên dưới |
| Đang phát video | `OK` | Tạm dừng / tiếp tục |
| Đang phát video | `◄` `►` | Tua lùi/tiến 10 giây |
| Đang phát video | `Back` | Quay lại màn hình chính |

Mặc định sidebar chỉ có 1 mục **Trang chủ** (nối với danh sách video cấu hình trên Supabase). Muốn thêm mục (ví dụ thêm 1 mục "Nhạc thiếu nhi" riêng), xem [mục 11](#11-tuỳ-biến-thêm).

Phần đầu màn hình chính là 1 **ô hero** lớn — luôn là video đầu tiên trong danh sách, kèm tiêu đề đè lên ảnh nền, tương tự cách các app TV làm nổi bật một nội dung. Ngay dưới là dòng **"Đề xuất cho bé"** chứa các video còn lại dạng lưới.

---

## 3. Chuẩn bị chung (làm 1 lần, dùng cho cả 3 nền tảng)

### 3.1 Tạo project Supabase (miễn phí)

1. Vào [supabase.com](https://supabase.com), tạo project mới.
2. Vào **SQL Editor**, dán toàn bộ nội dung `supabase/schema.sql` — **trước khi chạy**, sửa `id` trong đoạn `insert into devices` thành **một chuỗi ngẫu nhiên dài, khó đoán** (đóng vai trò mật khẩu điều khiển từ xa) — tạo nhanh ở [uuidgenerator.net](https://www.uuidgenerator.net/). Phần `video_ids` để tạm giá trị mẫu, sẽ đổi thật ở bước 3.2 (hoặc sau này qua trang điều khiển cũng được).
3. Bấm **Run**.
4. Vào **Project Settings → API**, lấy **Project URL** và khoá **anon public**.

### 3.2 Chuẩn bị danh sách video (không cần Google Cloud Console / API key)

App **không dùng YouTube Data API** — nghĩa là không cần tạo project Google Cloud, không cần API key, và không bị Google bắt bật xác minh 2 bước để dùng Cloud Console. Cách lấy video đơn giản hơn nhiều:

1. Mở từng video muốn cho bé xem trên YouTube, copy link (dạng `youtube.com/watch?v=...` hoặc `youtu.be/...`).
2. Dán các link đó, **mỗi dòng 1 link**, vào cột `video_ids` trên Supabase (Table Editor → bảng `devices` → sửa trực tiếp), hoặc tiện hơn: cứ để tạm rồi dán qua ô trên trang điều khiển ở [mục 9](#9-trang-điều-khiển-từ-xa-trên-điện-thoại) sau khi deploy xong.
3. Tiêu đề video được lấy tự động qua oEmbed công khai của YouTube (không cần đăng nhập); ảnh thumbnail suy ra thẳng từ mã video. Nếu vì lý do gì đó không lấy được tiêu đề, video vẫn phát bình thường, chỉ hiện tạm mã video làm tên.

Vì không còn phụ thuộc playlist YouTube nữa, cũng không cần mẹo "Video đã xem" để thêm video vào playlist như trước — cứ có link video là dán vào được, kể cả video dành cho trẻ em.

### 3.3 (Tuỳ chọn) Đọc thẳng playlist thay vì dán từng link

Dán từng link chắc ăn nhất nhưng chậm nếu có nhiều video. Nếu muốn nhanh hơn — cứ đưa 1 playlist YouTube có sẵn, app tự đọc hết — có thể deploy thêm 1 Edge Function nhỏ trên chính Supabase đang dùng. Cách này **vẫn không đụng tới Google Cloud Console / API key**, nhưng cần biết trước 2 điều:

- Đây là cách không chính thức: function tải thẳng trang playlist công khai rồi tách dữ liệu ra (giống cách các công cụ tải video vẫn làm), không qua YouTube Data API. Nếu YouTube đổi cấu trúc trang, function có thể cần cập nhật lại.
- Playlist phải để **Công khai** hoặc **Không công khai (Unlisted)** — không được **Riêng tư**, vì function không đăng nhập tài khoản Google nào cả.

Nếu thấy rủi ro đó chấp nhận được, các bước deploy:

1. Cài Supabase CLI:

   ```bash
   npm install -g supabase
   ```

2. Đăng nhập và liên kết project:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   (`YOUR_PROJECT_REF` lấy trong URL project Supabase, dạng `https://supabase.com/dashboard/project/<project-ref>`)

3. Deploy function có sẵn trong gói code (`supabase/functions/get-playlist`):

   ```bash
   supabase functions deploy get-playlist
   ```

4. Xong — không cần cấu hình thêm gì trong `config.js`, app tự gọi function này qua `SUPABASE_URL` đã có sẵn.
5. Điền Playlist ID vào cột `playlist_id` trên Supabase (Table Editor), hoặc dán qua ô **Playlist ID** trên trang điều khiển ở [mục 9](#9-trang-điều-khiển-từ-xa-trên-điện-thoại) — có điền thì app **ưu tiên đọc playlist**, bỏ trống thì quay lại dùng danh sách `video_ids` như bình thường.

### 3.4 (Bản đặc biệt) Dùng YouTube Data API chính thức, tốn ít quota

Hai cách trên (dán link / đọc playlist không chính thức) đều tránh được Google Cloud Console hoàn toàn. Nếu anh vẫn muốn dùng **API chính thức của YouTube** (dữ liệu chuẩn nhất, ổn định nhất, không sợ YouTube đổi giao diện làm gãy), cách dưới đây vẫn cần qua Google Cloud Console (kể cả bước xác minh 2 bước nếu Google yêu cầu) — nhưng được thiết kế để **tốn quota tối thiểu**:

- Chỉ gọi Google khi **chủ động bấm nút "Làm mới từ YouTube"** trên trang điều khiển — vòng lặp thường ngày của app (TV hỏi Supabase mỗi 20 giây) không bao giờ tự động đụng tới Google.
- Mỗi lần bấm tốn đúng **1 unit quota** (`playlistItems.list` lấy tối đa 50 video/lần gọi — hạn mức miễn phí 10.000 unit/ngày, gần như không bao giờ chạm tới).
- Kết quả được **cache thẳng vào Supabase** — có thêm TV thứ 2 dùng chung playlist thì TV đó đọc cache có sẵn, không tốn thêm quota nào nữa.
- API key nằm trong **Supabase secrets** (biến môi trường phía server), không nhét vào `config.js` như cách cũ — nhờ vậy không ai mở DevTools trên TV mà lấy được key của anh.

**Các bước:**

1. [Google Cloud Console](https://console.cloud.google.com/) → tạo/chọn project → **Library** → bật **YouTube Data API v3** → **Credentials → Create credentials → API key**. Nên giới hạn phạm vi dùng key này trong phần Restrict key.
2. Cài Supabase CLI (nếu chưa cài ở mục 3.3): `npm install -g supabase`, rồi `supabase login` và `supabase link --project-ref YOUR_PROJECT_REF`.
3. Lưu API key làm secret phía server (không phải trong `config.js`):

   ```bash
   supabase secrets set YOUTUBE_API_KEY=dán_key_vào_đây
   ```

4. Deploy function có sẵn trong gói code:

   ```bash
   supabase functions deploy sync-youtube-official
   ```

5. Trên trang điều khiển ([mục 9](#9-trang-điều-khiển-từ-xa-trên-điện-thoại)), điền **Playlist ID**, rồi bấm **🔄 Làm mới từ YouTube** mỗi khi muốn cập nhật danh sách (thêm/bớt video trong playlist xong thì bấm lại).

App tự ưu tiên dữ liệu đã cache qua cách này (nếu có) trước cả 2 cách trên — muốn quay lại đọc tự động thì bấm **Xoá cache** trên trang điều khiển.

### 3.5 Điền cấu hình

Các giá trị bí mật tách riêng khỏi code chính, nằm trong `config.js` (gitignored):

1. `web-app/js/config.example.js` → copy thành `web-app/js/config.js`, điền `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEVICE_ID`.
2. `remote-control/config.example.js` → copy thành `remote-control/config.js`, điền `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEVICE_ID` — **3 giá trị này phải giống hệt** file trên.

---

## 4. Cài Node.js và build TypeScript

Logic chính (`web-app/src/app.ts`) viết bằng TypeScript để bắt lỗi sớm và dễ đọc hơn khi sửa; biên dịch ra `web-app/js/app.js` (JS thuần) — đây mới là file thực sự chạy trên TV. Riêng `config.js` vẫn cố tình để JS thuần vì đó là chỗ người không rành code cũng cần sửa.

1. Cài [Node.js](https://nodejs.org/) (bản LTS).
2. Mở terminal:

   ```bash
   cd web-app
   npm install
   npm run build
   ```

3. Mỗi lần sửa `src/app.ts`, chạy lại `npm run build` (hoặc `npm run watch` để tự build mỗi lần lưu file).

Nếu chỉ muốn dùng thử mà chưa cần sửa logic gì, `js/app.js` trong gói tải về **đã build sẵn**, có thể bỏ qua bước này.

---

## 5. Test trên trình duyệt trước khi lên TV

Code không phụ thuộc riêng vào nền tảng nào (phần gọi API Tizen/webOS đều tự bỏ qua khi không có), nên chạy thẳng trên Chrome/Edge được:

```bash
cd web-app
python3 -m http.server 8080
```

Mở `http://localhost:8080`, điều khiển bằng bàn phím theo đúng bảng ở [mục 2](#2-giao-diện-sidebar-thu-gọnmở-rộng--hero) (mũi tên thay D-pad, Enter thay OK, Backspace/Esc thay Back). Gõ liền dãy số như `12320` để test hẹn giờ 20 phút.

Thấy sidebar mở/thu gọn mượt, hero + lưới video load được, hẹn giờ xong vài giây sau thấy màn "mất wifi" hiện ra là chuyển sang deploy thật được.

---

## 6. Triển khai lên Samsung Tizen

1. **Bật Developer Mode trên TV**: mở app Store → gõ `1234` → chọn bật → TV khởi động lại → nhập IP máy tính vào ô hiện ra.
2. Cài [VS Code](https://code.visualstudio.com/) + extension **Tizen**.
3. Tạo project mới: **Create Project → Web Application → Basic/Empty**.
4. Copy toàn bộ nội dung `web-app/` (gồm cả `js/config.js` đã điền — file này không có sẵn trong git nên phải tự tạo) vào project vừa tạo, đè lên file mẫu.
5. Mở `config.xml` VS Code tự sinh, thêm (tham khảo `platforms/tizen/config.xml`):
   - `<tizen:privilege name="http://tizen.org/privilege/internet"/>`
   - thuộc tính `hwkey-event="enable"` trong `<tizen:setting>` (để bắt nút Back của remote)
6. Bấm **Run**, chọn TV trong danh sách thiết bị (TV và máy tính phải cùng mạng).

---

## 7. Triển khai lên LG webOS

1. **Bật Developer Mode**: trên TV LG, cài app **Developer Mode** từ LG Content Store (cần đăng nhập tài khoản LG Developer, miễn phí — đăng ký tại [webostv.developer.lge.com](https://webostv.developer.lge.com/)). Bật chế độ này lên, TV hiện IP + passphrase. Lưu ý: Developer Mode LG chỉ có hiệu lực ~50 giờ mỗi lần bật rồi phải khởi động lại session (bấm "Enable Developer Mode" lại trong app đó).
2. Trên máy tính, cài **webOS CLI** (Node.js đã cài ở mục 4 rồi):

   ```bash
   npm install -g @webosose/ares-cli
   ```

3. Đăng ký kết nối tới TV:

   ```bash
   ares-setup-device
   ```
   Làm theo hướng dẫn, nhập IP + passphrase TV đã hiện ở bước 1, đặt tên thiết bị (ví dụ `tv-phong-khach`).

4. Copy `platforms/webos/appinfo.json` và `platforms/webos/icon.png` vào thẳng thư mục `web-app/` (cùng cấp với `index.html`) — webOS đóng gói package từ 1 thư mục duy nhất.

5. Đóng gói và cài:

   ```bash
   ares-package web-app
   ares-install -d tv-phong-khach com.protube.tv_1.0.0_all.ipk
   ares-launch -d tv-phong-khach com.protube.tv
   ```

   (đổi `tv-phong-khach` thành tên thiết bị bạn đặt ở bước 3, và tên file `.ipk` theo đúng output của `ares-package`)

---

## 8. Triển khai lên Android TV / Google TV

Android không có kiểu "web app" đóng gói trực tiếp như Tizen/webOS, nên `platforms/android-tv/` là một project Android Studio tối giản: toàn bộ giao diện chỉ là **1 WebView** load `web-app/`.

1. Cài [Android Studio](https://developer.android.com/studio).
2. Mở thư mục `platforms/android-tv/` bằng Android Studio (Open → chọn thư mục), để nó tự tải Gradle/SDK cần thiết.
3. Project đã có sẵn 1 Gradle task tự copy `web-app/` vào `assets/web` mỗi lần build (`copyWebApp` trong `app/build.gradle`). Nếu vì lý do gì đó task này không chạy được ở máy bạn, copy tay toàn bộ nội dung `web-app/` (gồm `js/config.js`) vào `platforms/android-tv/app/src/main/assets/web/`.
4. Kết nối TV/emulator:
   - **TV thật**: vào **Cài đặt → Giới thiệu → bấm liên tục vào số hiệu bản dựng** để bật Developer Options, bật **Gỡ lỗi USB qua mạng** (hoặc **Network debugging**), rồi `adb connect <IP-của-TV>:5555` từ máy tính.
   - **Emulator**: tạo 1 Android Virtual Device loại **TV** trong Android Studio (Device Manager → Create Device → chọn hạng mục TV).
5. Bấm **Run ▶** trong Android Studio, chọn thiết bị.

Icon (`res/mipmap-xhdpi/ic_launcher.png`) và banner hiện trên màn hình chủ (`res/drawable/banner.png`) trong gói tải về chỉ là **hình mẫu tạm** (nền tím than + logo mặt cười) — nên thay bằng icon riêng qua Android Studio (chuột phải `res` → **New → Image Asset**) trước khi dùng lâu dài.

> Lưu ý: phần WebView này mình viết dựa trên các API chuẩn của Android, nhưng chưa test trên TV thật (môi trường soạn hướng dẫn này không có thiết bị Android TV). D-pad (mũi tên + OK) và nút Back nhìn chung sẽ hoạt động vì WebView hiện đại tự dịch phím cứng sang sự kiện bàn phím cho trang web, nhưng nếu gặp trục trặc, khả năng cao nằm ở việc WebView chưa được focus đúng — thử báo lại để cùng gỡ.

---

## 9. Trang điều khiển từ xa (trên điện thoại)

Mở `remote-control/index.html` trực tiếp trên điện thoại (mở file cũng chạy được, mọi dữ liệu lấy qua Supabase). Muốn tiện bookmark thì kéo thư mục `remote-control` vào [Netlify Drop](https://app.netlify.com/drop) là có link ngay.

Trên trang này: xem trạng thái hiện tại, đặt/huỷ hẹn giờ, ngắt ngay lập tức, đổi danh sách video / PIN mà không cần build lại app (TV nhận thay đổi trong tối đa 20 giây).

---

## 10. Cơ chế hẹn giờ "mất wifi" hoạt động thế nào

- **Bấm PIN trên remote**: app luôn lắng nghe phím số, gom thành chuỗi (giữ 10 ký tự gần nhất). Khớp `PIN + 2 chữ số` ở cuối chuỗi thì lấy 2 số đó làm số phút, xoá chuỗi. Không có ô nhập nào hiện lên.
- **Đặt lịch**: dù đặt bằng remote hay điện thoại, app tính ra một mốc thời gian cụ thể, dùng `setTimeout` để tự kích hoạt màn "mất wifi" đúng lúc, đồng thời ghi mốc đó lên Supabase.
- **Đồng bộ 2 chiều**: TV hỏi lại Supabase mỗi 20 giây — đặt giờ từ điện thoại thì TV tự cập nhật theo trong vòng 1 chu kỳ.
- **Vì sao không tự hết sau X phút**: màn "mất wifi" cứ đứng yên tới khi bị huỷ, giống mất wifi thật — không có gì để trẻ "chờ hết giờ" mà cãi.

---

## 11. Tuỳ biến thêm

**Thêm mục vào sidebar**: mở `web-app/src/app.ts`, tìm mảng `NAV_ITEMS`, thêm 1 dòng:

```ts
{ id: 'nhac', label: 'Bài hát', icon: ICON_STAR, source: 'static',
  videoIds: ['dQw4w9WgXcQ', 'https://youtu.be/anotherID11'] },
// hoặc dùng playlistId thay vì videoIds nếu đã deploy Edge Function ở mục 3.3:
// { id: 'nhac', label: 'Bài hát', icon: ICON_STAR, source: 'static', playlistId: 'PLxxxxxxxxxxxxxxxxxxxxxxx' },
```

`source: 'static'` nghĩa là danh sách video gõ cứng ngay trong code (không qua Supabase) — cách nhanh nhất để thêm mục mới. Chạy lại `npm run build` rồi deploy lại.

**Đổi giao diện**: toàn bộ màu/font nằm ở đầu `web-app/css/style.css` dưới dạng biến CSS (`--bg`, `--accent`...).

**Đổi tần suất đồng bộ**: sửa `CONFIG_POLL_INTERVAL_MS` trong `web-app/src/app.ts`, build lại.

**Nhiều TV**: thêm 1 hàng trong bảng `devices` (Supabase) với `id` khác, tạo 1 bộ `config.js` riêng cho mỗi TV.

---

## 12. Bảo mật cần biết

App không có đăng nhập — ai có đủ `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEVICE_ID` đều điều khiển được TV. Lớp bảo vệ là `DEVICE_ID` ngẫu nhiên khó đoán — không đăng các file đã điền giá trị thật lên nơi công khai. `.gitignore` trong gói đã tự loại `config.js` khỏi git.

---

## 13. Xử lý sự cố

**App báo "Thiếu js/config.js"**
Chưa copy `config.example.js` thành `config.js`, hoặc quên copy khi đưa vào project từng nền tảng.

**`npm run build` báo lỗi TypeScript**
Đọc thông báo lỗi — thường chỉ đúng dòng/cột trong `app.ts`. Sửa xong chạy lại `npm run build`.

**Lưới video trống**
Kiểm tra cột `video_ids` trên Supabase có link/mã video hợp lệ chưa (mỗi dòng 1 video), và link có đúng định dạng `youtube.com/watch?v=...` hoặc `youtu.be/...` không. Mở Console trình duyệt lúc test ở mục 5 để xem lỗi cụ thể.

**Video hiện ra nhưng tiêu đề là 1 dãy ký tự lạ (mã video) thay vì tên thật**
Bình thường — nghĩa là lấy tiêu đề qua oEmbed thất bại (mất mạng lúc đó, hoặc YouTube tạm chặn). Video vẫn phát được, không ảnh hưởng gì; tải lại app để thử lấy tiêu đề lại.

**Điền `playlist_id` nhưng lưới video vẫn trống**
Kiểm tra đã `supabase functions deploy get-playlist` chưa (mục 3.3). Mở thẳng URL
`https://YOUR-PROJECT.supabase.co/functions/v1/get-playlist?id=<playlist_id>` kèm header
`apikey`/`Authorization` (dùng Postman hoặc `curl -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY" "..."`)
để xem function trả lỗi gì. Lỗi thường gặp: playlist để **Riêng tư** (đổi sang Công khai/Unlisted), hoặc sai `playlist_id`.

**Bấm "Làm mới từ YouTube" báo lỗi**
- "Server chưa cấu hình YOUTUBE_API_KEY": chưa chạy `supabase secrets set YOUTUBE_API_KEY=...`, hoặc chạy xong quên deploy lại function.
- Lỗi từ chính YouTube (ví dụ "API key not valid", "quotaExceeded"): kiểm tra key đã bật đúng YouTube Data API v3 trên đúng project Google Cloud chưa; `quotaExceeded` gần như không xảy ra với cách dùng tiết kiệm này trừ khi bấm làm mới hàng nghìn lần/ngày.
- Không thấy lỗi cụ thể: mở **Supabase Dashboard → Edge Functions → sync-youtube-official → Logs** để xem log chi tiết.

**Tizen: TV không hiện trong danh sách chọn thiết bị**
Kiểm tra cùng mạng, IP TV đã nhập đúng trong Developer Mode chưa (IP có thể đổi nếu router cấp lại DHCP).

**webOS: `ares-setup-device` không kết nối được**
Kiểm tra Developer Mode chưa hết hạn 50 giờ (mở lại app Developer Mode trên TV, bấm "Enable" lại), và TV/máy tính cùng mạng.

**webOS: `ares-package` báo lỗi thiếu icon**
Kiểm tra đã copy `platforms/webos/icon.png` vào cùng thư mục với `index.html` (`web-app/`) trước khi package chưa.

**Android TV: màn hình trắng/đen khi mở app**
Thường do quên copy `web-app/` vào `assets/web` (task Gradle tự động không chạy) — copy tay rồi build lại. Kiểm tra thêm quyền Internet đã khai báo trong `AndroidManifest.xml` (đã có sẵn trong project mẫu).

**Android TV: remote không điều hướng được**
Kiểm tra WebView đã nhận focus (`webView.requestFocus()` đã gọi trong `MainActivity.kt`). Nếu dùng emulator, một số bản AVD cần bật thêm tuỳ chọn hỗ trợ D-pad trong cấu hình thiết bị ảo.

**Đặt hẹn giờ từ điện thoại nhưng TV không nhận**
Đợi tối đa 1 chu kỳ đồng bộ (20 giây). Kiểm tra TV có đang có mạng bình thường không.
