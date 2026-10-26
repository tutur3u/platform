import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('removing the overlay closes the toast and cancels its timer', (
    tester,
  ) async {
    late AppToastHandle handle;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => AppButton.primary(
            onPressed: () => handle = showAppToast(context, message: 'Saved'),
            child: const Text('Show'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Show'));
    await tester.pump();
    expect(handle.isOpen, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(handle.isOpen, isFalse);
    handle.close();
    expect(tester.takeException(), isNull);
  });

  testWidgets('the entire setting row toggles once and honors disabled state', (
    tester,
  ) async {
    var changes = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Column(
          children: [
            AppToggleRow(
              title: const Text('Enabled setting'),
              value: false,
              onChanged: (_) => changes++,
            ),
            const AppToggleRow(
              title: Text('Disabled setting'),
              value: false,
              onChanged: null,
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.text('Enabled setting'));
    expect(changes, 1);
    await tester.tap(find.byType(AppSwitch).first);
    expect(changes, 2);
    await tester.tap(find.text('Disabled setting'));
    expect(changes, 2);
  });
}
