import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/view/inbox/recorded_answer.dart';

import '../../../helpers/helpers.dart';

Future<void> _pump(
  WidgetTester tester,
  String answer, {
  double width = 320,
  double scale = 1,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(800, 4000);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpApp(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(scale)),
      child: Align(
        alignment: Alignment.topLeft,
        child: SizedBox(
          width: width - 32,
          child: RecordedAnswer(answer: answer),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('a 150-character answer at 2.0x on 320 can be expanded', (
    tester,
  ) async {
    final answer = List.filled(16, 'abcdefghi').join(' ').substring(0, 150);
    expect(answer.length, 150);
    await _pump(tester, answer, scale: 2);
    expect(find.text('Show full answer'), findsOneWidget);
    expect(
      tester
          .getSize(find.widgetWithText(TextButton, 'Show full answer'))
          .height,
      greaterThanOrEqualTo(44),
    );
    Text body() => tester.widget<Text>(find.textContaining('abcdefghi'));
    expect(body().maxLines, 4);
    await tester.tap(find.text('Show full answer'));
    await tester.pump();
    expect(body().maxLines, isNull);
    expect(find.text('Show less'), findsOneWidget);
    await tester.tap(find.text('Show less'));
    await tester.pump();
    expect(body().maxLines, 4);
  });

  testWidgets('a short answer shows no expander at any scale', (tester) async {
    await _pump(tester, 'Yes');
    expect(find.text('Show full answer'), findsNothing);
    await _pump(tester, 'Yes', scale: 2);
    expect(find.text('Show full answer'), findsNothing);
  });

  testWidgets('several short lines that overflow four lines still expand', (
    tester,
  ) async {
    await _pump(tester, List.filled(8, 'ok').join('\n'));
    expect(find.text('Show full answer'), findsOneWidget);
  });

  testWidgets('a long answer shows the expander at normal text size', (
    tester,
  ) async {
    await _pump(tester, List.filled(100, 'recorded answer').join(' '));
    expect(find.text('Show full answer'), findsOneWidget);
  });
}
