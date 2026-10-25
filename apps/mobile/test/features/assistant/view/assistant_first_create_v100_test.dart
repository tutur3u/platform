import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import '../../../helpers/helpers.dart';
import 'assistant_settings_repair_harness.dart';

const selectedModel = AssistantGatewayModel(
  value: 'synthetic/model-b',
  label: 'Model B',
  provider: 'synthetic',
);

class InitialApi extends SettingsApi {
  String? malformedField;
  bool unknown = false;
  Completer<void>? creationGate;
  final creationEntered = Completer<void>();
  Map<String, dynamic>? creationInput;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    creationInput = body! as Map<String, dynamic>;
    final response = await super.postJson(path, body);
    if (!creationEntered.isCompleted) creationEntered.complete();
    await creationGate?.future;
    if (unknown) throw StateError('Synthetic lost creation response');
    if (malformedField != null) {
      final conversation = response['conversation'] as Map<String, dynamic>;
      final receipt = conversation['initialAiSettings'] as Map<String, dynamic>;
      if (malformedField == 'missing') {
        conversation.remove('initialAiSettings');
      } else {
        receipt[malformedField!] = '88888888-8888-4888-8888-888888888888';
      }
    }
    return response;
  }
}

Future<RepairHarness> fresh(WidgetTester tester, InitialApi api) async {
  final h = RepairHarness(api: api);
  addTearDown(() => h.dispose(tester));
  await h.mount(tester);
  if (h.chat.state.creationOutcomeUnknown) {
    await h.startNew(tester);
    await tester.tap(find.widgetWithText(AppButton, 'Start a new chat'));
    await tester.pumpAndSettle();
  }
  return h;
}

Future<void> send(WidgetTester tester, RepairHarness h, String text) async {
  await tester.pumpAndSettle();
  if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
  }
  h.composer(tester).text = text;
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
  }
}

// A held first-message response can keep progress animations active. Observe
// the actual scope transition and cancellation instead of global animation idle.
Future<void> scopeReady(WidgetTester tester, RepairHarness h, String ws) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    if (h.chat.state.workspaceId == ws && !h.chat.state.isBusy) return;
  }
  expect(h.chat.state.workspaceId, ws);
  expect(
    h.chat.state.isBusy,
    isFalse,
    reason: 'Scope departure must not wait for the held creation response',
  );
}

void main() {
  for (final source in AssistantCreditSource.values) {
    testWidgets('first $source creation requires no manage PATCH', (
      tester,
    ) async {
      // Transport admits native create/send and denies explicit settings edits.
      // Production page, AssistantRepository and ChatRepository are used.
      final api = SettingsApi()..rejection = 403;
      final h = RepairHarness(api: api);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      expect(h.chat.state.creationOutcomeUnknown, isFalse);
      final shell = h.pageContext.read<AssistantShellCubit>();
      await tester.runAsync(() async {
        expect(await shell.setSelectedModel(selectedModel), isTrue);
        expect(await shell.setCreditSource(source), isTrue);
        await shell.setThinkingMode(AssistantThinkingMode.thinking);
      });
      final draft = h.composer(tester)..text = 'Authorized first turn';
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
      }
      expect(api.creates, 1);
      expect(h.chat.state.storedChatId, h.chat.state.fallbackChatId);
      expect(
        draft.text,
        isEmpty,
        reason:
            'creates=${api.creates}, patches=${api.patches}, '
            'sends=${h.repository.chats.sends}, error=${h.chat.state.error}',
      );
      expect(api.patches, 0);
      expect(h.repository.chats.sends, 1);
      expect(api.settings['modelId'], selectedModel.value);
      expect(api.settings['creditSource'], source.name);
      expect(
        api.settings['creditWsId'],
        source == AssistantCreditSource.personal
            ? '55555555-5555-4555-8555-555555555555'
            : repairWorkspace,
      );
      expect(api.settings['thinkingMode'], 'thinking');
      final confirmed = shell.state.selectedModel;
      await tester.runAsync(() async {
        expect(
          await shell.setSelectedModel(
            const AssistantGatewayModel(
              value: 'synthetic/model-c',
              label: 'Model C',
              provider: 'synthetic',
            ),
          ),
          isFalse,
        );
      });
      expect(
        api.patches,
        1,
        reason: 'Later explicit edits still require manage',
      );
      expect(shell.state.selectedModel, confirmed);
      await tester.pump();
      await tester.drainShadToastTimers();
    });
  }
  for (final failure in [
    'unknown',
    'missing',
    'actorUserId',
    'wsId',
    'conversationId',
    'modelId',
    'creditSource',
    'creditWsId',
    'thinkingMode',
  ]) {
    testWidgets('first creation $failure receipt retains draft and no retry', (
      tester,
    ) async {
      final api = InitialApi()
        ..unknown = failure == 'unknown'
        ..malformedField = failure == 'unknown' ? null : failure;
      final h = await fresh(tester, api);
      final draft = h.composer(tester);
      await send(tester, h, 'Keep this initial draft');
      expect(draft.text, 'Keep this initial draft');
      expect(api.creates, 1);
      expect(api.patches, 0);
      expect(h.repository.chats.sends, 0);
      expect(h.chat.state.storedChatId, isNull);
      expect(
        await h.repository.hasUnknownChatCreation(repairWorkspace),
        isTrue,
      );
      await send(tester, h, 'Keep this initial draft');
      expect(
        api.creates,
        1,
        reason: 'Unknown committed create is never replaced',
      );
      expect(h.repository.chats.sends, 0);
      await tester.drainShadToastTimers();
    });
  }
  for (final departure in ['actor ABA', 'workspace ABA', 'revision', 'close']) {
    testWidgets('first creation $departure never admits stale full receipt', (
      tester,
    ) async {
      final api = InitialApi()..creationGate = Completer<void>();
      final h = await fresh(tester, api);
      final shell = h.pageContext.read<AssistantShellCubit>();
      await send(tester, h, 'Retired first turn');
      expect(api.creationEntered.isCompleted, isTrue);
      if (departure == 'actor ABA') {
        final original = h.auth.state;
        h.auth.change(const AuthState.unauthenticated());
        await tester.pump();
        h.auth.change(original);
        await scopeReady(tester, h, repairWorkspace);
      } else if (departure == 'workspace ABA') {
        h.workspace.change('88888888-8888-4888-8888-888888888888');
        await scopeReady(tester, h, '88888888-8888-4888-8888-888888888888');
        h.workspace.change(repairWorkspace);
        await scopeReady(tester, h, repairWorkspace);
      } else if (departure == 'revision') {
        shell.restoreSelectedModel(shell.state.selectedModel);
      } else {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
      api.creationGate!.complete();
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
      }
      expect(h.repository.chats.sends, 0);
      expect(api.creates, 1);
      expect(api.patches, 0);
      expect(
        await h.repository.hasUnknownChatCreation(repairWorkspace),
        isTrue,
      );
      await tester.drainShadToastTimers();
    });
  }
}
