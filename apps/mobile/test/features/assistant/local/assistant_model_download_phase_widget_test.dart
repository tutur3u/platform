import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_model_downloads.dart';
import 'package:mobile/features/assistant/local/widgets/assistant_local_models_section.dart';
import 'package:mobile/l10n/l10n.dart';

class _Models extends AssistantLocalModelsCubit {
  _Models() : super(workspaceId: 'workspace', isScopeCurrent: () => true);
  @override
  Future<void> load() async {}
  @override
  bool get supportsBackgroundDownloads => true;
  void show(ModelDownloadPhase phase) => emit(
    AssistantLocalModelsState(
      loaded: true,
      supported: true,
      operation: LocalModelsOperation.downloading,
      modelId: assistantLocalModels.first.id,
      downloadPhase: phase,
    ),
  );
}

void main() {
  testWidgets(
    'settings renders actual phase and removes stale phase on leaving',
    (tester) async {
      final models = _Models()..show(ModelDownloadPhase.queued);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: SingleChildScrollView(
              child: AssistantLocalModelsSection(
                workspaceId: 'workspace',
                isScopeCurrent: () => true,
                cubit: models,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Queued'), findsOneWidget);
      models.show(ModelDownloadPhase.retryWait);
      await tester.pump();
      expect(find.text('Waiting to retry'), findsOneWidget);
      expect(find.text('Queued'), findsNothing);
      models.show(ModelDownloadPhase.verifying);
      await tester.pump();
      expect(find.text('Verifying download'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      expect(models.isClosed, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
