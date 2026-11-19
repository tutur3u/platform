import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/assistant/widgets/assistant_morphing_dock.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_nav_icon.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../helpers/pump_app.dart';

void main() {
  _dockMotionTests();

  for (final width in [320.0, 390.0, 430.0]) {
    for (final safe in [0.0, 34.0]) {
      for (final actionCount in [0, 1]) {
        for (final keyboard in [false, true]) {
          testWidgets('Apps/Assistant width$width safe$safe '
              'actions$actionCount keyboard$keyboard', (tester) async {
            tester.view.physicalSize = Size(width, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            const navKey = ValueKey('navigation');
            Widget navigation() => MorphingNavigationBar(
              key: navKey,
              selectedKey: const ValueKey('tab-0'),
              onSelected: (_) {},
              children: List.generate(
                5,
                (i) => shad.NavigationItem(
                  key: ValueKey('tab-$i'),
                  child: Icon(Icons.home, key: ValueKey('icon-$i')),
                ),
              ),
            );
            Future<void> pump({required bool assistant}) async {
              await tester.pumpWidget(
                MaterialApp(
                  home: shad.Theme(
                    data: const shad.ThemeData(
                      colorScheme: shad.ColorSchemes.lightZinc,
                    ),
                    child: MediaQuery(
                      data: MediaQueryData(
                        size: Size(width, 900),
                        padding: EdgeInsets.only(bottom: keyboard ? 0 : safe),
                        viewInsets: EdgeInsets.only(bottom: keyboard ? 260 : 0),
                      ),
                      child: Scaffold(
                        body: Stack(
                          children: [
                            Positioned(
                              left: floatingDockHorizontalInset,
                              right: floatingDockHorizontalInset,
                              bottom:
                                  (keyboard ? 0 : safe) + floatingDockBottomGap,
                              child: assistant
                                  ? AssistantMorphingDock(
                                      isComposing: false,
                                      navigation: navigation(),
                                      composer: const SizedBox(),
                                      composeLabel: 'Compose',
                                      onCompose: () {},
                                    )
                                  : FloatingDockRail(
                                      navigation: navigation(),
                                      primary: actionCount >= 1
                                          ? const Icon(Icons.add)
                                          : null,
                                    ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
            }

            await pump(assistant: false);
            final apps = tester.getRect(find.byKey(navKey));
            final firstIcon = tester.getRect(
              find.byKey(const ValueKey('icon-0')),
            );
            final appsGroup = tester.getRect(
              find.byKey(const ValueKey('floating-dock-visible-group')),
            );
            expect(appsGroup.center.dx, closeTo(width / 2, 0.01));
            final primary = actionCount == 0
                ? null
                : tester.getRect(
                    find.byKey(const ValueKey('floating-dock-primary-slot')),
                  );
            await pump(assistant: true);
            final assistant = tester.getRect(find.byKey(navKey));
            expect(assistant.bottom, apps.bottom);
            final assistantGroup = tester.getRect(
              find.byKey(const ValueKey('floating-dock-visible-group')),
            );
            expect(assistantGroup.center.dx, closeTo(width / 2, 0.01));
            // Equal visible actions have identical geometry; missing actions
            // must not reserve invisible columns or shift the combined group.
            if (actionCount == 1) {
              expect(assistant, apps);
              expect(
                tester.getRect(find.byKey(const ValueKey('icon-0'))),
                firstIcon,
              );
              expect(
                tester.getRect(
                  find.byKey(const ValueKey('floating-dock-primary-slot')),
                ),
                primary,
              );
            }
            final target = find.byWidgetPredicate(
              (widget) =>
                  widget is PositionedDirectional &&
                  widget.key == const ValueKey('tab-0'),
            );
            expect(tester.getSize(target).width, greaterThanOrEqualTo(44));
            expect(tester.getSize(target).height, greaterThanOrEqualTo(44));
            expect(
              900 - apps.bottom,
              (keyboard ? 260 : safe) + floatingDockBottomGap,
            );
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
  testWidgets('six-item mini-app keeps full rail without empty action slots', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: shad.Theme(
          data: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          child: Scaffold(
            body: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: floatingDockHorizontalInset,
              ),
              child: FloatingDockRail(
                navigation: MorphingNavigationBar(
                  selectedKey: const ValueKey('mini-0'),
                  onSelected: (_) {},
                  children: List.generate(
                    6,
                    (i) => shad.NavigationItem(
                      key: ValueKey('mini-$i'),
                      child: const Icon(Icons.home),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('floating-dock-primary-slot')),
      findsNothing,
    );
    final target = find.byWidgetPredicate(
      (widget) =>
          widget is PositionedDirectional &&
          widget.key == const ValueKey('mini-0'),
    );
    expect(tester.getSize(target).width, greaterThanOrEqualTo(44));
    expect(tester.getSize(target).height, greaterThanOrEqualTo(44));
    expect(tester.takeException(), isNull);
  });
}

shad.NavigationItem _item(
  String label,
  IconData icon, {
  bool dropdown = false,
  bool enabled = true,
}) => shad.NavigationItem(
  key: ValueKey(label),
  enabled: enabled,
  child: ShellDockNavIcon(icon: icon, label: label, dropdown: dropdown),
);

ShellDockEntry _entry(String label, [IconData icon = Icons.circle_outlined]) =>
    ShellDockEntry(
      key: ValueKey(label),
      label: label,
      glyph: Icon(icon),
      glyphId: icon,
    );

Future<void> _pumpBar(
  WidgetTester tester,
  Widget bar, {
  bool reduceMotion = false,
}) => tester.pumpWidget(
  sorbetTestApp(
    home: MediaQuery(
      data: MediaQueryData(
        size: const Size(390, 844),
        disableAnimations: reduceMotion,
      ),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: SizedBox(width: 366, child: bar),
      ),
    ),
  ),
);

Widget _navigation(List<shad.NavigationItem> children) => MorphingNavigationBar(
  fixedFrame: true,
  selectedKey: children.first.key,
  onSelected: (_) {},
  children: children,
);

Widget _dock(List<ShellDockEntry> entries) => ShellDockBar(
  entries: entries,
  selectedKey: entries.first.key,
  onSelected: (_) {},
);

Finder _slot(String label) =>
    find.byKey(ValueKey<(String, Key)>(('shell-dock-slot', ValueKey(label))));

Finder _leaving(String label) => find.byKey(
  ValueKey<(String, Key)>(('shell-dock-leaving-slot', ValueKey(label))),
);

double _opacity(WidgetTester tester, Finder slot) => tester
    .widget<Opacity>(
      find.descendant(of: slot, matching: find.byType(Opacity)).first,
    )
    .opacity;

void _dockMotionTests() {
  group('menu destinations', () {
    testWidgets('show only their glyph and keep their accessible name', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await _pumpBar(
        tester,
        _navigation([
          _item('Inbox', Icons.inbox_outlined, dropdown: true),
          _item('phucvo@example.com', Icons.alternate_email, dropdown: true),
          _item('Labels', Icons.filter_alt_outlined, dropdown: true),
        ]),
      );
      await tester.pumpAndSettle();
      for (final label in ['Inbox', 'phucvo@example.com', 'Labels']) {
        expect(find.text(label), findsNothing, reason: label);
        expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
        expect(find.byTooltip(label), findsOneWidget, reason: label);
        // With no labelled slot beside them, glyphs centre in the slot.
        final glyph = tester.getCenter(
          find.descendant(of: _slot(label), matching: find.byType(Icon)).first,
        );
        expect(glyph.dy, closeTo(tester.getCenter(_slot(label)).dy, 0.5));
      }
      semantics.dispose();
    });

    testWidgets('beside labelled slots keep their glyph on the same line', (
      tester,
    ) async {
      await _pumpBar(
        tester,
        _navigation([
          _item('Workspace', Icons.business),
          _item('Personal', Icons.person_outline),
          _item('Filters', Icons.filter_list, dropdown: true),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Workspace'), findsOneWidget);
      expect(find.text('Personal'), findsOneWidget);
      // The menu's label only holds the text line's room; it never shows.
      expect(
        tester
            .widget<Visibility>(
              find.ancestor(
                of: find.text('Filters'),
                matching: find.byType(Visibility),
              ),
            )
            .visible,
        isFalse,
      );
      double glyphTop(String label, IconData icon) => tester
          .getTopLeft(
            find.descendant(of: _slot(label), matching: find.byIcon(icon)),
          )
          .dy;
      expect(
        glyphTop('Filters', Icons.filter_list),
        closeTo(glyphTop('Workspace', Icons.business), 1),
      );
    });
  });

  group('content identity', () {
    test('ignores callbacks and the selection', () {
      Object? identity(Key selected, {String label = 'Kanban'}) =>
          MorphingNavigationBar(
            fixedFrame: true,
            selectedKey: selected,
            onSelected: (_) {},
            children: [
              _item('Tasks', Icons.check),
              _item(label, Icons.view_kanban_outlined),
            ],
          ).contentIdentity;
      expect(
        identity(const ValueKey('Tasks')),
        identity(const ValueKey('Kanban')),
      );
      expect(identity(const ValueKey('Tasks')), isNotNull);
      expect(
        identity(const ValueKey('Tasks')),
        isNot(identity(const ValueKey('Tasks'), label: 'Board')),
      );
    });

    test('changes with a glyph, enabled state or presentation', () {
      Object? identity(shad.NavigationItem item) => MorphingNavigationBar(
        fixedFrame: true,
        selectedKey: null,
        onSelected: (_) {},
        children: [item],
      ).contentIdentity;
      final base = identity(_item('Mail', Icons.inbox_outlined));
      expect(identity(_item('Mail', Icons.inbox_outlined)), base);
      expect(identity(_item('Mail', Icons.star_outline)), isNot(base));
      expect(
        identity(_item('Mail', Icons.inbox_outlined, enabled: false)),
        isNot(base),
      );
      expect(
        identity(_item('Mail', Icons.inbox_outlined, dropdown: true)),
        isNot(base),
      );
      expect(
        identity(
          const shad.NavigationItem(
            key: ValueKey('raw'),
            child: Icon(Icons.abc),
          ),
        ),
        isNull,
      );
    });
  });

  group('slot motion', () {
    testWidgets('equal entries rebuild without a new element or animation', (
      tester,
    ) async {
      await _pumpBar(tester, _dock([_entry('Tasks'), _entry('Kanban')]));
      await tester.pumpAndSettle();
      final element = tester.element(_slot('Kanban'));
      final rect = tester.getRect(_slot('Kanban'));
      await _pumpBar(tester, _dock([_entry('Tasks'), _entry('Kanban')]));
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.element(_slot('Kanban')), same(element));
      expect(tester.getRect(_slot('Kanban')), rect);
    });

    testWidgets('a new slot fades in while the others slide aside', (
      tester,
    ) async {
      await _pumpBar(tester, _dock([_entry('Tasks'), _entry('Kanban')]));
      await tester.pumpAndSettle();
      final kanban = tester.element(_slot('Kanban'));
      final from = tester.getRect(_slot('Kanban'));
      await _pumpBar(
        tester,
        _dock([_entry('Tasks'), _entry('Kanban'), _entry('Timeline')]),
      );
      await tester.pump(const Duration(milliseconds: 60));
      final mid = tester.getRect(_slot('Kanban'));
      expect(mid.width, lessThan(from.width));
      expect(_opacity(tester, _slot('Timeline')), inExclusiveRange(0, 1));
      await tester.pumpAndSettle();
      expect(tester.element(_slot('Kanban')), same(kanban));
      expect(tester.getRect(_slot('Kanban')).width, lessThan(mid.width));
      expect(_opacity(tester, _slot('Timeline')), 1);
    });

    testWidgets('a removed slot fades out where it was', (tester) async {
      await _pumpBar(
        tester,
        _dock([_entry('Tasks'), _entry('Kanban'), _entry('Settings')]),
      );
      await tester.pumpAndSettle();
      final rect = tester.getRect(_slot('Settings'));
      await _pumpBar(tester, _dock([_entry('Tasks'), _entry('Kanban')]));
      await tester.pump(const Duration(milliseconds: 60));
      expect(tester.getRect(_leaving('Settings')), rect);
      expect(_opacity(tester, _leaving('Settings')), inExclusiveRange(0, 1));
      await tester.pumpAndSettle();
      expect(_leaving('Settings'), findsNothing);
      expect(find.byKey(const ValueKey('Settings')), findsNothing);
    });

    testWidgets('a new glyph cross-fades in place', (tester) async {
      await _pumpBar(
        tester,
        _dock([_entry('Tasks'), _entry('Inbox', Icons.inbox_outlined)]),
      );
      await tester.pumpAndSettle();
      final element = tester.element(_slot('Inbox'));
      await _pumpBar(
        tester,
        _dock([_entry('Tasks'), _entry('Inbox', Icons.star_outline)]),
      );
      await tester.pump(const Duration(milliseconds: 60));
      expect(find.byIcon(Icons.inbox_outlined), findsOneWidget);
      expect(find.byIcon(Icons.star_outline), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.inbox_outlined), findsNothing);
      expect(tester.element(_slot('Inbox')), same(element));
    });

    testWidgets('reduced motion reaches the end state with no tween', (
      tester,
    ) async {
      final before = [
        _entry('Tasks'),
        _entry('Inbox', Icons.inbox_outlined),
        _entry('Settings'),
      ];
      final after = [
        _entry('Tasks'),
        _entry('Inbox', Icons.star_outline),
        _entry('Timeline'),
      ];
      Map<String, Rect> slots() => {
        for (final label in ['Tasks', 'Inbox', 'Timeline'])
          label: tester.getRect(_slot(label)),
      };
      // The animated run's settled state is the end state to match.
      await _pumpBar(tester, _dock(before));
      await tester.pumpAndSettle();
      await _pumpBar(tester, _dock(after));
      await tester.pumpAndSettle();
      final end = slots();

      await _pumpBar(tester, _dock(before), reduceMotion: true);
      await tester.pumpAndSettle();
      await _pumpBar(tester, _dock(after), reduceMotion: true);
      expect(tester.binding.transientCallbackCount, 0);
      expect(slots(), end);
      expect(_opacity(tester, _slot('Timeline')), 1);
      expect(_leaving('Settings'), findsNothing);
      expect(find.byKey(const ValueKey('Settings')), findsNothing);
      expect(find.byIcon(Icons.inbox_outlined), findsNothing);
      expect(find.byIcon(Icons.star_outline), findsOneWidget);
      expect(find.bySemanticsLabel('Timeline'), findsOneWidget);
      await tester.pump();
      expect(tester.binding.transientCallbackCount, 0);
      expect(slots(), end);
    });
  });

  group('Back', () {
    const back = ValueKey('back');
    const centre = ValueKey('centre');
    Widget rail({required bool showBack}) => FloatingDockRail(
      fixedZones: true,
      leading: showBack
          ? const SizedBox.square(key: back, dimension: ShellDockMetrics.slot)
          : null,
      navigation: const SizedBox(key: centre, height: ShellDockMetrics.height),
    );

    double backOpacity(WidgetTester tester) => tester
        .widget<Opacity>(
          find.ancestor(of: find.byKey(back), matching: find.byType(Opacity)),
        )
        .opacity;

    testWidgets('fades and scales in and out without moving the centre bar', (
      tester,
    ) async {
      await _pumpBar(tester, rail(showBack: false));
      await tester.pumpAndSettle();
      final bar = tester.getRect(find.byKey(centre));
      await _pumpBar(tester, rail(showBack: true));
      await tester.pump(const Duration(milliseconds: 60));
      expect(backOpacity(tester), inExclusiveRange(0, 1));
      expect(tester.getRect(find.byKey(centre)), bar);
      await tester.pumpAndSettle();
      expect(backOpacity(tester), 1);
      expect(tester.getRect(find.byKey(centre)), bar);
      await _pumpBar(tester, rail(showBack: false));
      await tester.pump(const Duration(milliseconds: 60));
      expect(backOpacity(tester), inExclusiveRange(0, 1));
      expect(tester.getRect(find.byKey(centre)), bar);
      await tester.pumpAndSettle();
      expect(find.byKey(back), findsNothing);
      expect(tester.getRect(find.byKey(centre)), bar);
    });

    testWidgets('reduced motion shows and hides it with no tween', (
      tester,
    ) async {
      await _pumpBar(tester, rail(showBack: true));
      await tester.pumpAndSettle();
      final end = tester.getRect(find.byKey(back));
      final bar = tester.getRect(find.byKey(centre));

      await _pumpBar(tester, rail(showBack: false), reduceMotion: true);
      await tester.pumpAndSettle();
      await _pumpBar(tester, rail(showBack: true), reduceMotion: true);
      expect(tester.binding.transientCallbackCount, 0);
      expect(backOpacity(tester), 1);
      expect(tester.getRect(find.byKey(back)), end);
      expect(tester.getRect(find.byKey(centre)), bar);
      await _pumpBar(tester, rail(showBack: false), reduceMotion: true);
      expect(tester.binding.transientCallbackCount, 0);
      expect(find.byKey(back), findsNothing);
      expect(tester.getRect(find.byKey(centre)), bar);
    });
  });
}
