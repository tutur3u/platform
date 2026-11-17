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

List<ShellDockEntry> _entries([
  List<String> labels = const ['Home', 'Tasks', 'Calendar', 'Mira', 'Apps'],
]) => [
  for (final label in labels)
    ShellDockEntry(
      key: ValueKey(label),
      label: label,
      glyph: const Icon(Icons.circle_outlined),
    ),
];

const ValueKey<String> _pill = ValueKey('persistent-shell-dock-material');
const ValueKey<String> _highlight = ValueKey('shell-dock-highlight');

Future<void> _pump(
  WidgetTester tester, {
  ShellDockEntry? back,
  bool labelled = true,
  double width = 306,
  SorbetTheme? sorbet,
  List<ShellDockEntry>? entries,
  Key? selectedKey = const ValueKey('Home'),
  ValueChanged<Key?>? onSelected,
  VoidCallback? onBackLongPress,
  bool settle = true,
}) async {
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      home: Align(
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          width: width,
          child: ShellDockBar(
            entries: entries ?? _entries(),
            selectedKey: selectedKey,
            onSelected: onSelected ?? (_) {},
            back: back,
            labelled: labelled,
            onBackLongPress: onBackLongPress,
          ),
        ),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

void main() {
  testWidgets('five labelled slots share a 64dp pill; one highlight marks '
      'the active slot', (tester) async {
    await _pump(tester);
    final pill = tester.getRect(find.byKey(_pill));
    expect(pill.height, ShellDockMetrics.height);
    for (final label in ['Home', 'Tasks', 'Calendar', 'Mira', 'Apps']) {
      expect(find.text(label), findsOneWidget);
      final slot = tester.getSize(find.byKey(ValueKey(label)));
      expect(slot.width, greaterThanOrEqualTo(44));
      expect(slot.height, ShellDockMetrics.slot);
    }
    final home = tester.getSemantics(find.bySemanticsLabel('Home'));
    expect(home.flagsCollection.isSelected, isNot(false));
    expect(
      tester.getRect(find.byKey(_highlight)),
      tester.getRect(find.byKey(const ValueKey('Home'))),
    );
    final style = ShellChromeStyle.of(tester.element(find.byKey(_highlight)));
    final fill = tester.widget<DecoratedBox>(
      find.descendant(
        of: find.byKey(_highlight),
        matching: find.byType(DecoratedBox),
      ),
    );
    expect((fill.decoration as ShapeDecoration).color, style.navSelectedFill);
    expect(find.byKey(const ValueKey('shell-dock-back')), findsNothing);
  });

  testWidgets('Back shows in its reserved zone; the pill never moves', (
    tester,
  ) async {
    Key? selected;
    var longPressed = false;
    await _pump(tester, onSelected: (key) => selected = key);
    final pillAtRest = tester.getRect(find.byKey(_pill));
    final homeAtRest = tester.getRect(find.byKey(const ValueKey('Home')));
    final zone = tester.getRect(
      find.byKey(const ValueKey('shell-dock-back-zone')),
    );
    expect(zone.size, const Size.square(ShellDockMetrics.zone));
    expect(pillAtRest.left - zone.right, ShellDockMetrics.zoneGap);

    await _pump(
      tester,
      back: _back,
      onSelected: (key) => selected = key,
      onBackLongPress: () => longPressed = true,
    );
    expect(tester.getRect(find.byKey(_pill)), pillAtRest);
    expect(tester.getRect(find.byKey(const ValueKey('Home'))), homeAtRest);
    final back = tester.getRect(find.byKey(const ValueKey('shell-dock-back')));
    expect(zone.contains(back.center), isTrue);

    await tester.tap(find.byKey(const ValueKey('shell-dock-back')));
    expect(selected, const ValueKey('back'));
    await tester.longPress(find.byKey(const ValueKey('shell-dock-back')));
    expect(longPressed, isTrue);

    await tester.tap(find.byKey(const ValueKey('Tasks')));
    expect(selected, const ValueKey('Tasks'));
  });

  testWidgets('Back fades out in place and leaves no control behind', (
    tester,
  ) async {
    await _pump(tester, back: _back);
    final pill = tester.getRect(find.byKey(_pill));
    await _pump(tester, settle: false);
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(tester.getRect(find.byKey(_pill)), pill);
    }
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('shell-dock-back')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('unlabelled slots keep labels in semantics; cramped pills '
      'collapse behind More', (tester) async {
    await _pump(tester, labelled: false);
    expect(find.text('Tasks'), findsNothing);
    expect(find.bySemanticsLabel('Tasks'), findsOneWidget);

    // A cramped pill shows fewer, still labelled 44dp slots plus More.
    await _pump(tester, back: _back, width: 240);
    expect(find.byKey(const ValueKey('Calendar')), findsNothing);
    expect(find.byKey(const ValueKey('shell-dock-more')), findsOneWidget);
    for (final slot in ['Home', 'Tasks', 'shell-dock-more']) {
      expect(
        tester.getSize(find.byKey(ValueKey(slot))).width,
        greaterThanOrEqualTo(ShellDockMetrics.minSlotWidth),
      );
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('more than five destinations collapse behind More', (
    tester,
  ) async {
    Key? selected;
    final labels = ['Boards', 'Mine', 'Timeline', 'Inbox', 'Labels', 'Cycles'];
    await _pump(
      tester,
      entries: _entries(labels),
      selectedKey: const ValueKey('Boards'),
      onSelected: (key) => selected = key,
    );
    for (final label in labels.take(4)) {
      expect(find.byKey(ValueKey(label)), findsOneWidget);
    }
    expect(find.byKey(const ValueKey('Labels')), findsNothing);
    final more = find.byKey(const ValueKey('shell-dock-more'));
    expect(more, findsOneWidget);
    expect(tester.getSize(more).width, greaterThanOrEqualTo(44));

    await tester.tap(more);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cycles'));
    await tester.pumpAndSettle();
    expect(selected, const ValueKey('Cycles'));

    // An overflowed destination marks More as the active slot.
    await _pump(
      tester,
      entries: _entries(labels),
      selectedKey: const ValueKey('Cycles'),
    );
    expect(tester.getRect(find.byKey(_highlight)), tester.getRect(more));
    final semantics = tester.getSemantics(more);
    expect(semantics.flagsCollection.isSelected, isNot(false));
  });

  testWidgets('the highlight slides within the base duration and nothing '
      'else moves', (tester) async {
    final selected = ValueNotifier<Key?>(const ValueKey('Home'));
    addTearDown(selected.dispose);
    await tester.pumpWidget(
      sorbetTestApp(
        home: Align(
          alignment: Alignment.bottomCenter,
          child: SizedBox(
            width: 306,
            // The harness disables animations; this test needs them.
            child: Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(context).copyWith(disableAnimations: false),
                child: ValueListenableBuilder<Key?>(
                  valueListenable: selected,
                  builder: (context, key, _) => ShellDockBar(
                    entries: _entries(),
                    selectedKey: key,
                    onSelected: (_) {},
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final pill = tester.getRect(find.byKey(_pill));
    final from = tester.getRect(find.byKey(const ValueKey('Home')));
    final to = tester.getRect(find.byKey(const ValueKey('Calendar')));
    final slots = {
      for (final label in ['Home', 'Tasks', 'Calendar', 'Mira', 'Apps'])
        label: tester.getRect(find.byKey(ValueKey(label))),
    };
    final style = ShellChromeStyle.of(tester.element(find.byKey(_pill)));
    final budget = style.base.inMilliseconds;

    selected.value = const ValueKey('Calendar');
    await tester.pump();
    var frames = 0;
    var midway = false;
    while (tester.binding.hasScheduledFrame) {
      await tester.pump(const Duration(milliseconds: 16));
      frames++;
      final x = tester.getRect(find.byKey(_highlight)).left;
      if (x > from.left && x < to.left) midway = true;
      expect(tester.getRect(find.byKey(_pill)), pill);
      for (final MapEntry(:key, :value) in slots.entries) {
        expect(tester.getRect(find.byKey(ValueKey(key))), value);
      }
      expect(frames, lessThanOrEqualTo(budget ~/ 16 + 2));
    }
    expect(midway, isTrue);
    expect(tester.getRect(find.byKey(_highlight)), to);
  });

  testWidgets('reduced motion moves the highlight at once', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    final selected = ValueNotifier<Key?>(const ValueKey('Home'));
    addTearDown(selected.dispose);
    await tester.pumpWidget(
      sorbetTestApp(
        home: Align(
          alignment: Alignment.bottomCenter,
          child: SizedBox(
            width: 306,
            child: ValueListenableBuilder<Key?>(
              valueListenable: selected,
              builder: (context, key, _) => ShellDockBar(
                entries: _entries(),
                selectedKey: key,
                onSelected: (_) {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    selected.value = const ValueKey('Apps');
    await tester.pump();
    expect(
      tester.getRect(find.byKey(_highlight)),
      tester.getRect(find.byKey(const ValueKey('Apps'))),
    );
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
