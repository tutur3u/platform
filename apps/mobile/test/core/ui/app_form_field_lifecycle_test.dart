import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets(
    'controller changes validate and Form.reset restores the initial text',
    (tester) async {
      final controller = TextEditingController(text: 'Initial');
      addTearDown(controller.dispose);
      final form = GlobalKey<FormState>();
      String? saved;
      await tester.pumpWidget(
        MaterialApp(
          home: AppScaffold(
            child: Form(
              key: form,
              child: AppTextFormField(
                controller: controller,
                validator: (value) => value!.isEmpty ? 'Required' : null,
                onSaved: (value) => saved = value,
                autovalidateMode: AutovalidateMode.always,
              ),
            ),
          ),
        ),
      );
      controller.clear();
      await tester.pump();
      expect(form.currentState!.validate(), isFalse);
      expect(find.text('Required'), findsOneWidget);
      controller.text = 'Updated';
      await tester.pump();
      expect(form.currentState!.validate(), isTrue);
      form.currentState!.save();
      expect(saved, 'Updated');
      form.currentState!.reset();
      await tester.pump();
      expect(controller.text, 'Initial');
      expect(find.text('Required'), findsNothing);
    },
  );
}
