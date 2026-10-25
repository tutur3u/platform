package com.tuturuuu.app.mobile.assistant

/** Holds shortcut actions until Dart drains them; survives a cold engine start. */
object AssistantShortcutInbox {
    const val CAPACITY = 4

    private val pending = ArrayDeque<AssistantShortcutAction>()
    private var listener: (() -> Unit)? = null

    fun enqueue(action: AssistantShortcutAction) {
        val notify = synchronized(this) {
            pending.addLast(action)
            while (pending.size > CAPACITY) pending.removeFirst()
            listener
        }
        notify?.invoke()
    }

    fun drain(): List<AssistantShortcutAction> = synchronized(this) {
        val actions = pending.toList()
        pending.clear()
        actions
    }

    fun setListener(value: (() -> Unit)?) = synchronized(this) { listener = value }
}
