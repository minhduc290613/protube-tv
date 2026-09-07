package com.protube.tv

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * Vỏ bọc WebView cho Android TV — không viết lại giao diện bằng
 * Leanback, chỉ tải nguyên app web dùng chung (Tizen/webOS/Android)
 * đã được copy vào assets/web lúc build (xem app/build.gradle).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webViewClient = WebViewClient()
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(webView)
        webView.requestFocus()

        webView.loadUrl("file:///android_asset/web/index.html")
    }

    // Remote Android TV gửi phím Back (KEYCODE_BACK) -> chuyển thành
    // phím "Escape" cho JS xử lý (quay lại màn hình trước, giống
    // Backspace/Esc lúc test trên trình duyệt) thay vì để hệ thống
    // đóng app ngay lập tức. Muốn thoát hẳn app, dùng nút Home trên remote.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_DOWN) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));",
                null
            )
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
