import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
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

  testWidgets('filters by provider and keeps favorites synced', (tester) async {
    final repository = _FavoritesRepository();
    const fast = AssistantGatewayModel(
      value: 'provider/fast',
      label: 'Fast',
      provider: 'Provider',
    );
    const vision = AssistantGatewayModel(
      value: 'other/vision',
      label: 'Vision',
      provider: 'Other',
    );
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantModelPicker(
            selected: fast,
            models: const [fast, vision],
            allowedModels: const ['provider/fast'],
            repository: repository,
            workspaceId: 'workspace',
            onSelected: (_) async {},
          ),
        ),
      ),
    );
    await tester.tap(find.byIcon(Icons.auto_awesome_outlined).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Favorites'));
    await tester.pumpAndSettle();
    expect(find.text('Fast'), findsOneWidget);
    expect(find.text('Vision'), findsNothing);
    await tester.tap(find.byTooltip('Remove from favorites'));
    await tester.pumpAndSettle();
    expect(repository.toggledModelId, 'provider/fast');
    expect(repository.wasFavorite, true);
    expect(find.text('No models match these filters'), findsOneWidget);
    await tester.tap(find.text('Other'));
    await tester.pumpAndSettle();
    expect(find.text('Vision'), findsOneWidget);
  });
}

class _FavoritesRepository extends AssistantRepository {
  String? toggledModelId;
  bool? wasFavorite;

  @override
  Future<Set<String>> fetchModelFavorites(String wsId) async => {
    'provider/fast',
  };

  @override
  Future<void> toggleModelFavorite(
    String wsId,
    String modelId, {
    required bool isFavorited,
  }) async {
    toggledModelId = modelId;
    wasFavorite = isFavorited;
  }
}
