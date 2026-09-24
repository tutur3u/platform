import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/view/meet_room_exit_actions.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets('host exit asks whether to leave or end for everyone', (
    tester,
  ) async {
    MeetExitChoice? selected;
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () async => selected = await showMeetExitChoice(context),
            child: const Text('Open exit choice'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open exit choice'));
    await tester.pumpAndSettle();
    expect(find.text('Leave or end meeting?'), findsOneWidget);
    expect(find.text('Leave call'), findsOneWidget);
    expect(find.text('End for everyone'), findsOneWidget);

    await tester.tap(find.text('Leave call'));
    await tester.pumpAndSettle();
    expect(selected, MeetExitChoice.leave);
  });
}
