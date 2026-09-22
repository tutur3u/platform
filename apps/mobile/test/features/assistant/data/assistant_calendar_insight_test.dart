import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_calendar_insight.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('calendar count includes events beyond the compact preview', () async {
    final api = _Api();
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'data': [
          null,
          for (var index = 0; index < 30; index++)
            {'id': 'event-$index', 'title': 'Event $index'},
        ],
      },
    );
    final insight = await loadAssistantCalendarInsight(api, 'ws');
    expect(insight.total, 30);
    expect(insight.events, hasLength(25));
    expect(insight.events.last.id, 'event-24');
  });
}
