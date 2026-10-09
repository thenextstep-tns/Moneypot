package com.moneypot.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MoneypotWidgetModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MoneypotWidget"

    @ReactMethod
    fun updateWidgetData(pendingCount: Int, amountText: String) {
        val prefs: SharedPreferences =
            reactContext.getSharedPreferences("MoneypotWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putInt("pending_count", pendingCount)
            .putString("amount_text", amountText)
            .apply()

        val appWidgetManager = AppWidgetManager.getInstance(reactContext)
        val componentName = ComponentName(reactContext, MoneypotWidgetProvider::class.java)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)

        if (appWidgetIds.isNotEmpty()) {
            val intent = Intent(reactContext, MoneypotWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
            }
            reactContext.sendBroadcast(intent)
        }
    }
}
