package com.tuturuuu.app.mobile.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AssistantShortcutIntentsTest {
    private val now = 1_700_000_000_000L

    @Before
    fun clearInbox() {
        AssistantShortcutInbox.setListener(null)
        AssistantShortcutInbox.drain()
    }

    @Test
    fun externalExplicitIntentToMainActivityNeverStartsLive() {
        for (action in AssistantShortcutIntents.customActions + null + "android.intent.action.MAIN") {
            assertNull(
                AssistantShortcutIntents.resolve(action, AssistantShortcutEntry.MAIN_ACTIVITY, now, "Mira voice chat"),
            )
        }
        assertTrue(AssistantShortcutIntents.isForeignShortcutAction(AssistantShortcutIntents.ACTION_START_VOICE))
        assertTrue(AssistantShortcutIntents.isForeignShortcutAction(AssistantShortcutIntents.ACTION_OPEN_CHAT))
        assertFalse(AssistantShortcutIntents.isForeignShortcutAction("android.intent.action.VIEW"))
    }

    @Test
    fun privateLauncherShortcutStartsTrustedVoice() {
        val action = AssistantShortcutIntents.resolve(
            AssistantShortcutIntents.ACTION_START_VOICE,
            AssistantShortcutEntry.PRIVATE_SHORTCUT,
            now,
            newId = { "id-1" },
        )
        assertEquals(AssistantShortcutAction("id-1", "voice", true, now), action)
    }

    @Test
    fun privateChatShortcutOpensComposerWithoutPrompt() {
        val action = AssistantShortcutIntents.resolve(
            AssistantShortcutIntents.ACTION_OPEN_CHAT,
            AssistantShortcutEntry.PRIVATE_SHORTCUT,
            now,
        )
        assertEquals("prompt", action?.kind)
        assertNull(action?.prompt)
        assertNull(AssistantShortcutIntents.resolve("other", AssistantShortcutEntry.PRIVATE_SHORTCUT, now))
    }

    @Test
    fun exportedAssistantEntryIsUntrustedVoiceOnly() {
        for (requested in AssistantShortcutIntents.customActions + null) {
            val action = AssistantShortcutIntents.resolve(
                requested,
                AssistantShortcutEntry.ASSISTANT_ACTION,
                now,
                feature = "Mira voice chat",
            )
            assertEquals("voice", action?.kind)
            assertEquals(false, action?.trusted)
            assertNull(action?.prompt)
            assertFalse(action!!.toPayload().containsKey("prompt"))
        }
        assertNull(
            AssistantShortcutIntents.resolve(null, AssistantShortcutEntry.ASSISTANT_ACTION, now, feature = "settings"),
        )
        assertNull(AssistantShortcutIntents.resolve(null, AssistantShortcutEntry.ASSISTANT_ACTION, now))
    }

    @Test
    fun inboxDrainsOnceWithinCapacityAndSignals() {
        var signals = 0
        AssistantShortcutInbox.setListener { signals++ }
        val actions = (0..AssistantShortcutInbox.CAPACITY).map {
            AssistantShortcutAction("id-$it", "voice", true, now)
        }
        actions.forEach(AssistantShortcutInbox::enqueue)
        assertEquals(actions.size, signals)
        assertEquals(actions.drop(1), AssistantShortcutInbox.drain())
        assertEquals(emptyList<AssistantShortcutAction>(), AssistantShortcutInbox.drain())
    }
}
