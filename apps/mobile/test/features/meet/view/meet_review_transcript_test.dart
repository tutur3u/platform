import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/view/meet_review_transcript.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('shows attributed segments and the chunk fallback', (
    tester,
  ) async {
    await tester.pumpApp(
      const MeetReviewTranscript(
        chunks: [
          {
            'startSeconds': 12,
            'transcript': 'Combined audio',
            'segments': [
              {
                'startSeconds': 13,
                'transcript': 'First speaker',
                'speaker': {'displayName': 'Linh', 'kind': 'microphone'},
                'kind': 'microphone',
              },
              {
                'startSeconds': 74,
                'transcript': 'Shared presentation',
                'kind': 'shared_audio',
              },
            ],
          },
          {'startSeconds': 125, 'transcript': 'Older recording'},
        ],
      ),
    );

    expect(find.text('Linh'), findsOneWidget);
    expect(find.text('0:13'), findsOneWidget);
    expect(find.text('1:14'), findsOneWidget);
    expect(find.text('Shared audio'), findsOneWidget);
    expect(find.text('Unknown speaker'), findsWidgets);
    expect(find.text('2:05'), findsOneWidget);
    expect(find.text('Combined audio'), findsNothing);
  });
}
