package app.cuckoocue.debug

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import android.widget.Toast
import app.cuckoocue.widget.CuckooCueWidgetReceiver

class PinWidgetActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val manager = getSystemService(AppWidgetManager::class.java)
        val provider = ComponentName(this, CuckooCueWidgetReceiver::class.java)

        if (manager.isRequestPinAppWidgetSupported) {
            manager.requestPinAppWidget(provider, null, null)
        } else {
            Toast.makeText(this, "Launcher does not support widget pinning.", Toast.LENGTH_LONG).show()
        }
        finish()
    }
}
