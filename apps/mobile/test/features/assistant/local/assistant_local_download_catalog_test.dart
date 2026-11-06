import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_models_section.dart';

import '../../../helpers/pump_app.dart';

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
}) => tester.pumpThemedHome(
  Scaffold(
    body: SingleChildScrollView(
      child: AssistantLocalModelsSection(
        workspaceId: 'team',
        isScopeCurrent: current ?? () => true,
        cubit: models,
      ),
    ),
  ),
);

Finder _action(String tooltip) => find.byWidgetPredicate(
  (widget) => widget is AppIconButton && widget.tooltip == tooltip,
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
    expect(_action('Import licensed file'), findsNothing);
    expect(find.text('Get model from publisher'), findsNothing);
    expect(find.text('Qwen 3 0.6B'), findsOneWidget);
    expect(find.text('SmolLM2 360M'), findsOneWidget);
    expect(find.byTooltip('Download'), findsNWidgets(2));
    for (final action in tester.widgetList<AppIconButton>(
      _action('Download'),
    )) {
      expect(action.onPressed, isNotNull);
    }
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
      expect(_action('Download'), findsNothing);
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
      final use = tester.widget<AppIconButton>(_action('Use on this device'));
      expect(use.onPressed, isNull);
      expect(find.text('Remove weights'), findsNothing);
      // License, publisher and removal live in the row menu.
      await tester.tap(find.text('Gemma 3 270M'));
      await tester.pumpAndSettle();
      expect(find.byType(AppActionSheet<String>), findsOneWidget);
      expect(find.text('License'), findsOneWidget);
      expect(find.text('Get model from publisher'), findsOneWidget);
      final remove = tester.widget<AppGroupedRow>(
        find.widgetWithText(AppGroupedRow, 'Remove weights'),
      );
      expect(remove.onTap, isNotNull);
      await tester.tap(find.byKey(const ValueKey('app-sheet-close')));
      await tester.pumpAndSettle();
      expect(find.byType(AppActionSheet<String>), findsNothing);
      expect(tester.takeException(), isNull);
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
      final cancel = tester.widget<AppButton>(
        find.widgetWithText(AppButton, 'Cancel'),
      );
      expect(cancel.onPressed, isNotNull);
      final install = tester.widget<AppIconButton>(
        _action('Import licensed file'),
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
    expect(_action('Download'), findsNothing);
    models.show();
    await tester.pump();
    expect(find.byTooltip('Download'), findsNWidgets(2));
    for (final action in tester.widgetList<AppIconButton>(
      _action('Download'),
    )) {
      expect(action.onPressed, isNotNull);
    }
    current = false;
    models.show(supported: false);
    await tester.pump();
    expect(find.text('Remote models'), findsNothing);
    expect(_action('Download'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
