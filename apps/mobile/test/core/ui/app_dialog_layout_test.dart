import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('dialog keeps actions visible while long content scrolls', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(320, 568);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Builder(
          builder: (context) => AppScaffold(
            child: AppButton(
              onPressed: () => showAppDialog<void>(
                context: context,
                builder: (_) => AppDialog(
                  title: 'Edit',
                  content: Text(List.filled(100, 'Retained draft').join(' ')),
                  actions: [
                    AppButton(
                      key: const ValueKey('retry'),
                      onPressed: () => calls++,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final retry = find.byKey(const ValueKey('retry'));
    expect(retry.hitTestable(), findsOneWidget);
    expect(tester.getBottomRight(retry).dy, lessThan(568));
    await tester.tap(retry);
    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });
}
