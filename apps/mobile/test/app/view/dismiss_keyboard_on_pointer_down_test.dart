import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';

void main() {
  group('DismissKeyboardOnPointerDown', () {
    testWidgets('unfocuses the active field when tapping outside', (
      tester,
    ) async {
      final focusNode = FocusNode();

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(
            viewInsets: EdgeInsets.only(bottom: 320),
          ),
          child: MaterialApp(
            home: DismissKeyboardOnPointerDown(
              child: Scaffold(
                body: Column(
                  children: [
                    TextField(focusNode: focusNode),
                    const SizedBox(height: 80),
                    const SizedBox(width: 120, height: 120),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(focusNode.hasFocus, isTrue);

      await tester.tapAt(const Offset(200, 200));
      await tester.pump();
      expect(focusNode.hasFocus, isFalse);
    });

    testWidgets('keeps focus when tapping inside the focused field', (
      tester,
    ) async {
      final focusNode = FocusNode();

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(
            viewInsets: EdgeInsets.only(bottom: 320),
          ),
          child: MaterialApp(
            home: DismissKeyboardOnPointerDown(
              child: Scaffold(
                body: TextField(focusNode: focusNode),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(focusNode.hasFocus, isTrue);

      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(focusNode.hasFocus, isTrue);
    });
  });
}
