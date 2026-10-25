import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';

class _Counter extends StatefulWidget {
  const _Counter();

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  int count = 0;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: () => setState(() => count++),
    child: Text('count $count'),
  );
}

Future<void> _pump(
  WidgetTester tester, {
  required double width,
  Widget? detail,
  Object? detailKey,
  ValueChanged<bool>? onSplitChanged,
  VoidCallback? onCloseDetail,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = Size(width, 800);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Material(
        child: AppMasterDetail(
          master: const _Counter(),
          detail: detail,
          detailKey: detailKey,
          onSplitChanged: onSplitChanged,
          onCloseDetail: onCloseDetail,
          emptyDetail: const AppMasterDetailEmpty(
            icon: Icons.inbox_outlined,
            title: 'Nothing selected',
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  test('splits from 720dp and clamps the list pane to 320-400dp', () {
    expect(AppMasterDetailLayout.isSplit(719), isFalse);
    expect(AppMasterDetailLayout.isSplit(720), isTrue);
    expect(AppMasterDetailLayout.isSplit(double.infinity), isFalse);
    expect(AppMasterDetailLayout.listWidth(720), 320);
    expect(AppMasterDetailLayout.listWidth(1000), 340);
    expect(AppMasterDetailLayout.listWidth(1366), 400);
  });

  testWidgets('compact bodies show only the master', (tester) async {
    final modes = <bool>[];
    await _pump(
      tester,
      width: 390,
      detail: const Text('detail'),
      onSplitChanged: modes.add,
    );
    expect(find.text('count 0'), findsOneWidget);
    expect(find.text('detail'), findsNothing);
    expect(find.text('Nothing selected'), findsNothing);
    expect(modes, [false]);
  });

  testWidgets('split bodies show the empty state, then the detail', (
    tester,
  ) async {
    await _pump(tester, width: 1194);
    expect(find.text('Nothing selected'), findsOneWidget);
    expect(tester.getSize(find.byType(_Counter)).width, 400);
    await _pump(tester, width: 1194, detail: const Text('detail'));
    expect(find.text('detail'), findsOneWidget);
    expect(find.text('Nothing selected'), findsNothing);
  });

  testWidgets('master state survives crossing the split width', (tester) async {
    final modes = <bool>[];
    await _pump(tester, width: 390, onSplitChanged: modes.add);
    await tester.tap(find.text('count 0'));
    await tester.pump();
    await _pump(tester, width: 820, onSplitChanged: modes.add);
    expect(find.text('count 1'), findsOneWidget);
    await _pump(tester, width: 390, onSplitChanged: modes.add);
    expect(find.text('count 1'), findsOneWidget);
    expect(modes, [false, true, false]);
  });

  testWidgets('a new selection takes focus and Escape closes it', (
    tester,
  ) async {
    var closed = 0;
    final field = FocusNode();
    addTearDown(field.dispose);
    await _pump(tester, width: 1194, onCloseDetail: () => closed++);
    await _pump(
      tester,
      width: 1194,
      detailKey: 'a',
      detail: TextField(focusNode: field),
      onCloseDetail: () => closed++,
    );
    await tester.pump();
    final primary = FocusManager.instance.primaryFocus!;
    expect(
      [
        primary,
        ...primary.ancestors,
      ].any((node) => node.debugLabel == 'master-detail.detail'),
      isTrue,
    );
    field.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    expect(closed, 1);
  });

  testWidgets('panes report their role to descendants', (tester) async {
    late bool masterSplit;
    late bool masterPane;
    late bool detailPane;
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(1194, 800);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: AppMasterDetail(
          master: Builder(
            builder: (context) {
              masterSplit = AppMasterDetail.isSplitOf(context);
              masterPane = AppMasterDetail.inDetailPaneOf(context);
              return const SizedBox();
            },
          ),
          detail: Builder(
            builder: (context) {
              detailPane = AppMasterDetail.inDetailPaneOf(context);
              return const SizedBox();
            },
          ),
          emptyDetail: const SizedBox(),
        ),
      ),
    );
    expect(masterSplit, isTrue);
    expect(masterPane, isFalse);
    expect(detailPane, isTrue);
  });

  testWidgets('a pushed detail reports once when its body can split', (
    tester,
  ) async {
    var splits = 0;
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 800);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: AppMasterDetailRouteBody(
          onSplit: () => splits++,
          child: const SizedBox(),
        ),
      ),
    );
    expect(splits, 0);
    tester.view.physicalSize = const Size(1194, 800);
    await tester.pump();
    await tester.pump();
    expect(splits, 1);
    tester.view.physicalSize = const Size(1000, 800);
    await tester.pump();
    await tester.pump();
    expect(splits, 1);
  });
}
