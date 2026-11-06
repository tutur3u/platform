import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../helpers/helpers.dart';

class _Calls {
  final List<String> log = [];
}

Future<_Calls> _pumpRow(
  WidgetTester tester, {
  bool enabled = true,
  TextDirection direction = TextDirection.ltr,
  double width = 360,
}) async {
  tester.view
    ..physicalSize = Size(width, 640)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final calls = _Calls();
  await tester.pumpApp(
    Directionality(
      textDirection: direction,
      child: Align(
        alignment: Alignment.topCenter,
        child: AppSwipeActions(
          enabled: enabled,
          leading: AppSwipeAction(
            label: 'Complete',
            icon: LucideIcons.circleCheck,
            tone: AppTone.success,
            onPressed: () => calls.log.add('complete'),
          ),
          trailing: [
            AppSwipeAction(
              label: 'Schedule',
              icon: LucideIcons.calendarClock,
              onPressed: () => calls.log.add('schedule'),
            ),
            AppSwipeAction(
              label: 'Delete',
              icon: LucideIcons.trash2,
              tone: AppTone.destructive,
              onPressed: () => calls.log.add('delete'),
            ),
          ],
          child: GestureDetector(
            onTap: () => calls.log.add('tap'),
            child: const SizedBox(
              height: 64,
              width: double.infinity,
              child: ColoredBox(
                color: Color(0x00000000),
                child: Text('Row title'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return calls;
}

void main() {
  testWidgets('a long swipe toward the end edge commits the leading action', (
    tester,
  ) async {
    final calls = await _pumpRow(tester);

    await tester.drag(find.text('Row title'), const Offset(220, 0));
    await tester.pumpAndSettle();

    expect(calls.log, ['complete']);
    // The row settles back so list state owns what happens next.
    expect(tester.getTopLeft(find.text('Row title')).dx, 0);
  });

  testWidgets('a short swipe toward the end edge does not commit', (
    tester,
  ) async {
    final calls = await _pumpRow(tester);

    await tester.timedDrag(
      find.text('Row title'),
      const Offset(60, 0),
      const Duration(milliseconds: 600),
    );
    await tester.pumpAndSettle();

    expect(calls.log, isEmpty);
  });

  testWidgets('a fast flick shorter than the fling minimum does not commit', (
    tester,
  ) async {
    final calls = await _pumpRow(tester);

    // 40dp is below 15% of the 360dp row, however fast the flick.
    await tester.fling(find.text('Row title'), const Offset(40, 0), 3000);
    await tester.pumpAndSettle();

    expect(calls.log, isEmpty);
  });

  testWidgets('a fling past the minimum commits before the drag threshold', (
    tester,
  ) async {
    final calls = await _pumpRow(tester);

    // 80dp clears the 54dp fling minimum but not the 126dp drag threshold.
    await tester.fling(find.text('Row title'), const Offset(80, 0), 3000);
    await tester.pumpAndSettle();

    expect(calls.log, ['complete']);
  });

  testWidgets('a swipe toward the start edge reveals trailing buttons', (
    tester,
  ) async {
    final calls = await _pumpRow(tester);

    await tester.drag(find.text('Row title'), const Offset(-200, 0));
    await tester.pumpAndSettle();

    expect(find.text('Schedule'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
    // An open row absorbs the tap and closes instead of opening the row.
    await tester.tap(find.text('Row title'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(calls.log, isEmpty);
    expect(find.text('Delete'), findsNothing);

    await tester.drag(find.text('Row title'), const Offset(-200, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(calls.log, ['delete']);
    expect(find.text('Delete'), findsNothing);
  });

  testWidgets('right-to-left layouts mirror the gestures', (tester) async {
    final calls = await _pumpRow(tester, direction: TextDirection.rtl);

    await tester.drag(find.text('Row title'), const Offset(-220, 0));
    await tester.pumpAndSettle();
    expect(calls.log, ['complete']);

    await tester.drag(find.text('Row title'), const Offset(200, 0));
    await tester.pumpAndSettle();
    expect(find.text('Schedule'), findsOneWidget);
  });

  testWidgets('a disabled row ignores swipes', (tester) async {
    final calls = await _pumpRow(tester, enabled: false);

    await tester.drag(find.text('Row title'), const Offset(220, 0));
    await tester.drag(find.text('Row title'), const Offset(-200, 0));
    await tester.pumpAndSettle();

    expect(calls.log, isEmpty);
    expect(find.text('Schedule'), findsNothing);
  });

  testWidgets('every action is reachable as a semantics action', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final calls = await _pumpRow(tester);

    final node = tester.getSemantics(find.byType(AppSwipeActions));
    final labels = node
        .getSemanticsData()
        .customSemanticsActionIds!
        .map((id) => CustomSemanticsAction.getAction(id)!.label)
        .toList();
    expect(labels, ['Complete', 'Schedule', 'Delete']);

    final deleteId = node
        .getSemanticsData()
        .customSemanticsActionIds!
        .firstWhere(
          (id) => CustomSemanticsAction.getAction(id)!.label == 'Delete',
        );
    tester
        .renderObject(find.byType(AppSwipeActions))
        .owner!
        .semanticsOwner!
        .performAction(node.id, SemanticsAction.customAction, deleteId);
    await tester.pumpAndSettle();
    expect(calls.log, ['delete']);
    handle.dispose();
  });

  testWidgets('large text widens the buttons without overflow', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pumpRow(tester, width: 320);

    await tester.drag(find.text('Row title'), const Offset(-280, 0));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    final button = tester.getSize(
      find.ancestor(of: find.text('Delete'), matching: find.byType(InkWell)),
    );
    expect(button.width, greaterThanOrEqualTo(44));
    expect(button.height, greaterThanOrEqualTo(44));
  });
}
