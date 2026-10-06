import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/pump_app.dart';
import '../cubit/assistant_tool_receipt_harness.dart';
import 'compact_model_header_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('tool-title-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => directory.path,
        );
    // Initialize disk-backed dependencies before the widget fake clock starts.
    await CacheStore.instance.init();
    await OfflineMutationQueue.instance.init();
  });
  tearDownAll(() async {
    await OfflineMutationQueue.instance.dispose();
    await CacheStore.instance.closeForTesting();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          null,
        );
    await directory.delete(recursive: true);
  });
  for (final locale in ['en', 'vi']) {
    for (final fails in [false, true]) {
      testWidgets(
        'native tool receipt actual $locale title refreshFailure=$fails',
        (tester) async {
          final repository = ToolReceiptRepository();
          if (fails) {
            repository.soulFailure = StateError('Synthetic private error');
          }
          await tester.runAsync(repository.prepare);
          final h = CompactModelHeaderHarness(repository: repository);
          addTearDown(() => h.dispose(tester));
          await h.mount(tester, actualNavbar: true, locale: Locale(locale));
          final chat = h.pageContext(tester).read<AssistantChatCubit>();
          await tester.runAsync(() async {
            final completed = chat.stream.firstWhere(
              (state) =>
                  state.messages.lastOrNull?.id == 'saved-reply' &&
                  state.status == AssistantChatStatus.idle,
            );
            await chat.submit(
              wsId: 'synthetic-ws',
              message: 'Synthetic rename request',
              modelId: 'model',
              thinkingMode: AssistantThinkingMode.thinking,
              creditSource: AssistantCreditSource.workspace,
              workspaceContextId: 'synthetic-ws',
              timezone: 'UTC',
            );
            await completed.timeout(const Duration(seconds: 2));
          });
          await tester.pumpAndSettle();
          expect(repository.soulReads, 1);
          expect(
            find.descendant(
              of: find.byKey(const ValueKey('assistant-name-title')),
              matching: find.text(fails ? 'Mira' : 'Nova'),
            ),
            findsOneWidget,
          );
          expect(chat.state.messages.last.id, 'saved-reply');
          expect(chat.state.error, isNull);
          if (fails) {
            expect(
              find.text(
                AppLocalizations.of(
                  h.pageContext(tester),
                ).assistantSettingsRefreshFailed,
              ),
              findsOneWidget,
            );
            expect(find.text('Synthetic private error'), findsNothing);
            await tester.drainShadToastTimers();
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
