import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import 'assistant_settings_repair_harness.dart';

void main() {
  testWidgets('page retains draft when new conversation is denied', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(
      tester,
      initialPreferences: {
        '$repairActor::mira-dashboard-workspace-context-$repairWorkspace':
            'personal',
      },
    );
    final controller = h.composer(tester);
    await h.chat.openChatById(repairWorkspace, repairChat);
    await tester.pumpAndSettle();
    controller.text = 'Unsent draft';
    final before = controller.value;
    await h.startNew(tester);
    expect(controller.value, before);
    expect(h.chat.state.storedChatId, repairChat);
    expect(h.repository.starts, 0);
  });
  testWidgets('legacy page offers informed recovery before creation', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(
      tester,
      initialPreferences: {
        '$repairActor::mira-dashboard-workspace-context-$repairWorkspace':
            'personal',
      },
    );
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    expect(h.chat.state.storedChatId, isNull);
    h.composer(tester).text = 'First draft';
    await h.startNew(tester);
    expect(find.byType(AppDialog), findsOneWidget);
    final controller = h.composer(tester);
    expect(controller.text, 'First draft');
    expect(h.repository.starts, 0);
    await tester.tap(find.widgetWithText(AppButton, 'Start a new chat'));
    await tester.pumpAndSettle();
    expect(h.chat.state.creationOutcomeUnknown, isFalse);
    expect(await h.repository.hasUnknownChatCreation(repairWorkspace), isFalse);
    expect(controller.text, isEmpty);
  });
  for (final change in ['model', 'credits']) {
    testWidgets('page $change hook keeps actual send settings aligned', (
      tester,
    ) async {
      final h = RepairHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await h.chat.openChatById(repairWorkspace, repairChat);
      final shell = h.pageContext.read<AssistantShellCubit>();
      if (change == 'credits') {
        expect(shell.state.workspaceCreditLocked, isFalse);
      }
      h.repository.api.settings = {
        'conversationId': repairChat,
        'modelId': shell.state.selectedModel.value,
        'creditSource': shell.state.creditSource.name,
        'thinkingMode': shell.state.thinkingMode.name,
        'creditWsId': repairWorkspace,
      };
      await tester.runAsync(() async {
        if (change == 'model') {
          await shell.setSelectedModel(
            const AssistantGatewayModel(
              value: 'synthetic/model-b',
              label: 'Model B',
              provider: 'synthetic',
            ),
          );
        } else {
          await shell.setCreditSource(AssistantCreditSource.personal);
        }
        // Exercise the real repository's settings GET and native stream path.
        final events = h.repository.streamChat(
          chatId: repairChat,
          wsId: repairWorkspace,
          workspaceContextId: 'personal',
          modelId: shell.state.selectedModel.value,
          messages: const [
            AssistantMessage(
              id: repairActor,
              clientRequestId: repairActor,
              role: 'user',
              parts: [AssistantMessagePart(type: 'text', text: 'Follow up')],
            ),
          ],
          thinkingMode: shell.state.thinkingMode,
          creditSource: shell.state.creditSource,
          creditWsId: shell.state.creditSource == AssistantCreditSource.personal
              ? shell.state.personalWorkspaceId
              : repairWorkspace,
          timezone: 'UTC',
        );
        final received = await events.toList();
        expect(
          received.whereType<AssistantJsonStreamEvent>().any(
            (event) => event.payload['type'] == 'saved-user-message',
          ),
          isTrue,
        );
        expect(h.repository.chats.sends, 1);
      });
      expect(h.repository.api.patches, 1);
    });
  }
}
