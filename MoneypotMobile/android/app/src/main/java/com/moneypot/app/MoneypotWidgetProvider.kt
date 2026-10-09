package com.moneypot.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class MoneypotWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs = context.getSharedPreferences("MoneypotWidgetPrefs", Context.MODE_PRIVATE)
        val pendingCount = prefs.getInt("pending_count", -1)
        val amountText = prefs.getString("amount_text", "") ?: ""

        for (appWidgetId in appWidgetIds) {
            try {
                val views = RemoteViews(context.packageName, R.layout.moneypot_widget)

                // Dynamic status and amount text
                if (pendingCount > 0) {
                    val plural = if (pendingCount > 1) "s" else ""
                    views.setTextViewText(R.id.widget_status_text, "$pendingCount item$plural to confirm")
                    views.setTextViewText(R.id.widget_amount_text, amountText)
                } else if (pendingCount == 0) {
                    views.setTextViewText(R.id.widget_status_text, "All caught up today 🎉")
                    views.setTextViewText(R.id.widget_amount_text, "")
                } else {
                    views.setTextViewText(R.id.widget_status_text, "Today's payments")
                    views.setTextViewText(R.id.widget_amount_text, "")
                }

                // PendingIntents for Deep Links
                views.setOnClickPendingIntent(
                    R.id.widget_header,
                    createDeepLinkIntent(context, "moneypot://today", 100)
                )
                views.setOnClickPendingIntent(
                    R.id.widget_btn_confirm,
                    createDeepLinkIntent(context, "moneypot://confirm-today", 101)
                )
                views.setOnClickPendingIntent(
                    R.id.widget_btn_add,
                    createDeepLinkIntent(context, "moneypot://add-payment", 102)
                )
                views.setOnClickPendingIntent(
                    R.id.widget_btn_early,
                    createDeepLinkIntent(context, "moneypot://pay-early", 103)
                )

                appWidgetManager.updateAppWidget(appWidgetId, views)
            } catch (e: Exception) {
                android.util.Log.e("MoneypotWidget", "Error updating widget id $appWidgetId", e)
            }
        }
    }

    private fun createDeepLinkIntent(
        context: Context,
        uriString: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
            setClass(context, MainActivity::class.java)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
