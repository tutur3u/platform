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
  testWidgets('reduced motion keeps a minimal breathing loop', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter(), reduceMotion: true));
    final motion = _motion(tester);
    final before = motion.time;
    await tester.pump(const Duration(milliseconds: 500));
    expect(motion.time, greaterThan(before));
    expect(motion.liveliness, greaterThan(0));
    expect(motion.liveliness, lessThan(0.25));
    await tester.tap(find.byType(MiraCharacter));
    await tester.pump();
    expect(motion.burst, 0);
  });

  testWidgets('Mira keeps animating after 14 seconds', (tester) async {
    await tester.pumpWidget(_host(const MiraCharacter()));
    await _advance(tester, const Duration(seconds: 14));
    final motion = _motion(tester);
    final before = motion.time;
    await tester.pump(const Duration(milliseconds: 16));
    expect(tester.binding.hasScheduledFrame, isTrue);
    expect(motion.time, greaterThan(before));
  });

  testWidgets('a tap adds a bounce without interrupting idle motion', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const MiraCharacter()));
    await tester.tap(find.byType(MiraCharacter));
    await tester.pump();
    final motion = _motion(tester);
    expect(motion.burst, greaterThan(0.9));
    await _advance(tester, const Duration(seconds: 2));
    expect(motion.burst, 0);
    expect(tester.binding.hasScheduledFrame, isTrue);
  });

  testWidgets('thinking animates the petals and returns to idle', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const MiraCharacter(thinking: true)));
    await _advance(tester, const Duration(seconds: 2));
    final motion = _motion(tester);
    expect(motion.thinking, isTrue);
    final before = motion.spin;
    await tester.pump(const Duration(milliseconds: 50));
    expect(motion.spin, isNot(before));
    await tester.pumpWidget(_host(const MiraCharacter()));
    await tester.pump(const Duration(milliseconds: 16));
    expect(motion.thinking, isFalse);
    expect(tester.binding.hasScheduledFrame, isTrue);
  });

  testWidgets('listening brightens the pose without spinning the petals', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const MiraCharacter(listening: true)));
    await _advance(tester, const Duration(seconds: 1));
    final motion = _motion(tester);
    expect(motion.listening, isTrue);
    expect(motion.attention, greaterThan(0.5));
    expect(motion.spin, 0);
  });

  testWidgets('an offstage ticker scope pauses the reduced loop', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const TickerMode(enabled: false, child: MiraCharacter()),
        reduceMotion: true,
      ),
    );
    final motion = _motion(tester);
    final before = motion.time;
    await tester.pump(const Duration(seconds: 1));
    expect(motion.time, before);
  });
}
