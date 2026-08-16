package com.example.proeliumoperacional

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.allowFileAccess = false
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.loadUrl("https://144.202.29.121")
        setContentView(webView)
        checkForUpdate()
    }

    private fun checkForUpdate() {
        Thread {
            try {
                val connection = java.net.URL("https://144.202.29.121/downloads/version.json").openConnection()
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                val payload = connection.getInputStream().bufferedReader().use { it.readText() }
                val json = org.json.JSONObject(payload)
                val latestCode = json.optInt("versionCode", 0)
                val downloadUrl = json.optString("downloadUrl")
                if (latestCode > BuildConfig.VERSION_CODE && downloadUrl.isNotBlank()) {
                    Handler(Looper.getMainLooper()).post {
                        AlertDialog.Builder(this)
                            .setTitle("Atualização disponível")
                            .setMessage("Há uma nova versão do Proelium Operacional.")
                            .setNegativeButton("Agora não", null)
                            .setPositiveButton("Atualizar") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl))) }
                            .show()
                    }
                }
            } catch (_: Exception) { }
        }.start()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val view = (findViewById<android.view.View>(android.R.id.content) as? android.view.ViewGroup)
            ?.getChildAt(0) as? WebView
        if (view?.canGoBack() == true) view.goBack() else super.onBackPressed()
    }
}
