import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_optimistic.dart';

void main() {
  final items = [
    {'id': 'a', 'unread': true, 'unreadCount': 2},
    {'id': 'b', 'unread': true, 'unreadCount': 1},
  ];

  test('snooze and mute hide only the selected Inbox thread', () {
    for (final action in ['snooze', 'mute']) {
      final result = optimisticMailItems(
        items,
        {'a'},
        action: action,
        folder: 'inbox',
        query: '',
      );
      expect(result.map((item) => item['id']), ['b']);
      expect(items, hasLength(2));
    }
  });

  test(
    'archiving removes selected inbox threads without mutating rollback data',
    () {
      final result = optimisticMailItems(
        items,
        {'a'},
        action: 'archive',
        folder: 'inbox',
        query: '',
      );
      expect(result.map((item) => item['id']), ['b']);
      expect(items.first['unreadCount'], 2);
      expect(items, hasLength(2));
    },
  );

  test(
    'read feedback preserves normal results and updates the selected count',
    () {
      final result = optimisticMailItems(
        items,
        {'a'},
        action: 'mark_read',
        folder: 'inbox',
        query: '',
      );
      expect(result.first['unreadCount'], 0);
      expect(result.first['unread'], false);
      expect(result.last['unreadCount'], 1);
    },
  );

  for (final query in ['is:unread', 'from:team is:"unread"', 'IS:UNREAD']) {
    test('mark-read removes the selected result from $query', () {
      final result = optimisticMailItems(
        items,
        {'a'},
        action: 'mark_read',
        folder: 'inbox',
        query: query,
      );
      expect(result.map((item) => item['id']), ['b']);
    });
  }

  test('archive and trash views keep messages already in those folders', () {
    expect(
      optimisticMailItems(
        items,
        {'a'},
        action: 'archive',
        folder: 'archive',
        query: '',
      ),
      hasLength(2),
    );
    expect(
      optimisticMailItems(
        items,
        {'a'},
        action: 'trash',
        folder: 'trash',
        query: '',
      ),
      hasLength(2),
    );
  });
}
