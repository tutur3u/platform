import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/data/meet_call_notices.dart';

void main() {
  late MeetCallNotices tracker;
  setUp(() => tracker = MeetCallNotices());
  List<MeetCallNotice> receive(
    Map<String, dynamic> message, {
    bool host = true,
    bool admitted = true,
  }) => tracker.handle(
    message,
    selfUserId: 'self',
    admitted: admitted,
    host: host,
  );
  Map<String, dynamic> presence(List<String> ids) => {
    'type': 'presence',
    'presence': [
      for (final id in ids) {'userId': id, 'displayName': id},
    ],
  };
  Map<String, dynamic> waiting(List<String> ids) => {
    'type': 'admission.pending',
    'participants': [
      for (final id in ids) {'userId': id, 'displayName': id},
    ],
  };
  test('initial and reconnect presence stay quiet; live joins alert once', () {
    expect(receive(presence(['self', 'old'])), isEmpty);
    expect(receive(presence(['self', 'old', 'new'])).single.kind, 'joined');
    expect(receive(presence(['self', 'old', 'new'])), isEmpty);
    tracker.resetConnection();
    expect(receive(presence(['self', 'new', 'during-reconnect'])), isEmpty);
    expect(
      receive(
        presence(['self', 'new', 'during-reconnect', 'live']),
      ).single.name,
      'live',
    );
  });
  test('pending requests alert host once and re-alert after a new request', () {
    expect(receive(waiting(['guest'])).single.kind, 'waiting');
    tracker.resetConnection();
    expect(receive(waiting(['guest'])), isEmpty);
    receive(waiting([]));
    expect(receive(waiting(['guest'])).single.name, 'guest');
    expect(receive(waiting(['other']), host: false), isEmpty);
  });
  test('chat excludes replay, duplicate, self and non-admitted messages', () {
    Map<String, dynamic> chat(
      String id, {
      String user = 'guest',
      bool replay = false,
    }) => {
      'type': 'chat.message',
      'id': id,
      'userId': user,
      'displayName': user,
      'body': 'synthetic',
      'replayed': replay,
    };
    expect(receive(chat('1')).single.kind, 'chat');
    expect(receive(chat('1')), isEmpty);
    expect(receive(chat('2', replay: true)), isEmpty);
    expect(receive(chat('3', user: 'self')), isEmpty);
    expect(receive(chat('4'), admitted: false), isEmpty);
    tracker.resetConnection();
    expect(receive(chat('1')), isEmpty);
  });
}
