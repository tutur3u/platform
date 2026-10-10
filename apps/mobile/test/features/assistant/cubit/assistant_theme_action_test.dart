import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
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
  late List<String> workspaceChanges;
  late List<bool> immersiveChanges;
  var epoch = 0;
  final themes = <String>[];
  bool Function()? lastGuard;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    epoch = 0;
    themes.clear();
    lastGuard = null;
    failures = [];
    workspaceChanges = [];
    immersiveChanges = [];
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
      onWorkspaceContextChanged: (id) async => workspaceChanges.add(id),
      onSoulRefreshRequested: shell.refreshSoul,
      onThemeRequested: (theme, isCurrent) async {
        themes.add(theme);
        lastGuard = isCurrent;
      },
      onSoulRefreshFailed: failures.add,
      onImmersiveModeChanged: immersiveChanges.add,
      onChatRestored: (_) async {},
    );
    await chat.loadWorkspace('synthetic-ws');
  });
  tearDown(() async {
    if (!repository.body.isClosed) {
      repository.done();
      await repository.body.close();
    }
    if (!chat.isClosed) await chat.close();
    await shell.close();
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

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 30));
  for (final theme in ['light', 'dark', 'system']) {
    test('fresh successful $theme applies once', () async {
      await start();
      repository
        ..input(name: 'set_theme', args: {'theme': theme})
        ..output(result: {'success': true, 'theme': theme})
        ..output(result: {'success': true, 'theme': theme});
      await settle();
      expect(themes, [theme]);
      expect(lastGuard!(), isTrue);
    });
  }
  test(
    'invalid failed preliminary and unsolicited outputs do not apply',
    () async {
      await start();
      repository
        ..output(result: const {'success': true, 'theme': 'dark'})
        ..input(name: 'set_theme');
      for (final output in [
        {'success': true, 'theme': 'purple'},
        {'success': false, 'theme': 'dark'},
        {'success': true, 'error': 'failed', 'theme': 'dark'},
      ]) {
        repository.output(result: output);
      }
      repository.output(
        result: const {'success': true, 'theme': 'dark'},
        preliminary: true,
      );
      await settle();
      expect(themes, isEmpty);
    },
  );
  test(
    'session A-B-A invalidates in-flight receipt and callback lease',
    () async {
      await start();
      repository
        ..input(name: 'set_theme')
        ..output(result: const {'success': true, 'theme': 'dark'});
      await settle();
      expect(themes, ['dark']);
      epoch += 2;
      expect(lastGuard!(), isFalse);
      repository
        ..input(callId: 'second', name: 'set_theme')
        ..output(
          callId: 'second',
          result: const {'success': true, 'theme': 'light'},
        );
      await settle();
      expect(themes, ['dark']);
    },
  );
  test('closing receiver invalidates callback lease', () async {
    await start();
    repository
      ..input(name: 'set_theme')
      ..output(result: const {'success': true, 'theme': 'dark'});
    await settle();
    expect(themes, ['dark']);
    repository.done();
    await repository.body.close();
    await chat.close();
    expect(lastGuard!(), isFalse);
  });
  test(
    'restored output cannot replay or admit unmatched current receipt',
    () async {
      repository.restored = const AssistantRestoredChat(
        chat: AssistantChatRecord(id: 'chat'),
        messages: [
          AssistantMessage(
            id: 'historical',
            role: 'assistant',
            parts: [
              AssistantMessagePart(
                type: 'dynamic-tool',
                toolCallId: 'rename',
                toolName: 'set_theme',
                input: {'theme': 'dark'},
                state: 'output-available',
                output: {'success': true, 'theme': 'dark'},
              ),
            ],
          ),
        ],
        attachmentsByMessageId: {},
      );
      final preferences = AssistantPreferences(currentUserId: () => 'actor-a');
      await preferences.saveChatId('synthetic-ws', 'chat');
      await chat.loadWorkspace('synthetic-ws');
      expect(themes, isEmpty);
      await start();
      repository.output(result: const {'success': true, 'theme': 'dark'});
      await settle();
      expect(themes, isEmpty);
    },
  );
}
