import 'dart:ui' show SemanticsActionEvent, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/widgets/apps_reorder_grid.dart';

import '../../helpers/helpers.dart';

void main() {
  final module = AppModule(
    id: 'tasks',
    route: '/tasks',
    icon: Icons.task_alt,
    labelBuilder: (_) => 'Tasks',
    pageBuilder: (_) => const SizedBox(),
    miniAppNavItems: const [],
  );
  Future<void> mount(
    WidgetTester tester,
    VoidCallback launch, {
    bool ordering = false,
    bool twoModules = false,
    bool canReorder = false,
  }) async {
    var activeOrdering = ordering;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: Material(
            child: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                width: twoModules ? 192 : 96,
                child: AppsReorderGrid(
                  modules: [
                    module,
                    if (twoModules)
                      AppModule(
                        id: 'calendar',
                        route: '/calendar',
                        icon: Icons.calendar_today,
                        labelBuilder: (_) => 'Calendar',
                        pageBuilder: (_) => const SizedBox(),
                        miniAppNavItems: const [],
                      ),
                  ],
                  hidden: false,
                  canReorder: canReorder,
                  isOrdering: activeOrdering,
                  onOrderingStarted: () =>
                      setState(() => activeOrdering = true),
                  onOrderChanged: (_) {},
                  onVisibilityPressed: (_) {},
                  onSelected: (_) => launch(),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final ordering in [false, true]) {
    testWidgets('icon and label share accessible launch in reorder $ordering', (
      tester,
    ) async {
      var launched = 0;
      final handle = tester.ensureSemantics();
      await mount(tester, () => launched++, ordering: ordering);
      final icon = tester.getSemantics(find.byIcon(Icons.task_alt));
      final label = tester.getSemantics(find.text('Tasks'));
      expect(icon.id, label.id);
      expect(icon.label, 'Tasks');
      expect(icon.getSemanticsData().flagsCollection.isButton, isTrue);
      expect(icon.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      expect(icon.rect.width, greaterThanOrEqualTo(64));
      expect(icon.rect.height, greaterThanOrEqualTo(64));
      tester.binding.performSemanticsAction(
        SemanticsActionEvent(
          viewId: tester.view.viewId,
          nodeId: icon.id,
          type: SemanticsAction.tap,
        ),
      );
      await tester.pump();
      expect(launched, 1);
      if (ordering) {
        final hide = tester.getSemantics(find.byTooltip('Hide app'));
        expect(hide.id, isNot(icon.id));
        expect(hide.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      }
      handle.dispose();
    });
  }
  testWidgets(
    'one named keyboard launch stop supports Enter, Space and numpad Enter',
    (tester) async {
      var launched = 0;
      final handle = tester.ensureSemantics();
      await mount(tester, () => launched++, twoModules: true);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final launch = tester.getSemantics(find.text('Tasks'));
      expect(
        launch.getSemanticsData().flagsCollection.isFocused,
        Tristate.isTrue,
      );
      Border ring(String id) =>
          (tester
                          .widget<DecoratedBox>(
                            find.byKey(ValueKey('apps-grid-focus-$id')),
                          )
                          .decoration
                      as BoxDecoration)
                  .border!
              as Border;
      expect(ring('tasks').top.color.a, greaterThan(0));
      expect(ring('calendar').top.color.a, 0);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump();
      expect(launched, 1);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final next = tester.getSemantics(find.text('Calendar'));
      expect(
        next.getSemanticsData().flagsCollection.isFocused,
        Tristate.isTrue,
      );
      expect(ring('tasks').top.color.a, 0);
      expect(ring('calendar').top.color.a, greaterThan(0));
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      await tester.pump();
      expect(launched, 2);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      await tester.pump();
      expect(
        tester
            .getSemantics(find.text('Tasks'))
            .getSemanticsData()
            .flagsCollection
            .isFocused,
        Tristate.isTrue,
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.numpadEnter);
      await tester.pump();
      expect(launched, 3);
      handle.dispose();
    },
  );
  testWidgets('real reorder drag keeps one named launch target '
      'and visible keyboard focus', (tester) async {
    var launched = 0;
    final handle = tester.ensureSemantics();
    await mount(tester, () => launched++, canReorder: true);
    await tester.longPress(find.text('Tasks'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Hide app'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final target = tester.getSemantics(find.text('Tasks'));
    expect(target.label, 'Tasks');
    expect(
      target.getSemanticsData().flagsCollection.isFocused,
      Tristate.isTrue,
    );
    final decoration =
        tester
                .widget<DecoratedBox>(
                  find.byKey(const ValueKey('apps-grid-focus-tasks')),
                )
                .decoration
            as BoxDecoration;
    expect((decoration.border! as Border).top.color.a, greaterThan(0));
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(launched, 1);
    final gesture = await tester.startGesture(
      tester.getCenter(find.text('Tasks')),
    );
    await tester.pump(const Duration(milliseconds: 350));
    await gesture.moveBy(const Offset(12, 12));
    await tester.pump();
    expect(find.text('Tasks'), findsNWidgets(2));
    // Flutter excludes feedback from semantics: only the retained grid target
    // is announced. Visible feedback has no duplicate launch action.
    expect(find.bySemanticsLabel('Tasks'), findsOneWidget);
    final retained = tester.getSemantics(find.bySemanticsLabel('Tasks'));
    expect(retained.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
    expect(retained.rect.width, greaterThanOrEqualTo(64));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(find.text('Tasks'), findsOneWidget);
    expect(tester.takeException(), isNull);
    handle.dispose();
  });
}
