import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';
import '../assistant/consent/mira_ai_consent_fakes.dart';
import 'chat_cubit_fixture.dart';

const ValueKey<String> _sheet = ValueKey('mira-consent-sheet');

ChatConversation _conversation(ChatConversationType type) => ChatConversation(
  id: threadId,
  wsId: fixtureWs,
  type: type,
  title: 'design',
  updatedAt: fixtureStart,
);

/// Answers every send the way the server does without Mira AI consent.
class _ConsentRefusingRepository extends CubitFixtureRepository {
  _ConsentRefusingRepository(super.api);

  int sends = 0;

  @override
  Stream<ChatMessageStreamEvent> sendMessageStream(
    String wsId,
    String conversationId, {
    required String content,
    ChatMessageKind kind = ChatMessageKind.user,
    List<ChatAttachmentDraft> attachments = const [],
    String? replyToMessageId,
    String? clientRequestId,
    bool miraMode = false,
    ApiMutationAdmission? admission,
  }) async* {
    sends++;
    throw const ApiException(
      message: miraAiConsentRequiredCode,
      statusCode: 403,
      code: miraAiConsentRequiredCode,
    );
  }
}

/// The open thread as the chat page renders it, with the app's consent.
Widget _thread(ChatCubit cubit, MiraAiConsentController consent) =>
    RepositoryProvider.value(
      value: MiraAiConsentProvision(consent),
      child: BlocProvider.value(
        value: cubit,
        child: BlocBuilder<ChatCubit, ChatState>(
          builder: (context, state) => ChatThreadView(
            conversation: state.selectedConversation,
            messages: state.visibleSelectedMessages,
            messageStatus: state.messageStatus,
            currentUserId: 'me',
            pendingAttachments: state.pendingAttachments,
            streamingAssistantText: '',
            isSending: state.isSending,
            isUploadingAttachment: false,
            onSend: cubit.sendMessage,
            onPickAttachment: (_) async {},
            onRemoveAttachment: (_) {},
            onReaction: (_, _) {},
            isMessageSynced: (_) => true,
            heldDraft:
                state.heldDraft?.conversationId == state.selectedConversationId
                ? state.heldDraft?.text
                : null,
            onHeldDraftTaken: cubit.takeHeldDraft,
          ),
        ),
      ),
    );

Finder get _field => find.descendant(
  of: find.byType(ChatComposer),
  matching: find.byType(EditableText),
);

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(_field, text);
  await tester.pump();
}

Future<void> _send(WidgetTester tester) async {
  await tester.tap(find.byIcon(LucideIcons.arrowUp));
  await tester.pumpAndSettle();
}

String _draft(WidgetTester tester) =>
    tester.widget<EditableText>(_field).controller.text;

void main() {
  late CubitHarness harness;
  late FakeMiraAiConsentRepository consent;
  late MiraAiConsentController controller;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    harness = CubitHarness();
    consent = FakeMiraAiConsentRepository();
    controller = fakeConsentController(consent);
  });
  tearDown(() async {
    controller.dispose();
    await harness.dispose();
  });

  testWidgets('an AI conversation asks first; Not now sends nothing', (
    tester,
  ) async {
    harness.repository.conversations = [_conversation(ChatConversationType.ai)];
    await tester.runAsync(harness.open);
    await tester.pumpApp(_thread(harness.cubit, controller));
    await tester.pumpAndSettle();

    await _type(tester, 'Hello Mira');
    await _send(tester);
    expect(find.byKey(_sheet), findsOneWidget);
    expect(harness.repository.sentReplyIds, isEmpty);

    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(find.byKey(_sheet), findsNothing);
    expect(harness.repository.sentReplyIds, isEmpty);
    expect(_draft(tester), 'Hello Mira');
    expect(consent.saves, isEmpty);

    await _send(tester);
    await tester.tap(find.byKey(const ValueKey('mira-consent-allow')));
    await tester.pumpAndSettle();
    await tester.runAsync(harness.settle);
    await tester.pump();
    expect(consent.saves, [(granted: true, source: 'mobile_mira_prompt')]);
    expect(harness.repository.sentReplyIds, hasLength(1));
    expect(_draft(tester), isEmpty);
  });

  for (final type in [
    ChatConversationType.channel,
    ChatConversationType.direct,
    ChatConversationType.group,
  ]) {
    testWidgets('a ${type.name} conversation is never gated', (tester) async {
      harness.repository.conversations = [_conversation(type)];
      await tester.runAsync(harness.open);
      await tester.pumpApp(_thread(harness.cubit, controller));
      await tester.pumpAndSettle();

      await _type(tester, 'Hello team');
      await _send(tester);
      await tester.runAsync(harness.settle);
      await tester.pump();
      expect(find.byKey(_sheet), findsNothing);
      expect(harness.repository.sentReplyIds, hasLength(1));
      expect(consent.fetches, 0);
    });
  }

  testWidgets('a server consent refusal hands the draft back and asks again', (
    tester,
  ) async {
    consent.server = const MiraAiConsent(granted: true);
    final repository = _ConsentRefusingRepository(harness.api)
      ..conversations = [_conversation(ChatConversationType.ai)];
    final cubit = ChatCubit(
      repository: repository,
      realtimeClient: harness.realtime,
      currentUserId: () => 'me',
      now: () => harness.now,
    );
    addTearDown(cubit.close);
    await tester.runAsync(() async {
      await controller.refresh();
      await cubit.setWorkspace(fixtureWs, initialConversationId: threadId);
      await harness.settle();
    });
    await tester.pumpApp(_thread(cubit, controller));
    await tester.pumpAndSettle();

    await _type(tester, 'Hello Mira');
    await _send(tester);
    await tester.runAsync(harness.settle);
    await tester.pumpAndSettle();

    expect(repository.sends, 1);
    expect(controller.granted, isFalse);
    expect(cubit.state.isSending, isFalse);
    expect(cubit.state.heldDraft, isNull);
    expect(_draft(tester), 'Hello Mira');
    expect(find.byKey(_sheet), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(repository.sends, 1, reason: 'A refused send never re-sends.');
  });
}
