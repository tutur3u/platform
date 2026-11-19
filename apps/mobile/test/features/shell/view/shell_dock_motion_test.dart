import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_nav_icon.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/pump_app.dart';

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

void main() {
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
