import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  for (final time in [false, true]) {
    testWidgets(
      'phone ${time ? 'time' : 'date'} picker returns and Back cancels',
      (tester) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = const Size(390, 844);
        addTearDown(tester.view.reset);
        Object? result;
        Future<void> open(BuildContext context) async {
          result = time
              ? await showAppTimePicker(
                  context: context,
                  initialTime: const TimeOfDay(hour: 0, minute: 5),
                )
              : await showAppDatePicker(
                  context: context,
                  initialDate: DateTime(2024, 2, 29),
                  firstDate: DateTime(2024, 2, 20),
                  lastDate: DateTime(2024, 2, 29),
                );
        }

        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => AppScaffold(
                child: AppButton(
                  onPressed: () => open(context),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();
        expect(find.byType(BottomSheet), findsOneWidget);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(result, isNull);
        expect(find.text('Open'), findsOneWidget);
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();
        if (time) {
          await tester.tap(find.byType(TextField).first);
          tester.view.viewInsets = const FakeViewPadding(bottom: 300);
          await tester.pumpAndSettle();
          await tester.enterText(find.byType(TextField).first, '12');
          final ok = find.widgetWithText(AppButton, 'OK');
          expect(tester.getBottomRight(ok).dy, lessThanOrEqualTo(544));
          expect(ok.hitTestable(), findsOneWidget);
          await tester.tap(ok);
          await tester.pumpAndSettle();
          expect(result, const TimeOfDay(hour: 0, minute: 5));
        } else {
          await tester.tap(find.text('29'));
          await tester.pumpAndSettle();
          expect(result, DateTime(2024, 2, 29));
        }
        expect(find.byType(BottomSheet), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('dialog Save remains tappable above a phone keyboard', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    String? result;
    final controller = TextEditingController(text: 'Draft');
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => AppScaffold(
            child: AppButton(
              child: const Text('Rename'),
              onPressed: () async {
                result = await showAppDialog<String>(
                  context: context,
                  builder: (dialogContext) => AppDialog(
                    title: 'Name',
                    content: AppTextField(
                      controller: controller,
                      autofocus: true,
                    ),
                    actions: [
                      AppButton(
                        child: const Text('Save'),
                        onPressed: () =>
                            Navigator.of(dialogContext).pop(controller.text),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Rename'));
    await tester.pumpAndSettle();
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Nova');
    final save = find.widgetWithText(AppButton, 'Save');
    expect(tester.getBottomRight(save).dy, lessThanOrEqualTo(544));
    expect(save.hitTestable(), findsOneWidget);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(result, 'Nova');
    expect(tester.takeException(), isNull);
  });
}
