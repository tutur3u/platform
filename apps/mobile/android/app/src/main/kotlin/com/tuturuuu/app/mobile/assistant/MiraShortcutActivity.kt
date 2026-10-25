package com.tuturuuu.app.mobile.assistant

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Invisible trampoline for Mira shortcuts. The manifest declares it
 * `exported=false`, so only launcher static shortcuts (started by the system
 * on the user's behalf) and this app can reach it. It queues the action and
 * brings the main task forward.
 */
open class MiraShortcutActivity : Activity() {
    protected open val entry = AssistantShortcutEntry.PRIVATE_SHORTCUT

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            AssistantShortcutIntents.resolve(
                action = intent?.action,
                entry = entry,
                nowMs = System.currentTimeMillis(),
                feature = intent?.getStringExtra(AssistantShortcutIntents.EXTRA_FEATURE),
            )?.let(AssistantShortcutInbox::enqueue)
            packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
                launch.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED,
                )
                startActivity(launch)
            }
        }
        finish()
    }
}

/**
 * Exported entry for Google Assistant App Actions. Callers cannot be
 * verified, so it only requests an untrusted voice start that Flutter
 * confirms on screen before opening the microphone.
 */
class MiraAssistantActionActivity : MiraShortcutActivity() {
    override val entry = AssistantShortcutEntry.ASSISTANT_ACTION
}
