package com.tuturuuu.app.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private class FakeHost : ShellBackHost {
    val events = mutableListOf<String>()
    val pendingReplies = mutableListOf<(ModalReply) -> Unit>()
    val timers = mutableListOf<Pair<() -> Unit, BooleanArray>>()
    var channelAvailable = true
    var now = 10_000L

    override fun queryHasModal(onReply: (ModalReply) -> Unit): Boolean {
        if (!channelAvailable) return false
        events += "query"
        pendingReplies += onReply
        return true
    }

    override fun popFlutterRoute() {
        events += "pop"
    }

    override fun showExitHint() {
        events += "hint"
    }

    override fun exitApp() {
        events += "exit"
    }

    override fun schedule(delayMs: Long, action: () -> Unit): () -> Unit {
        val cancelled = booleanArrayOf(false)
        timers += action to cancelled
        return { cancelled[0] = true }
    }

    override fun nowMs(): Long = now

    fun reply(index: Int, reply: ModalReply) = pendingReplies[index](reply)

    /** Fires every timer that has not been cancelled. */
    fun elapse() = timers.filterNot { it.second[0] }.forEach { it.first() }
}

class ShellBackCoordinatorTest {
    private lateinit var host: FakeHost
    private lateinit var back: ShellBackCoordinator

    @Before
    fun setUp() {
        host = FakeHost()
        back = ShellBackCoordinator(host)
        back.updateRoute("/")
    }

    @Test
    fun nonExitRouteGoesStraightToFlutter() {
        back.updateRoute("/settings")
        back.onBack()
        assertEquals(listOf("pop"), host.events)
    }

    @Test
    fun openModalClosesTheOverlayInsteadOfExiting() {
        back.onBack()
        host.reply(0, ModalReply.OPEN)
        assertEquals(listOf("query", "pop"), host.events)
    }

    @Test
    fun noModalNeedsTwoPressesToExit() {
        back.onBack()
        host.reply(0, ModalReply.NONE)
        back.onBack()
        host.reply(1, ModalReply.NONE)
        assertEquals(listOf("query", "hint", "query", "exit"), host.events)
    }

    @Test
    fun overlappingPressesSendOneQueryAndPopOnce() {
        back.onBack()
        back.onBack()
        back.onBack()
        assertEquals(1, host.pendingReplies.size)
        assertTrue(back.isQuerying)
        host.reply(0, ModalReply.OPEN)
        assertEquals(listOf("query", "pop"), host.events)
        assertFalse(back.isQuerying)
    }

    @Test
    fun delayedReplyAfterTimeoutIsDropped() {
        back.onBack()
        host.elapse()
        // Timeout hands Back to Flutter rather than exiting.
        assertEquals(listOf("query", "pop"), host.events)
        host.reply(0, ModalReply.NONE)
        assertEquals(listOf("query", "pop"), host.events)
    }

    @Test
    fun replyAfterRouteChangeIsDropped() {
        back.onBack()
        back.updateRoute("/settings")
        host.reply(0, ModalReply.NONE)
        assertEquals(listOf("query"), host.events)
        // Returning to the exit route starts a fresh query.
        back.updateRoute("/")
        back.onBack()
        host.reply(1, ModalReply.NONE)
        assertEquals(listOf("query", "query", "hint"), host.events)
    }

    @Test
    fun staleReplyDoesNotSettleANewerQuery() {
        back.onBack()
        host.elapse()
        back.onBack()
        host.reply(0, ModalReply.NONE)
        assertEquals(listOf("query", "pop", "query"), host.events)
        host.reply(1, ModalReply.OPEN)
        assertEquals(listOf("query", "pop", "query", "pop"), host.events)
    }

    @Test
    fun unavailableChannelOrErrorNeverExits() {
        host.channelAvailable = false
        back.onBack()
        back.onBack()
        assertEquals(listOf("pop", "pop"), host.events)
        host.channelAvailable = true
        back.onBack()
        host.reply(0, ModalReply.UNAVAILABLE)
        assertEquals(listOf("pop", "pop", "query", "pop"), host.events)
    }

    @Test
    fun exitWindowExpires() {
        back.onBack()
        host.reply(0, ModalReply.NONE)
        host.now += ShellBackCoordinator.EXIT_WINDOW_MS + 1
        back.onBack()
        host.reply(1, ModalReply.NONE)
        assertEquals(listOf("query", "hint", "query", "hint"), host.events)
    }
}
