import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import '../../../helpers/helpers.dart';
import 'assistant_settings_repair_harness.dart';

const _model = AssistantGatewayModel(
  value: 'synthetic/model-b',
  label: 'Model B',
  provider: 'synthetic',
);

Future<
  ({RepairHarness h, AssistantShellCubit shell, TextEditingController draft})
>
_setup(WidgetTester tester, {SettingsApi? api}) async {
  final h = RepairHarness(api: api);
  addTearDown(() => h.dispose(tester));
  await h.mount(tester);
  final draft = h.composer(tester);
  await h.chat.openChatById(repairWorkspace, repairChat);
  final shell = h.pageContext.read<AssistantShellCubit>();
  h.repository.api.settings = {
    'conversationId': repairChat,
    'modelId': shell.state.selectedModel.value,
    'creditSource': shell.state.creditSource.name,
    'thinkingMode': shell.state.thinkingMode.name,
    'creditWsId': repairWorkspace,
  };
  draft.text = 'Retained draft';
  return (h: h, shell: shell, draft: draft);
}

void main() {
  for (final failure in ['401', '403', 'malformed', 'uncertain']) {
    for (final kind in ['model', 'credits']) {
      testWidgets('$kind $failure retains confirmed settings and draft', (
        tester,
      ) async {
        final api = SettingsApi()
          ..rejection = int.tryParse(failure)
          ..malformed = failure == 'malformed'
          ..uncertain = failure == 'uncertain';
        final f = await _setup(tester, api: api);
        final previous = f.shell.state;
        final previousDraft = f.draft.value;
        await tester.runAsync(() async {
          final accepted = kind == 'model'
              ? await f.shell.setSelectedModel(_model)
              : await f.shell.setCreditSource(AssistantCreditSource.personal);
          expect(accepted, isFalse);
        });
        expect(f.shell.state.selectedModel, previous.selectedModel);
        expect(f.shell.state.creditSource, previous.creditSource);
        expect(f.draft.value, previousDraft);
        expect(api.patches, 1);
        expect(f.h.repository.chats.sends, 0);
        await tester.pump();
        await tester.drainShadToastTimers();
      });
    }
  }
  for (final departure in [
    'chat ABA',
    'workspace ABA',
    'actor ABA',
    'revision',
    'close',
  ]) {
    testWidgets('held settings ACK cannot publish after $departure', (
      tester,
    ) async {
      final api = SettingsApi()..gate = Completer<void>();
      final f = await _setup(tester, api: api);
      final priorModel = f.shell.state.selectedModel;
      final selecting = f.shell.setSelectedModel(_model);
      await tester.pump();
      expect(api.patches, 1);
      expect(f.shell.state.selectedModel, priorModel);
      if (departure == 'chat ABA') {
        await f.h.chat.openChatById(
          repairWorkspace,
          '88888888-8888-4888-8888-888888888888',
        );
        await f.h.chat.openChatById(repairWorkspace, repairChat);
      } else if (departure == 'workspace ABA') {
        f.h.workspace.change('88888888-8888-4888-8888-888888888888');
        await tester.pumpAndSettle();
        f.h.workspace.change(repairWorkspace);
        await tester.pumpAndSettle();
      } else if (departure == 'actor ABA') {
        final original = f.h.auth.state;
        f.h.auth.change(const AuthState.unauthenticated());
        await tester.pump();
        f.h.auth.change(original);
        await tester.pumpAndSettle();
      } else if (departure == 'revision') {
        f.shell.restoreSelectedModel(priorModel);
      } else {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
      final currentDraft = f.draft.value;
      api.gate!.complete();
      await tester.runAsync(() async => expect(await selecting, isFalse));
      if (!f.shell.isClosed) expect(f.shell.state.selectedModel, priorModel);
      // Actor/workspace departure owns its separate draft-reset semantics.
      if (departure != 'close') expect(f.draft.value, currentDraft);
      expect(api.patches, 1);
      expect(f.h.repository.chats.sends, 0);
      await tester.drainShadToastTimers();
    });
  }
  testWidgets(
    'overlapping explicit selection does not dispatch a second PATCH',
    (tester) async {
      final api = SettingsApi()..gate = Completer<void>();
      final f = await _setup(tester, api: api);
      final first = f.shell.setSelectedModel(_model);
      await tester.pump();
      expect(api.patches, 1);
      expect(
        await f.shell.setCreditSource(AssistantCreditSource.personal),
        isFalse,
      );
      api.gate!.complete();
      await tester.runAsync(() async => expect(await first, isTrue));
      expect(api.patches, 1);
      expect(f.shell.state.selectedModel, _model);
      expect(f.draft.text, 'Retained draft');
    },
  );
  for (final failInitialization in [false, true]) {
    final label = failInitialization
        ? 'edit denial does not block creation'
        : 'creation ACK admits send';
    testWidgets('first chat settings initialization $label', (tester) async {
      final api = SettingsApi();
      final h = RepairHarness(api: api);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      expect(h.chat.state.creationOutcomeUnknown, isFalse);
      final shell = h.pageContext.read<AssistantShellCubit>();
      await tester.runAsync(() async {
        expect(await shell.setSelectedModel(_model), isTrue);
      });
      expect(api.patches, 0, reason: 'No conversation exists to mutate yet');
      api.rejection = failInitialization ? 403 : null;
      final controller = h.composer(tester)..text = 'First draft';
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      for (var attempt = 0; attempt < 10; attempt++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
      }
      expect(
        controller.text,
        isEmpty,
        reason:
            'creates=${api.creates} patches=${api.patches} '
            'state=${h.chat.state.status} error=${h.chat.state.error}',
      );
      expect(api.creates, 1);
      expect(api.patches, 0);
      expect(h.chat.state.storedChatId, h.chat.state.fallbackChatId);
      expect(h.repository.chats.sends, 1);
      await tester.pump();
      await tester.drainShadToastTimers();
    });
  }
}
