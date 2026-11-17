import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

import '../helpers/pump_app.dart';

const ValueKey<String> _composite = ValueKey(
  'floating-shell-composite-separator',
);

AnimatedContainer _header(WidgetTester tester) =>
    tester.widget(find.byKey(const ValueKey('floating-shell-header-surface')));

/// Whether the header draws its own bottom hairline.
bool _headerHairline(WidgetTester tester) {
  final border =
      (_header(tester).foregroundDecoration! as BoxDecoration).border!
          as Border;
  return border.bottom.color.a > 0;
}

/// Whether the header casts any shadow.
bool _headerShadow(WidgetTester tester) {
  final decoration = _header(tester).decoration as BoxDecoration?;
  return decoration?.boxShadow?.isNotEmpty ?? false;
}

ScrollPosition _position(WidgetTester tester) => tester
    .state<ScrollableState>(
      find.descendant(
        of: find.byType(ListView),
        matching: find.byType(Scrollable),
      ),
    )
    .position;

Future<void> _mount(
  WidgetTester tester, {
  required SorbetTheme? sorbet,
  required bool strip,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  final list = ListView.builder(
    itemCount: 60,
    itemBuilder: (context, index) =>
        SizedBox(height: 60, child: Text('$index')),
  );
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      brightness: Brightness.dark,
      home: Material(
        child: FloatingShellDock(
          location: '/calendar',
          bottomInset: 68,
          header: const SizedBox(height: 46, child: Text('Agenda')),
          navigation: const SizedBox(width: 160, height: 60),
          child: strip
              ? Column(
                  children: [
                    const SizedBox(
                      key: Key('week-strip'),
                      height: 96,
                      child: Text('M T W T F S S'),
                    ),
                    Expanded(child: list),
                  ],
                )
              : list,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    testWidgets('$design header with a page strip draws one hairline under '
        'the strip and no shadow', (tester) async {
      await _mount(tester, sorbet: sorbet, strip: true);
      expect(find.byKey(_composite), findsNothing);
      expect(_headerHairline(tester), isFalse);
      expect(_headerShadow(tester), isFalse);

      _position(tester).jumpTo(600);
      await tester.pumpAndSettle();
      expect(find.byKey(_composite), findsOneWidget);
      expect(
        tester.getRect(find.byKey(_composite)).bottom,
        closeTo(
          tester.getRect(find.byKey(const Key('week-strip'))).bottom,
          0.01,
        ),
      );
      // Never between the title and the strip.
      expect(_headerHairline(tester), isFalse);
      expect(_headerShadow(tester), isFalse);

      _position(tester).jumpTo(0);
      await tester.pumpAndSettle();
      expect(find.byKey(_composite), findsNothing);
      expect(_headerHairline(tester), isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$design plain header shows only a hairline once content '
        'scrolls under it', (tester) async {
      await _mount(tester, sorbet: sorbet, strip: false);
      expect(_headerHairline(tester), isFalse);
      _position(tester).jumpTo(600);
      await tester.pumpAndSettle();
      expect(_headerHairline(tester), isTrue);
      expect(_headerShadow(tester), isFalse);
      expect(find.byKey(_composite), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
