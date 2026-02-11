import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';

void main() {
  group('TimeTrackingRequestComment', () {
    test('parses nested user object from API response', () {
      final comment = TimeTrackingRequestComment.fromJson(const {
        'id': 'c_1',
        'request_id': 'r_1',
        'user_id': 'u_1',
        'content': 'Looks good',
        'created_at': '2026-02-11T12:00:00.000Z',
        'user': {
          'id': 'u_1',
          'display_name': 'Alice',
          'avatar_url': 'https://example.com/alice.png',
        },
      });

      expect(comment.userDisplayName, 'Alice');
      expect(comment.userAvatarUrl, 'https://example.com/alice.png');
      expect(comment.userId, 'u_1');
    });

    test('allows edit/delete for owner within 15 minutes', () {
      final comment = TimeTrackingRequestComment(
        id: 'c_1',
        userId: 'u_1',
        createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      expect(comment.canEditOrDelete('u_1'), isTrue);
      expect(comment.canEditOrDelete('u_2'), isFalse);
    });
  });
}
