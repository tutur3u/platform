import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character_painter.dart';

import '../../../helpers/pump_app.dart';

/// [sorbetTestApp] turns animations off; this host restores them unless
/// [reduceMotion] is set.
Widget _host(Widget child, {bool reduceMotion = false}) => sorbetTestApp(
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
      child: Scaffold(body: Center(child: child)),
    ),
  ),
);

MiraMotion _motion(WidgetTester tester) =>
    (tester
                .widget<CustomPaint>(
                  find.descendant(
                    of: find.byType(MiraCharacter),
                    matching: find.byType(CustomPaint),
                  ),
                )
                .painter!
            as MiraCharacterPainter)
        .motion;

Future<void> _advance(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 100);
  for (var t = Duration.zero; t < total; t += step) {
    await tester.pump(step);
  }
}

void main() {
  testWidgets('holds a still pose under reduced motion', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter(), reduceMotion: true));
    await tester.pump(const Duration(seconds: 1));
    expect(tester.binding.hasScheduledFrame, isFalse);
    final motion = _motion(tester);
    expect(motion.liveliness, 0);
    expect(motion.spin, 0);
    await tester.tap(find.byType(MiraCharacter));
    await tester.pump();
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(motion.burst, 0);
  });

  testWidgets('idles for a while and then rests', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter()));
    await _advance(tester, const Duration(seconds: 2));
    expect(tester.binding.hasScheduledFrame, isTrue);
    expect(_motion(tester).liveliness, greaterThan(0.5));
    await _advance(
      tester,
      MiraCharacter.idleBudget + const Duration(seconds: 6),
    );
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(_motion(tester).liveliness, 0);
  });

  testWidgets('a tap wakes Mira with a bounce', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter()));
    await _advance(
      tester,
      MiraCharacter.idleBudget + const Duration(seconds: 6),
    );
    expect(tester.binding.hasScheduledFrame, isFalse);
    await tester.tap(find.byType(MiraCharacter));
    await tester.pump();
    expect(_motion(tester).burst, greaterThan(0.9));
    expect(tester.binding.hasScheduledFrame, isTrue);
    await _advance(
      tester,
      MiraCharacter.idleBudget + const Duration(seconds: 6),
    );
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('thinking spins the petals until it stops', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter(thinking: true)));
    await _advance(
      tester,
      MiraCharacter.idleBudget + const Duration(seconds: 4),
    );
    expect(tester.binding.hasScheduledFrame, isTrue);
    final motion = _motion(tester);
    expect(motion.thinking, isTrue);
    final before = motion.spin;
    await tester.pump(const Duration(milliseconds: 50));
    expect(motion.spin, isNot(before));
    await tester.pumpWidget(_host(const MiraCharacter()));
    await _advance(
      tester,
      MiraCharacter.idleBudget + const Duration(seconds: 6),
    );
    expect(tester.binding.hasScheduledFrame, isFalse);
  });
}
