package com.tuturuuu.app.mobile.assistant

import java.util.UUID

/** Which Android component received a shortcut intent. */
enum class AssistantShortcutEntry {
    /** Non-exported trampoline. Only launcher shortcuts and this app can start it. */
    PRIVATE_SHORTCUT,

    /** Exported App Actions entry. Any app can start it, so it is untrusted. */
    ASSISTANT_ACTION,

    /** Exported launcher activity. Never accepts shortcut actions. */
    MAIN_ACTIVITY,
}

data class AssistantShortcutAction(
    val id: String,
    val kind: String,
    val trusted: Boolean,
    val createdAtMs: Long,
    val prompt: String? = null,
) {
    fun toPayload(): Map<String, Any> = buildMap {
        put("id", id)
        put("kind", kind)
        put("trusted", trusted)
        put("createdAtMs", createdAtMs)
        prompt?.let { put("prompt", it) }
    }
}

/**
 * Pure intent routing so the trust rules stay unit-testable without Android.
 *
 * - Private launcher shortcuts are trusted: voice starts directly.
 * - The exported App Actions entry may only request voice, untrusted, so
 *   Flutter asks for confirmation before the microphone opens.
 * - The exported MainActivity ignores every shortcut action.
 * - No exported path can carry a prompt.
 */
object AssistantShortcutIntents {
    const val ACTION_START_VOICE = "com.tuturuuu.app.mobile.action.START_MIRA_VOICE"
    const val ACTION_OPEN_CHAT = "com.tuturuuu.app.mobile.action.OPEN_MIRA_CHAT"
    const val KIND_VOICE = "voice"
    const val KIND_PROMPT = "prompt"

    val customActions = setOf(ACTION_START_VOICE, ACTION_OPEN_CHAT)

    const val EXTRA_FEATURE = "feature"

    fun resolve(
        action: String?,
        entry: AssistantShortcutEntry,
        nowMs: Long,
        feature: String? = null,
        newId: () -> String = { UUID.randomUUID().toString() },
    ): AssistantShortcutAction? = when (entry) {
        AssistantShortcutEntry.MAIN_ACTIVITY -> null
        AssistantShortcutEntry.ASSISTANT_ACTION ->
            if (isMiraFeature(feature)) {
                AssistantShortcutAction(newId(), KIND_VOICE, trusted = false, createdAtMs = nowMs)
            } else {
                null
            }
        AssistantShortcutEntry.PRIVATE_SHORTCUT -> when (action) {
            ACTION_START_VOICE -> AssistantShortcutAction(newId(), KIND_VOICE, true, nowMs)
            ACTION_OPEN_CHAT -> AssistantShortcutAction(newId(), KIND_PROMPT, true, nowMs)
            else -> null
        }
    }

    /** App Actions `OPEN_APP_FEATURE` names, e.g. "Mira voice chat". */
    fun isMiraFeature(feature: String?): Boolean =
        feature?.trim()?.lowercase()?.contains("mira") == true

    /** True when an intent reaching MainActivity must be neutralised. */
    fun isForeignShortcutAction(action: String?): Boolean = action in customActions
}
