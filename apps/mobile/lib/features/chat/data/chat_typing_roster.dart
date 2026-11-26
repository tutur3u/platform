import 'dart:async';

/// Who is typing in the open conversation, as the room reports it.
///
/// A typist's `false` frame can be lost: the sender's app dies or goes
/// offline, its socket is reconnecting, or the room's shared broadcast
/// budget drops the frame. Each typist therefore expires [ttl] after their
/// last `true`, as on web; senders refresh well inside it while typing.
/// The roster covers one conversation at a time and is cleared when it
/// changes, so a typist never shows in another thread.
class ChatTypingRoster {
  ChatTypingRoster({
    required void Function(Set<String> userIds) onChanged,
    this.ttl = const Duration(seconds: 5),
    Timer Function(Duration duration, void Function() callback)? timer,
  }) : _onChanged = onChanged,
       _timer = timer ?? Timer.new;

  final void Function(Set<String> userIds) _onChanged;
  final Duration ttl;
  final Timer Function(Duration duration, void Function() callback) _timer;
  final _expiry = <String, Timer>{};
  String? _conversationId;

  /// The conversation whose typists are tracked.
  String? get conversationId => _conversationId;

  Set<String> get userIds => Set.unmodifiable(_expiry.keys);

  /// Records [userId]'s typing in [conversationId]; other conversations
  /// are ignored.
  void apply(String conversationId, String userId, {required bool typing}) {
    if (conversationId != _conversationId) return;
    final had = _expiry.remove(userId);
    had?.cancel();
    if (typing) {
      _expiry[userId] = _timer(ttl, () {
        if (_expiry.remove(userId) != null) _onChanged(userIds);
      });
    }
    if (typing || had != null) _onChanged(userIds);
  }

  /// Tracks [conversationId] (none when null) and forgets every typist.
  void reset(String? conversationId) {
    _conversationId = conversationId;
    if (_expiry.isEmpty) return;
    _clear();
    _onChanged(const {});
  }

  void dispose() {
    _conversationId = null;
    _clear();
  }

  void _clear() {
    for (final timer in _expiry.values) {
      timer.cancel();
    }
    _expiry.clear();
  }
}
