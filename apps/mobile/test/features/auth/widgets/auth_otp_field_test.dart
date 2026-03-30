import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/widgets/auth_otp_field.dart';

import '../../../helpers/helpers.dart';

void main() {
  group('AuthOtpField', () {
    testWidgets('uses a full-size editable surface for focus and paste', (
      tester,
    ) async {
      final controller = TextEditingController();
      final focusNode = FocusNode();

      addTearDown(() {
        controller.dispose();
        focusNode.dispose();
      });

      await tester.pumpApp(
        Scaffold(
          body: AuthOtpField(
            controller: controller,
            focusNode: focusNode,
            onChanged: (_) {},
          ),
        ),
      );

      final fieldSize = tester.getSize(find.byType(AuthOtpField));
      final inputSize = tester.getSize(
        find.byKey(const ValueKey('auth-otp-input')),
      );

      expect(inputSize, fieldSize);
      expect(inputSize.width, greaterThan(250));
      expect(inputSize.height, 56);
    });

    testWidgets('supports paste and sanitizes to six digits', (tester) async {
      final controller = TextEditingController();
      final focusNode = FocusNode();
      var latestValue = '';

      addTearDown(() {
        controller.dispose();
        focusNode.dispose();
      });

      await tester.pumpApp(
        Scaffold(
          body: AuthOtpField(
            controller: controller,
            focusNode: focusNode,
            onChanged: (value) => latestValue = value,
          ),
        ),
      );
      await tester.tap(find.byType(AuthOtpField));
      await tester.pump();

      await tester.enterText(
        find.byKey(const ValueKey('auth-otp-input')),
        '12a 34-5678',
      );
      await tester.pump();

      expect(controller.text, '123456');
      expect(latestValue, '123456');
    });

    testWidgets('allows continuous deletion after entry', (tester) async {
      final controller = TextEditingController(text: '123456');
      final focusNode = FocusNode();

      addTearDown(() {
        controller.dispose();
        focusNode.dispose();
      });

      await tester.pumpApp(
        Scaffold(
          body: AuthOtpField(
            controller: controller,
            focusNode: focusNode,
            onChanged: (_) {},
          ),
        ),
      );
      await tester.tap(find.byType(AuthOtpField));
      await tester.pump();

      await tester.enterText(
        find.byKey(const ValueKey('auth-otp-input')),
        '1234',
      );
      await tester.pump();

      expect(controller.text, '1234');
      expect(find.text('1'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
    });
  });
}
