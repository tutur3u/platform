/// Live room events produce notices; snapshots and replayed chat stay quiet.
class MeetCallNotice {
  const MeetCallNotice(this.kind, this.name, {this.body});
  final String kind;
  final String name;
  final String? body;
}

class MeetCallNotices {
  final _participants = <String>{};
  final _waiting = <String>{};
  final _messages = <String>{};
  bool _hasPresence = false;

  void resetConnection() {
    _hasPresence = false;
    // Keep request/message ids through reconnect to avoid duplicate alerts.
  }

  List<MeetCallNotice> handle(
    Map<String, dynamic> message, {
    required String? selfUserId,
    required bool admitted,
    required bool host,
  }) {
    final type = message['type'];
    final result = <MeetCallNotice>[];
    if (type == 'presence') {
      final people = (message['presence'] as List? ?? [])
          .whereType<Map<String, dynamic>>();
      final ids = <String>{};
      for (final person in people) {
        final id = person['userId'];
        if (id is! String) continue;
        ids.add(id);
        if (admitted &&
            _hasPresence &&
            id != selfUserId &&
            !_participants.contains(id)) {
          result.add(
            MeetCallNotice('joined', person['displayName'] as String? ?? ''),
          );
        }
      }
      _participants
        ..clear()
        ..addAll(ids);
      _hasPresence = true;
    } else if (type == 'admission.pending') {
      final ids = <String>{};
      for (final person
          in (message['participants'] as List? ?? [])
              .whereType<Map<String, dynamic>>()) {
        final id = person['userId'];
        if (id is! String) continue;
        ids.add(id);
        if (admitted && host && id != selfUserId && !_waiting.contains(id)) {
          result.add(
            MeetCallNotice('waiting', person['displayName'] as String? ?? ''),
          );
        }
      }
      _waiting
        ..clear()
        ..addAll(ids);
    } else if (type == 'chat.message') {
      final id = message['id'];
      if (id is String &&
          _messages.add(id) &&
          admitted &&
          message['replayed'] != true &&
          message['userId'] != selfUserId) {
        result.add(
          MeetCallNotice(
            'chat',
            message['displayName'] as String? ?? '',
            body: message['body'] as String?,
          ),
        );
      }
      if (_messages.length > 500) _messages.remove(_messages.first);
    }
    return result;
  }
}
