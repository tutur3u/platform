import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_tool_receipt_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('tool-receipt-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (_) async => directory.path,
        );
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
  late ToolReceiptRepository repository;
  late AssistantChatCubit chat;
  late AssistantShellCubit shell;
  late List<SafeErrorDiagnostics> failures;
  var epoch = 0;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    epoch = 0;
    failures = [];
    repository = ToolReceiptRepository();
    final preferences = AssistantPreferences(currentUserId: () => 'actor-a');
    shell = AssistantShellCubit(
      repository: repository,
      preferences: preferences,
      currentScopeToken: () => epoch,
    );
    chat = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: shell.refreshSoul,
      onSoulRefreshFailed: failures.add,
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    await chat.loadWorkspace('synthetic-ws');
  });
  tearDown(() async {
    await chat.close();
    await shell.close();
    await repository.body.close();
  });
  Future<void> start() async {
    final capturedEpoch = epoch;
    await chat.submit(
      wsId: 'synthetic-ws',
      message: 'Synthetic rename',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.thinking,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: 'synthetic-ws',
      timezone: 'UTC',
      isCurrent: () => capturedEpoch == epoch,
    );
    await repository.started.future.timeout(const Duration(seconds: 2));
  }

  Future<void> finish() async {
    final settled = chat.stream.firstWhere(
      (state) =>
          state.messages.lastOrNull?.id == 'saved-reply' &&
          state.status == AssistantChatStatus.idle,
    );
    repository.done();
    await settled.timeout(const Duration(seconds: 2));
    expect(chat.state.error, isNull);
    expect(chat.state.messages.last.id, 'saved-reply');
  }

  test(
    'nameless native result refreshes once across duplicate outputs',
    () async {
      await start();
      repository
        ..input()
        ..output()
        ..output();
      await finish();
      expect(repository.soulReads, 1);
      expect(shell.state.soul.name, 'Nova');
    },
  );
  for (final invalid in [
    'error',
    'false',
    'malformed',
    'preliminary',
    'unmatched',
    'unsolicited',
    'conflicting',
  ]) {
    test('rejects $invalid output without changing saved reply', () async {
      await start();
      if (invalid != 'unsolicited') repository.input();
      switch (invalid) {
        case 'error':
          repository.output(result: {'success': true, 'error': 'Synthetic'});
        case 'false':
          repository.output(result: {'success': false});
        case 'malformed':
          repository.output(result: 'success');
        case 'preliminary':
          repository.output(preliminary: true);
        case 'unmatched':
          repository
            ..output(callId: 'another', name: 'update_my_settings')
            ..output(callId: 'another', name: 'update_my_settings');
        case 'unsolicited':
          repository
            ..output(name: 'update_my_settings')
            ..output(name: 'update_my_settings');
        case 'conflicting':
          repository.output(name: 'other_tool');
      }
      await finish();
      expect(repository.soulReads, 0);
      expect(shell.state.soul.name, 'Mira');
      expect(failures, isEmpty);
    });
  }
  test('preliminary output does not consume definitive success', () async {
    await start();
    repository
      ..input()
      ..output(preliminary: true)
      ..output();
    await finish();
    expect(repository.soulReads, 1);
  });
  test(
    'reported name cannot replace retained different input identity',
    () async {
      await start();
      repository
        ..input(name: 'other_tool')
        ..output(name: 'update_my_settings')
        ..output();
      await finish();
      expect(repository.soulReads, 0);
    },
  );
  test(
    'restored successful calls neither replay nor admit an unmatched call',
    () async {
      repository.restored = const AssistantRestoredChat(
        chat: AssistantChatRecord(id: 'chat'),
        messages: [
          AssistantMessage(
            id: 'historical-reply',
            role: 'assistant',
            parts: [
              AssistantMessagePart(
                type: 'dynamic-tool',
                toolCallId: 'rename',
                toolName: 'update_my_settings',
                input: {'name': 'Nova'},
                state: 'output-available',
                output: {'success': true},
              ),
            ],
          ),
        ],
        attachmentsByMessageId: {},
      );
      final preferences = AssistantPreferences(currentUserId: () => 'actor-a');
      await preferences.saveChatId('synthetic-ws', 'chat');
      await chat.loadWorkspace('synthetic-ws');
      expect(repository.soulReads, 0);
      await start();
      repository.output();
      await finish();
      expect(repository.soulReads, 0);
    },
  );
  test('actor ABA before tool receipt prevents refresh admission', () async {
    await start();
    epoch += 2;
    repository
      ..input()
      ..output()
      ..done();
    await repository.body.close();
    expect(repository.soulReads, 0);
    expect(shell.state.soul.name, 'Mira');
  });
  test('held successful refresh cannot publish after actor ABA', () async {
    repository.heldSoul = Completer<AssistantSoul>();
    await start();
    repository
      ..input()
      ..output();
    await finish();
    expect(repository.soulReads, 1);
    epoch += 2;
    repository.heldSoul!.complete(const AssistantSoul(name: 'Departed'));
    await Future<void>.delayed(Duration.zero);
    expect(shell.state.soul.name, 'Mira');
    expect(failures, isEmpty);
  });
  test(
    'typed auth refresh failure remains separate from saved reply',
    () async {
      repository.soulFailure = const ApiException(
        statusCode: 403,
        message: 'Synthetic private body must not be copied',
      );
      await start();
      repository
        ..input()
        ..output();
      await finish();
      expect(failures.single.status, 403);
      expect(failures.single.stage, DiagnosticStage.assistantSettings);
      expect(failures.single.summary, isNot(contains('private body')));
      expect(shell.state.soul.name, 'Mira');
      expect(chat.state.diagnostics, isNull);
    },
  );
  test(
    'actual transport error after settings success still fails reply',
    () async {
      await start();
      final failed = chat.stream.firstWhere(
        (state) => state.status == AssistantChatStatus.error,
      );
      repository
        ..input()
        ..output()
        ..send({'type': 'error', 'message': 'Not saved'})
        ..send({'type': 'done'});
      await failed.timeout(const Duration(seconds: 2));
      expect(chat.state.error, 'Not saved');
      expect(chat.state.diagnostics?.kind, 'stream');
    },
  );
  for (final departure in ['actor', 'workspace']) {
    test('held refresh rejects $departure ABA and late failure', () async {
      repository.heldSoul = Completer<AssistantSoul>();
      await start();
      repository
        ..input()
        ..output();
      await finish();
      expect(repository.soulReads, 1);
      if (departure == 'actor') {
        epoch += 2;
      } else {
        await chat.loadWorkspace('other-ws');
        await chat.loadWorkspace('synthetic-ws');
        // Production Shell workspace reload owns its own request generation;
        // captured actor/workspace scope token also departs on this transition.
        epoch += 2;
      }
      repository.heldSoul!.completeError(StateError('Synthetic late failure'));
      await Future<void>.delayed(Duration.zero);
      expect(failures, isEmpty);
      expect(shell.state.soul.name, 'Mira');
    });
  }
}
