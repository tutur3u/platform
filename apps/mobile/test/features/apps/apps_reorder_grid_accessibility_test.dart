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
  }) async {
    await tester.pumpApp(
      Material(
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
              canReorder: false,
              isOrdering: ordering,
              onOrderingStarted: () {},
              onOrderChanged: (_) {},
              onVisibilityPressed: (_) {},
              onSelected: (_) => launch(),
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
  testWidgets('one named keyboard launch stop supports Enter and Space', (
    tester,
  ) async {
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
    expect(next.getSemanticsData().flagsCollection.isFocused, Tristate.isTrue);
    expect(ring('tasks').top.color.a, 0);
    expect(ring('calendar').top.color.a, greaterThan(0));
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pump();
    expect(launched, 2);
    handle.dispose();
  });
}
