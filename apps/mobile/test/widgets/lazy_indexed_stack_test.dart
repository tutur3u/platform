import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/widgets/lazy_indexed_stack.dart';

void main() {
  testWidgets('mounts only visited tabs and preserves their state', (
    tester,
  ) async {
    var firstBuilds = 0;
    var secondBuilds = 0;
    Widget app(int index) => MaterialApp(
      home: LazyIndexedStack(
        index: index,
        builders: [
          (_) {
            firstBuilds++;
            return const _Counter();
          },
          (_) {
            secondBuilds++;
            return const Text('Second tab');
          },
        ],
      ),
    );
    await tester.pumpWidget(app(0));
    expect(firstBuilds, 1);
    expect(secondBuilds, 0);
    await tester.tap(find.byType(TextButton));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
    await tester.pumpWidget(app(1));
    expect(find.text('Second tab'), findsOneWidget);
    expect(secondBuilds, 1);
    await tester.pumpWidget(app(0));
    expect(find.text('1'), findsOneWidget);
  });
}

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
    child: Text('$count'),
  );
}
