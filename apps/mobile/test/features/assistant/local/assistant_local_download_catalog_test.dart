import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_models_section.dart';
import 'package:mobile/l10n/l10n.dart';

class _Models extends AssistantLocalModelsCubit {
  _Models() : super(workspaceId: 'team', isScopeCurrent: () => true);
  @override
  Future<void> load() async {}
  void show({
    bool supported = true,
    Set<String> installed = const {},
    String? activeModelId,
  }) => emit(
    AssistantLocalModelsState(
      loaded: true,
      supported: supported,
      installed: installed,
      modelId: activeModelId,
      operation: activeModelId == null
          ? LocalModelsOperation.idle
          : LocalModelsOperation.downloading,
    ),
  );
}

Future<void> _mount(
  WidgetTester tester,
  _Models models, {
  bool Function()? current,
}) => tester.pumpWidget(
  MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(
      body: SingleChildScrollView(
        child: AssistantLocalModelsSection(
          workspaceId: 'team',
          isScopeCurrent: current ?? () => true,
          cubit: models,
        ),
      ),
    ),
  ),
);

void main() {
  test(
    'selector retains canonical metadata and ignores unknown saved/job IDs',
    () {
      expect(assistantLocalModels.map((m) => m.id), [
        'gemma3-270m-q8',
        'qwen3-600m',
        'smollm2-360m',
      ]);
      expect(assistantLocalModels.first.requiresLicensedImport, isTrue);
      expect(
        assistantLocalModelsForSettings(
          targetSupported: true,
          installed: {},
        ).map((m) => m.id),
        ['qwen3-600m', 'smollm2-360m'],
      );
      expect(
        assistantLocalModelsForSettings(
          targetSupported: false,
          installed: {'unknown'},
          activeModelId: 'unknown',
        ),
        isEmpty,
      );
      expect(
        assistantLocalModelsForSettings(
          targetSupported: false,
          installed: {assistantLocalModels.first.id},
        ).single,
        same(assistantLocalModels.first),
      );
      expect(
        assistantLocalModelsForSettings(
          targetSupported: false,
          installed: {},
          activeModelId: assistantLocalModels.first.id,
        ).single,
        same(assistantLocalModels.first),
      );
    },
  );
  testWidgets('supported catalog hides uninstalled import-only entries', (
    tester,
  ) async {
    final models = _Models()..show();
    await _mount(tester, models);
    expect(find.text('Gemma 3 270M'), findsNothing);
    expect(find.text('Import licensed file'), findsNothing);
    expect(find.text('Get model from publisher'), findsNothing);
    expect(find.text('Qwen 3 0.6B'), findsOneWidget);
    expect(find.text('SmolLM2 360M'), findsOneWidget);
    expect(find.text('Download'), findsNWidgets(2));
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(models.isClosed, isTrue);
  });
  testWidgets(
    'unsupported target keeps remote option without download candidates',
    (tester) async {
      final models = _Models()..show(supported: false);
      await _mount(tester, models);
      expect(find.text('Remote models'), findsOneWidget);
      for (final model in assistantLocalModels) {
        expect(find.text(model.name), findsNothing);
      }
      expect(find.text('Download'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
  testWidgets(
    'verified legacy installed import remains removable on unsupported target',
    (tester) async {
      final models = _Models()
        ..show(supported: false, installed: {assistantLocalModels.first.id});
      await _mount(tester, models);
      expect(find.text('Gemma 3 270M'), findsOneWidget);
      expect(find.text('Qwen 3 0.6B'), findsNothing);
      final use = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Use on this device'),
      );
      expect(use.onPressed, isNull);
      final remove = tester.widget<TextButton>(
        find.widgetWithText(TextButton, 'Remove weights'),
      );
      expect(remove.onPressed, isNotNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
  testWidgets(
    'known active legacy model retains status and cancellation only',
    (tester) async {
      final models = _Models()
        ..show(activeModelId: assistantLocalModels.first.id);
      await _mount(tester, models);
      expect(find.text('Gemma 3 270M'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      final cancel = tester.widget<TextButton>(
        find.widgetWithText(TextButton, 'Cancel'),
      );
      expect(cancel.onPressed, isNotNull);
      final install = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Import licensed file'),
      );
      expect(install.onPressed, isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );

  testWidgets('unknown capability and scope departure never expose downloads', (
    tester,
  ) async {
    var current = true;
    final models = _Models();
    await _mount(tester, models, current: () => current);
    expect(find.text('Download'), findsNothing);
    models.show();
    await tester.pump();
    expect(find.text('Download'), findsNWidgets(2));
    current = false;
    models.show(supported: false);
    await tester.pump();
    expect(find.text('Remote models'), findsNothing);
    expect(find.text('Download'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
