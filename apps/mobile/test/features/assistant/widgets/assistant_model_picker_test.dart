import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  testWidgets('filters models and blocks unavailable choices', (tester) async {
    const selected = AssistantGatewayModel(
      value: 'provider/fast',
      label: 'Fast',
      provider: 'Provider',
    );
    const allowed = AssistantGatewayModel(
      value: 'provider/reasoning',
      label: 'Reasoning',
      provider: 'Provider',
      description: 'Handles complex requests',
    );
    const disabled = AssistantGatewayModel(
      value: 'other/vision',
      label: 'Vision',
      provider: 'Other',
    );
    AssistantGatewayModel? picked;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantModelPicker(
            selected: selected,
            models: const [selected, allowed, disabled],
            allowedModels: const ['provider/fast', 'provider/reasoning'],
            onSelected: (model) async {
              picked = model;
            },
          ),
        ),
      ),
    );
    await tester.tap(find.byIcon(Icons.auto_awesome_outlined).first);
    await tester.pumpAndSettle();
    expect(
      tester.widget<ListTile>(find.widgetWithText(ListTile, 'Vision')).enabled,
      false,
    );
    await tester.enterText(find.byType(TextField), 'reasoning');
    await tester.pumpAndSettle();
    expect(find.text('Vision'), findsNothing);
    await tester.tap(find.text('Reasoning'));
    await tester.pumpAndSettle();
    expect(picked, allowed);
  });
}
