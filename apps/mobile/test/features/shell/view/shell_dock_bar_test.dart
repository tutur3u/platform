import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';

import '../../../helpers/pump_app.dart';

const _back = ShellDockEntry(
  key: ValueKey('back'),
  label: 'Back',
  glyph: Icon(Icons.chevron_left),
);

List<ShellDockEntry> _entries() => [
  for (final label in ['Home', 'Tasks', 'Calendar', 'Mira', 'Apps'])
    ShellDockEntry(
      key: ValueKey(label),
      label: label,
      glyph: const Icon(Icons.circle_outlined),
    ),
];

Future<void> _pump(
  WidgetTester tester, {
  ShellDockEntry? back,
  bool labelled = true,
  double width = 366,
  SorbetTheme? sorbet,
  ValueChanged<Key?>? onSelected,
  VoidCallback? onBackLongPress,
}) async {
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      home: Align(
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          width: width,
          child: ShellDockSurface(
            child: ShellDockBar(
              entries: _entries(),
              selectedKey: back == null ? const ValueKey('Home') : null,
              onSelected: onSelected ?? (_) {},
              back: back,
              labelled: labelled,
              onBackLongPress: onBackLongPress,
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('five labelled slots share a 64dp pill; the active one fills', (
    tester,
  ) async {
    await _pump(tester);
    final pill = tester.getRect(find.byType(ShellDockSurface));
    expect(pill.height, ShellDockMetrics.height);
    for (final label in ['Home', 'Tasks', 'Calendar', 'Mira', 'Apps']) {
      expect(find.text(label), findsOneWidget);
      final slot = tester.getSize(find.byKey(ValueKey(label)));
      expect(slot.width, greaterThanOrEqualTo(44));
      expect(slot.height, ShellDockMetrics.slot);
    }
    final home = tester.getSemantics(find.bySemanticsLabel('Home'));
    expect(home.flagsCollection.isSelected, isNot(false));
    final style = ShellChromeStyle.of(
      tester.element(find.byKey(const ValueKey('Home'))),
    );
    final fills = tester
        .widgetList<AnimatedContainer>(
          find.descendant(
            of: find.byKey(const ValueKey('Home')),
            matching: find.byType(AnimatedContainer),
          ),
        )
        .map((box) => (box.decoration! as ShapeDecoration).color);
    expect(fills, contains(style.navSelectedFill));
    expect(find.byKey(const ValueKey('shell-dock-back')), findsNothing);
  });

  testWidgets('Back leads without moving or resizing the frame', (
    tester,
  ) async {
    Key? selected;
    var longPressed = false;
    await _pump(tester, onSelected: (key) => selected = key);
    final rest = tester.getRect(find.byKey(const ValueKey('shell-dock-bar')));
    final homeAtRest = tester.getSize(find.byKey(const ValueKey('Home')));

    await _pump(
      tester,
      back: _back,
      onSelected: (key) => selected = key,
      onBackLongPress: () => longPressed = true,
    );
    expect(tester.getRect(find.byKey(const ValueKey('shell-dock-bar'))), rest);
    final back = tester.getSize(find.byKey(const ValueKey('shell-dock-back')));
    expect(back, const Size.square(ShellDockMetrics.slot));
    expect(
      tester.getSize(find.byKey(const ValueKey('Home'))).width,
      lessThan(homeAtRest.width),
    );

    await tester.tap(find.byKey(const ValueKey('shell-dock-back')));
    expect(selected, const ValueKey('back'));
    await tester.longPress(find.byKey(const ValueKey('shell-dock-back')));
    expect(longPressed, isTrue);

    await tester.tap(find.byKey(const ValueKey('Tasks')));
    expect(selected, const ValueKey('Tasks'));
  });

  testWidgets('Back eases out and leaves no control behind', (tester) async {
    await _pump(tester, back: _back);
    await _pump(tester);
    expect(find.byKey(const ValueKey('shell-dock-back')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('module sections and cramped slots keep labels in semantics', (
    tester,
  ) async {
    await _pump(tester, labelled: false);
    expect(find.text('Tasks'), findsNothing);
    expect(find.bySemanticsLabel('Tasks'), findsOneWidget);

    await _pump(tester, back: _back, width: 240);
    expect(find.text('Tasks'), findsNothing);
    expect(find.bySemanticsLabel('Tasks'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('classic outlines the pill; Sorbet casts the dock shadow', (
    tester,
  ) async {
    await _pump(tester);
    var style = ShellChromeStyle.of(tester.element(find.byType(ShellDockBar)));
    expect(style.floatingShadow, isEmpty);
    expect(style.floatingOutline, style.border);
    expect(find.byType(BackdropFilter), findsNothing);

    await _pump(tester, sorbet: const SorbetTheme());
    final context = tester.element(find.byType(ShellDockBar));
    style = ShellChromeStyle.of(context);
    final tokens = SorbetTokens.maybeOf(context)!;
    expect(style.floatingShadow, isNotEmpty);
    expect(style.dockSurface, tokens.dockSurface);
    expect(style.navSelectedFill, tokens.navSelectedFill);
    expect(style.navSelectedInk, tokens.navSelectedInk);
    expect(
      style.floatingOutline,
      style.foreground.withValues(alpha: ShellDockMetrics.dockHairlineOpacity),
    );
    // The pill is solid: no blur and an opaque dock surface.
    expect(find.byType(BackdropFilter), findsNothing);
    final fill = tester.widget<Container>(
      find
          .descendant(
            of: find.byType(ShellDockSurface),
            matching: find.byType(Container),
          )
          .first,
    );
    expect((fill.decoration! as BoxDecoration).color, tokens.dockSurface);
  });

  test('dock metrics come from the token contract', () {
    const metrics = SorbetMetrics();
    expect(ShellDockMetrics.height, metrics.dockHeight);
    expect(ShellDockMetrics.inset, metrics.dockInset);
    expect(ShellDockMetrics.dockMaxWidth, 480);
    expect(ShellDockMetrics.dockFadeHeight, 12);
    expect(ShellDockMetrics.dockHairlineOpacity, 0.05);
    expect(ShellDockMetrics.dockBlur, 0);
    expect(ShellDockMetrics.tabletBreakpoint, 768);
    expect(ShellDockMetrics.tabletGutter, 24);
  });

  testWidgets('top bar buttons keep a 44dp target and show the unread dot', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      sorbetTestApp(
        home: Center(
          child: ShellTopBarButton(
            icon: const Icon(Icons.notifications_none),
            tooltip: 'Notifications',
            badge: const ShellUnreadDot(),
            onPressed: () => taps++,
          ),
        ),
      ),
    );
    expect(
      tester.getSize(find.byType(ShellTopBarButton)),
      const Size.square(44),
    );
    expect(
      tester.getSize(find.byKey(const ValueKey('notifications-unread-badge'))),
      const Size.square(12),
    );
    await tester.tap(find.byType(ShellTopBarButton));
    expect(taps, 1);
  });

  test('dock clearance is the pill plus both insets above the safe area', () {
    expect(ShellDockMetrics.clearance, 88);
    expect(ShellDockMetrics.clearanceFor(0), 88);
    // Over a home indicator the pill tucks into the safe area: it rests
    // 26dp above the screen edge and content reserves 102dp in total.
    expect(ShellDockMetrics.bottomOffset(0), ShellDockMetrics.inset);
    expect(ShellDockMetrics.bottomOffset(34), 26);
    expect(ShellDockMetrics.clearanceFor(34) + 34, 102);
    // A thin gesture-bar inset never brings the pill closer than the inset.
    expect(ShellDockMetrics.bottomOffset(16), ShellDockMetrics.inset);
    expect(ShellDockMetrics.widthFor(390), 366);
    // Below the tablet breakpoint the pill spans the width; from it on, the
    // pill is centred and capped.
    expect(ShellDockMetrics.widthFor(700), 676);
    expect(ShellDockMetrics.widthFor(834), ShellDockMetrics.dockMaxWidth);
  });

  testWidgets('contentBottomClearance reads the shell-published padding', (
    tester,
  ) async {
    late double inside;
    late double computed;
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(padding: EdgeInsets.only(bottom: 102)),
        child: Builder(
          builder: (context) {
            inside = AppPageInsets.contentBottomClearance(context);
            computed = AppPageInsets.contentBottomClearance(
              context,
              safeBottom: 34,
            );
            return const SizedBox();
          },
        ),
      ),
    );
    expect(inside, 102);
    expect(computed, 102);
  });
}
