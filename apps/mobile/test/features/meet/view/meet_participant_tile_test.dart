import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/view/meet_participant_tile.dart';

void main() {
  testWidgets(
    'shows a raised hand and recent reaction over participant media',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 240,
              height: 180,
              child: MeetParticipantTile(
                name: 'Taylor',
                microphoneOn: true,
                handRaised: true,
                reaction: 'clap',
              ),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.back_hand), findsOneWidget);
      expect(find.byIcon(Icons.front_hand), findsOneWidget);
      expect(find.text('Taylor'), findsOneWidget);
    },
  );
}
