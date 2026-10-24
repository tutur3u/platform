package com.tuturuuu.app.mobile

/** Flutter's answer to "is a sheet or dialog open?". */
enum class ModalReply { OPEN, NONE, UNAVAILABLE }

/** Platform effects of a Back press; [MainActivity] implements it, tests fake it. */
interface ShellBackHost {
    /**
     * Sends the asynchronous `hasModal` query. Returns false when it could not
     * be sent (no engine or channel); [onReply] is then never called.
     */
    fun queryHasModal(onReply: (ModalReply) -> Unit): Boolean

    /** Lets Flutter handle Back (closes an overlay or runs its own exit flow). */
    fun popFlutterRoute()

    fun showExitHint()

    fun exitApp()

    /** Runs [action] after [delayMs] on the main thread; returns a canceller. */
    fun schedule(delayMs: Long, action: () -> Unit): () -> Unit

    fun nowMs(): Long
}

/**
 * Decides what Android Back does on the shell's exit routes (`/`, `/apps`).
 *
 * Elsewhere Back goes straight to Flutter. On exit routes the app asks Flutter
 * whether an overlay is open first:
 * - one query at a time; presses while it is in flight are ignored;
 * - each query is stamped with a sequence number and the route generation
 *   (incremented on every route change, so leaving and returning to the same
 *   route still invalidates it); a stale reply (superseded, timed out, or any
 *   route change since) is dropped;
 * - only a definite [ModalReply.NONE] can lead to the exit confirmation. A
 *   missing channel, an error or a timeout hands Back to Flutter instead, so
 *   the app never exits while an overlay might be open.
 */
class ShellBackCoordinator(
    private val host: ShellBackHost,
    private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
) {
    var route: String? = null
        private set

    private var lastExitAttemptAt = 0L
    private var sequence = 0L
    private var inFlight: Long? = null
    private var routeGeneration = 0L
    private var inFlightGeneration = 0L
    private var cancelTimeout: (() -> Unit)? = null

    val isQuerying: Boolean
        get() = inFlight != null

    fun updateRoute(next: String?) {
        // Each change starts a new generation; Flutter also re-sends the
        // unchanged route on rebuilds, which must not drop a pending press.
        if (next != route) routeGeneration++
        route = next
        if (!isExitRoute(next)) lastExitAttemptAt = 0L
    }

    fun onBack() {
        val current = route
        if (!isExitRoute(current)) {
            lastExitAttemptAt = 0L
            host.popFlutterRoute()
            return
        }
        if (inFlight != null) return
        val stamp = ++sequence
        inFlight = stamp
        inFlightGeneration = routeGeneration
        cancelTimeout = host.schedule(timeoutMs) { settle(stamp, ModalReply.UNAVAILABLE) }
        val sent = host.queryHasModal { reply -> settle(stamp, reply) }
        if (!sent) settle(stamp, ModalReply.UNAVAILABLE)
    }

    private fun settle(stamp: Long, reply: ModalReply) {
        if (inFlight != stamp) return
        inFlight = null
        cancelTimeout?.invoke()
        cancelTimeout = null
        // The route changed since the press, even if it came back.
        if (routeGeneration != inFlightGeneration) return
        when (reply) {
            ModalReply.OPEN -> {
                lastExitAttemptAt = 0L
                host.popFlutterRoute()
            }
            ModalReply.NONE -> confirmExit()
            ModalReply.UNAVAILABLE -> host.popFlutterRoute()
        }
    }

    private fun confirmExit() {
        val now = host.nowMs()
        if (lastExitAttemptAt != 0L && now - lastExitAttemptAt <= EXIT_WINDOW_MS) {
            lastExitAttemptAt = 0L
            host.exitApp()
            return
        }
        lastExitAttemptAt = now
        host.showExitHint()
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 500L
        const val EXIT_WINDOW_MS = 2000L

        fun isExitRoute(route: String?): Boolean = route == "/" || route == "/apps"
    }
}
