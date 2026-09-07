# ProTube

App YouTube playlist riêng cho trẻ em, chạy trên **Samsung Tizen / LG webOS / Android TV**, cùng dùng 1 bộ code web (TypeScript). Có tính năng hẹn giờ "mất wifi" giả (tại chỗ trên remote, hoặc từ xa qua điện thoại) để kết thúc giờ xem êm đẹp.

**Hướng dẫn đầy đủ: [`help.md`](./help.md)** — kiến trúc, cách build, và các bước triển khai riêng cho từng nền tảng.

## Cấu trúc project

```
kid-tv-app/
├── web-app/              app dùng chung cho cả 3 nền tảng
│   ├── src/app.ts         logic chính (TypeScript)
│   ├── js/                app.js đã build sẵn + config.example.js
│   ├── css/style.css
│   └── index.html
├── platforms/
│   ├── tizen/config.xml
│   ├── webos/appinfo.json
│   └── android-tv/        project Android Studio (WebView wrapper)
├── remote-control/        trang điều khiển mở trên điện thoại
└── supabase/
    ├── schema.sql                     schema Supabase (chạy 1 lần)
    └── functions/
        ├── get-playlist/               (tuỳ chọn) đọc thẳng playlist, không cần API key
        └── sync-youtube-official/      (bản đặc biệt) dùng YouTube Data API chính thức, tốn ít quota
```

## Bắt đầu nhanh

```bash
cd web-app
npm install && npm run build   # biên dịch TypeScript -> js/app.js
python3 -m http.server 8080    # test ngay trên trình duyệt
```

Chi tiết đầy đủ (Supabase, thêm video không cần API key Google, deploy Tizen/webOS/Android TV, bảo mật, xử lý sự cố) nằm hết trong [`help.md`](./help.md).

## License

This project is licensed under the [MIT](LICENSE) license
