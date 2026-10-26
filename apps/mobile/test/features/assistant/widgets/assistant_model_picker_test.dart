import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
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
    await tester.tap(find.byIcon(LucideIcons.sparkles).first);
    await tester.pumpAndSettle();
    expect(find.text('Vision'), findsNothing);
    await tester.tap(find.byType(AppSwitch).first);
    await tester.pumpAndSettle();
    expect(
      tester.widget<AppCard>(find.widgetWithText(AppCard, 'Vision')).onTap,
      isNull,
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
    await tester.tap(find.byIcon(LucideIcons.sparkles).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Favorites'));
    await tester.pumpAndSettle();
    expect(find.text('Fast'), findsOneWidget);
    expect(find.text('Vision'), findsNothing);
    await tester.tap(find.byTooltip('Remove from favorites'));
    await tester.pumpAndSettle();
    expect(repository.toggledModelId, 'provider/fast');
    expect(repository.wasFavorite, false);
    expect(find.text('No models match these filters'), findsOneWidget);
    await tester.tap(find.byType(AppSwitch).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Other'));
    await tester.pumpAndSettle();
    expect(find.text('Vision'), findsOneWidget);
  });
  testWidgets(
    'model search belongs to the dock and system Back dismisses its sheet',
    (tester) async {
      final chrome = ShellChromeActionsCubit()
        ..register(
          registrationId: 'page',
          ownerId: 'page',
          locations: const {'/models'},
          actions: [
            ShellActionSpec(
              id: 'page-action',
              icon: LucideIcons.plus,
              onPressed: () {},
            ),
          ],
        );
      addTearDown(chrome.close);
      const fast = AssistantGatewayModel(
        value: 'fixture/fast',
        label: 'Fast',
        provider: 'Fixture',
      );
      const reasoning = AssistantGatewayModel(
        value: 'fixture/reasoning',
        label: 'Reasoning',
        provider: 'Fixture',
      );
      final router = GoRouter(
        initialLocation: '/models',
        routes: [
          ShellRoute(
            builder: (_, _, child) => child,
            routes: [
              GoRoute(
                path: '/models',
                builder: (_, _) => Scaffold(
                  body: AssistantModelPicker(
                    selected: fast,
                    models: const [fast, reasoning],
                    allowedModels: const ['fixture/fast', 'fixture/reasoning'],
                    onSelected: (_) async {},
                  ),
                ),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        BlocProvider.value(
          value: chrome,
          child: MaterialApp.router(
            routerConfig: router,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
        ),
      );

      await tester.tap(find.byType(AppIconButton));
      await tester.pumpAndSettle();
      final action = chrome.state.resolveForLocation('/models').single;
      expect(action.inDock, isTrue);
      expect(find.byType(EditableText), findsNothing);
      action.onPressed!();
      await tester.pump();
      final search = chrome.state.resolveForLocation('/models').single;
      search.searchController!.text = 'Reasoning';
      search.onSearchChanged!('Reasoning');
      await tester.pumpAndSettle();
      expect(find.text('Reasoning'), findsOneWidget);
      expect(find.text('Fast'), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(AssistantModelPicker), findsOneWidget);
      expect(chrome.state.topmostModalOwner, isNull);
      expect(
        chrome.state.resolveForLocation('/models').single.id,
        'page-action',
      );
    },
  );
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
