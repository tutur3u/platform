import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/request_activity.dart';

void main() {
  group('requestActivityActionFromString', () {
    test('parses known API enum values', () {
      expect(
        requestActivityActionFromString('COMMENT_UPDATED'),
        TimeTrackingRequestActivityAction.commentUpdated,
      );
      expect(
        requestActivityActionFromString('STATUS_CHANGED'),
        TimeTrackingRequestActivityAction.statusChanged,
      );
    });

    test('falls back to unknown for unsupported values', () {
      expect(
        requestActivityActionFromString('SOMETHING_ELSE'),
        TimeTrackingRequestActivityAction.unknown,
      );
    });
  });

  group('TimeTrackingRequestActivityResponse', () {
    test('parses response payload with pagination metadata', () {
      final response = TimeTrackingRequestActivityResponse.fromJson(const {
        'data': [
          {
            'id': 'a_1',
            'request_id': 'r_1',
            'action_type': 'CREATED',
            'actor_id': 'u_1',
            'actor_display_name': 'Alice',
            'created_at': '2026-02-11T12:00:00.000Z',
          },
        ],
        'total': 7,
        'page': 1,
        'limit': 5,
      });

      expect(response.data, hasLength(1));
      expect(response.total, 7);
      expect(response.totalPages, 2);
      expect(response.data.first.actorLabel, 'Alice');
      expect(
        response.data.first.actionType,
        TimeTrackingRequestActivityAction.created,
      );
    });
  });
}
