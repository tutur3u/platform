import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  late ActionsRepository repository;
  late AssistantChatCubit cubit;

  setUp(() async {
    repository = ActionsRepository(ActionsApi());
    final preferences = ActionsPreferences();
    when(
      () => preferences.saveChatId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    cubit = actionsCubit(repository, preferences);
  });
  tearDown(() async {
    await cubit.close();
    await repository.frames.close();
  });

  test('a saved Mira reply names its conversation and message', () async {
    for (final chat in [
      actionChat,
      'ai-chat-$actionChat',
      'legacy-ai-$actionChat',
    ]) {
      await cubit.openChatById(actionWorkspace, chat);
      expect(cubit.replyReportTarget(actionMessage), (
        wsId: actionWorkspace,
        conversationId: chat,
        messageId: actionMessage,
      ));
    }
  });

  test('a reply without a persisted id cannot be reported', () async {
    repository.rows = [actionRow.copyWith(isPersisted: false)];
    await cubit.openChatById(actionWorkspace, actionChat);
    expect(cubit.replyReportTarget(actionMessage), isNull);
  });

  test('only Mira replies are reportable', () async {
    repository.rows = [
      const AssistantMessage(
        id: actionMessage,
        role: 'user',
        isPersisted: true,
        parts: [AssistantMessagePart(type: 'text', text: 'Question')],
      ),
    ];
    await cubit.openChatById(actionWorkspace, actionChat);
    expect(cubit.replyReportTarget(actionMessage), isNull);
    expect(cubit.replyReportTarget(actionOther), isNull);
  });
}
