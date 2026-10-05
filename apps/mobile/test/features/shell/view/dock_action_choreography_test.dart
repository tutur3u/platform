import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';

const ValueKey<String> _materialKey = ValueKey(
  'persistent-shell-dock-material',
);
const ValueKey<String> _groupKey = ValueKey('floating-dock-visible-group');
const ValueKey<String> _primaryKey = ValueKey('floating-dock-primary-slot');

class _Fixture {
  final action = ValueNotifier<String?>(null);
  final ValueNotifier<bool> composing = ValueNotifier(false);
  final ValueNotifier<bool> reduced = ValueNotifier(false);
  int taps = 0;

  Future<void> mount(WidgetTester tester, {double width = 400}) async {
    addTearDown(action.dispose);
    addTearDown(composing.dispose);
    addTearDown(reduced.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: ListenableBuilder(
          listenable: Listenable.merge([action, composing, reduced]),
          builder: (context, _) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(disableAnimations: reduced.value),
            child: Center(
              child: SizedBox(
                width: width,
                child: PersistentShellDock(
                  navigationWidth: 180,
                  composing: composing.value,
                  content: SizedBox(
                    height: composing.value ? 78 : 52,
                    child: Text(composing.value ? 'Prompt' : 'Navigation'),
                  ),
                  primary: action.value == null
                      ? null
                      : FilledButton(
                          key: ValueKey(action.value),
                          onPressed: () => taps++,
                          child: Text(action.value!),
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

double _opacity(WidgetTester tester, String label) => tester
    .widget<Opacity>(
      find.ancestor(of: find.text(label), matching: find.byType(Opacity)).first,
    )
    .opacity;

void _centered(WidgetTester tester) {
  expect(
    tester.getCenter(find.byKey(_groupKey)).dx,
    closeTo(tester.getCenter(find.byType(PersistentShellDock)).dx, .01),
  );
  expect(find.byType(BackdropFilter), findsOneWidget);
  expect(tester.takeException(), isNull);
}

void main() {
  testWidgets('entry reserves width before unclipped fade and scale', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final fixture = _Fixture();
    await fixture.mount(tester);
    final centered = tester.getCenter(find.byKey(_materialKey)).dx;
    fixture.action.value = 'Create';
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(tester.getCenter(find.byKey(_materialKey)).dx, lessThan(centered));
    expect(_opacity(tester, 'Create'), 0);
    expect(find.bySemanticsLabel('Create'), findsNothing);
    expect(tester.getSize(find.byKey(_primaryKey)).width, lessThan(60));
    _centered(tester);
    await tester.pump(const Duration(milliseconds: 96));
    expect(tester.getSize(find.byKey(_primaryKey)).width, closeTo(60, .01));
    expect(_opacity(tester, 'Create'), closeTo(0, .001));
    await tester.pump(const Duration(milliseconds: 72));
    expect(_opacity(tester, 'Create'), greaterThan(0));
    expect(_opacity(tester, 'Create'), lessThan(1));
    expect(
      find.ancestor(of: find.text('Create'), matching: find.byType(ClipRect)),
      findsNothing,
    );
    _centered(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create'));
    expect(fixture.taps, 1);
    semantics.dispose();
  });

  testWidgets('exit hides controls before navigation recenters', (
    tester,
  ) async {
    final fixture = _Fixture()..action.value = 'Create';
    await fixture.mount(tester);
    final left = tester.getCenter(find.byKey(_materialKey)).dx;
    fixture.action.value = null;
    await tester.pump();
    await tester.tap(find.text('Create'), warnIfMissed: false);
    expect(fixture.taps, 0);
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.getCenter(find.byKey(_materialKey)).dx, closeTo(left, .01));
    expect(_opacity(tester, 'Create'), lessThan(1));
    expect(tester.getSize(find.byKey(_primaryKey)).width, 60);
    _centered(tester);
    await tester.pump(const Duration(milliseconds: 100));
    expect(_opacity(tester, 'Create'), 0);
    expect(tester.getCenter(find.byKey(_materialKey)).dx, greaterThan(left));
    _centered(tester);
    await tester.pumpAndSettle();
    expect(find.text('Create'), findsNothing);
    expect(find.byKey(_primaryKey), findsNothing);
    expect(
      tester.getCenter(find.byKey(_materialKey)).dx,
      tester.getCenter(find.byKey(_groupKey)).dx,
    );
  });

  testWidgets('interrupting entry and exit continues without geometry jumps', (
    tester,
  ) async {
    final fixture = _Fixture();
    await fixture.mount(tester);
    fixture.action.value = 'Create';
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    final beforeExit = tester.getCenter(find.byKey(_materialKey)).dx;
    fixture.action.value = null;
    await tester.pump();
    expect(tester.getCenter(find.byKey(_materialKey)).dx, beforeExit);
    await tester.pump(const Duration(milliseconds: 60));
    final beforeReentry = tester.getCenter(find.byKey(_materialKey)).dx;
    fixture.action.value = 'Create';
    await tester.pump();
    expect(tester.getCenter(find.byKey(_materialKey)).dx, beforeReentry);
    await tester.pumpAndSettle();
    expect(find.text('Create'), findsOneWidget);
    expect(_opacity(tester, 'Create'), 1);
    _centered(tester);
  });

  testWidgets(
    'replacement never mounts two controls or activates stale action',
    (tester) async {
      final fixture = _Fixture()..action.value = 'Old';
      await fixture.mount(tester);
      fixture.action.value = 'New';
      await tester.pump();
      await tester.tap(find.text('Old'), warnIfMissed: false);
      expect(fixture.taps, 0);
      expect(find.text('New'), findsNothing);
      await tester.pump(const Duration(milliseconds: 360));
      expect(find.text('Old'), findsNothing);
      expect(find.text('New'), findsOneWidget);
      await tester.pumpAndSettle();
      await tester.tap(find.text('New'));
      expect(fixture.taps, 1);
      _centered(tester);
    },
  );

  testWidgets('composer width changes keep one centered material throughout', (
    tester,
  ) async {
    final fixture = _Fixture();
    await fixture.mount(tester, width: 320);
    final element = tester.element(find.byKey(_materialKey));
    fixture.composing.value = true;
    fixture.action.value = 'Menu';
    await tester.pump();
    for (final millis in [60, 100, 100, 100]) {
      await tester.pump(Duration(milliseconds: millis));
      _centered(tester);
      expect(
        identical(tester.element(find.byKey(_materialKey)), element),
        true,
      );
      expect(find.text('Navigation'), findsNothing);
      expect(find.text('Prompt'), findsOneWidget);
    }
    await tester.pumpAndSettle();
    expect(tester.getSize(find.byKey(_materialKey)).width, 260);
  });

  testWidgets(
    'full-width composer follows actual reserved width on entry/exit',
    (tester) async {
      final fixture = _Fixture()..composing.value = true;
      await fixture.mount(tester);
      expect(tester.getSize(find.byKey(_materialKey)).width, 400);
      fixture.action.value = 'Menu';
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(_opacity(tester, 'Menu'), 0);
      expect(tester.getSize(find.byKey(_materialKey)).width, lessThan(400));
      expect(tester.getSize(find.byKey(_materialKey)).width, greaterThan(340));
      _centered(tester);
      await tester.pumpAndSettle();
      expect(tester.getSize(find.byKey(_materialKey)).width, 340);
      fixture.action.value = null;
      await tester.pump();
      for (var i = 0; i < 2; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        expect(tester.getSize(find.byKey(_materialKey)).width, 340);
        expect(_opacity(tester, 'Menu'), lessThan(1));
        _centered(tester);
      }
      await tester.pump(const Duration(milliseconds: 100));
      expect(_opacity(tester, 'Menu'), 0);
      expect(tester.getSize(find.byKey(_materialKey)).width, greaterThan(340));
      expect(
        tester.getSize(find.byKey(_materialKey)).width +
            tester.getSize(find.byKey(_primaryKey)).width,
        closeTo(400, .01),
      );
      _centered(tester);
      await tester.pumpAndSettle();
      expect(tester.getSize(find.byKey(_materialKey)).width, 400);
    },
  );

  testWidgets('narrower viewport removes the unsupported secondary slot', (
    tester,
  ) async {
    final width = ValueNotifier<double>(430);
    addTearDown(width.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: ValueListenableBuilder<double>(
            valueListenable: width,
            builder: (_, value, _) => SizedBox(
              width: value,
              child: const PersistentShellDock(
                content: SizedBox(height: 52, child: Text('Navigation')),
                primary: Icon(Icons.add),
                secondary: Icon(Icons.search),
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.search), findsOneWidget);
    width.value = 320;
    await tester.pump();
    expect(find.byIcon(Icons.search), findsNothing);
    expect(
      find.byKey(const ValueKey('floating-dock-secondary-slot')),
      findsNothing,
    );
    _centered(tester);
    await tester.pumpAndSettle();
  });

  testWidgets(
    'reduced motion settles immediately and excludes hidden semantics',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final fixture = _Fixture()..reduced.value = true;
      await fixture.mount(tester);
      fixture.action.value = 'Create';
      await tester.pump();
      expect(_opacity(tester, 'Create'), 1);
      expect(find.bySemanticsLabel('Create'), findsOneWidget);
      fixture.action.value = null;
      await tester.pump();
      expect(find.bySemanticsLabel('Create'), findsNothing);
      expect(find.byKey(_primaryKey), findsNothing);
      _centered(tester);
      semantics.dispose();
    },
  );
}
