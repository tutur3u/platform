import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_blocked_people_sheet.dart';
import 'package:mobile/features/chat/widgets/chat_safety_actions.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';
import 'chat_cubit_fixture.dart';
import 'chat_safety_fixture.dart';

const _blocksPath = '/api/v1/workspaces/$fixtureWs/chat/blocks';
const _reportsPath = '/api/v1/workspaces/$fixtureWs/chat/reports';
const _ada = ChatUserProfile(id: 'ada', displayName: 'Ada');
const _grace = ChatUserProfile(id: 'grace', displayName: 'Grace');

ChatMessage _from(int n, ChatUserProfile sender) =>
    fixtureMessage(n, sender: sender.id).copyWith(sender: sender);

ChatMessage _assistant(int n) => ChatMessage(
  id: messageId(n),
  conversationId: threadId,
  content: 'assistant $n',
  kind: ChatMessageKind.assistant,
  createdAt: fixtureStart.add(Duration(minutes: n)),
);

/// The open thread as the chat page renders it, with safety actions.
Widget _thread(ChatCubit cubit) => BlocProvider.value(
  value: cubit,
  child: BlocBuilder<ChatCubit, ChatState>(
    builder: (context, state) => ChatThreadView(
      conversation: state.selectedConversation,
      messages: state.visibleSelectedMessages,
      messageStatus: state.messageStatus,
      currentUserId: 'me',
      pendingAttachments: const [],
      streamingAssistantText: '',
      isSending: state.isSending,
      isUploadingAttachment: false,
      onSend: cubit.sendMessage,
      onPickAttachment: (_) async {},
      onRemoveAttachment: (_) {},
      onReaction: (_, _) {},
      isMessageSynced: (_) => true,
      composerBlocked: state.isSelectedComposerBlocked,
      onSafetyAction: (message, action) => openChatSafetyAction(
        context,
        cubit: cubit,
        message: message,
        action: action,
      ),
    ),
  ),
);

void _phone(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
}

/// Lets toasts and their timers finish before the test ends.
Future<void> _drainToasts(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  setUp(() {
    harness = CubitHarness();
    when(() => harness.api.deleteJson(any())).thenAnswer((_) async => {});
    harness.repository.onListMessages = (_, _) async => [
      _from(1, _ada),
      _from(2, const ChatUserProfile(id: 'me', displayName: 'Me')),
      _from(3, _grace),
    ];
  });
  tearDown(() => harness.dispose());

  group('message actions', () {
    Future<List<(ChatMessage, ChatSafetyAction)>> pumpList(
      WidgetTester tester,
    ) async {
      _phone(tester);
      final calls = <(ChatMessage, ChatSafetyAction)>[];
      await tester.pumpApp(
        ChatThreadView(
          conversation: fixtureConversation(threadId),
          messages: [
            _from(1, _ada),
            _from(2, const ChatUserProfile(id: 'me', displayName: 'Me')),
            _assistant(3),
          ],
          messageStatus: ChatMessageStatus.loaded,
          currentUserId: 'me',
          pendingAttachments: const [],
          streamingAssistantText: '',
          isSending: false,
          isUploadingAttachment: false,
          onSend: (_) {},
          onPickAttachment: (_) async {},
          onRemoveAttachment: (_) {},
          onReaction: (_, _) {},
          isMessageSynced: (_) => true,
          onSafetyAction: (message, action) => calls.add((message, action)),
        ),
      );
      return calls;
    }

    testWidgets("others' messages offer report and block", (tester) async {
      final calls = await pumpList(tester);
      await tester.longPress(find.text('message 1'));
      await tester.pumpAndSettle();

      expect(find.text('Report message'), findsOneWidget);
      expect(find.text('Report Ada'), findsOneWidget);
      expect(find.text('Block Ada'), findsOneWidget);

      await tester.tap(find.text('Report message'));
      await tester.pumpAndSettle();
      expect(calls.single.$1.id, messageId(1));
      expect(calls.single.$2, ChatSafetyAction.reportMessage);
    });

    for (final content in ['message 2', 'assistant 3']) {
      testWidgets('$content offers no report or block', (tester) async {
        await pumpList(tester);
        await tester.longPress(
          find.textContaining(content, findRichText: true).first,
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('chat-safety-reportMessage')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('chat-safety-blockSender')),
          findsNothing,
        );
      });
    }
  });

  testWidgets('the report sheet posts the report and confirms', (tester) async {
    _phone(tester);
    when(() => harness.api.postJson(_reportsPath, any()))
        .thenAnswer((_) async => {'reportId': 'r-1', 'blocked': true});
    await tester.runAsync(harness.open);
    await tester.pumpApp(_thread(harness.cubit));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('message 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Report message'));
    await tester.pumpAndSettle();

    final details = find.descendant(
      of: find.byKey(const ValueKey('chat-report-details')),
      matching: find.byType(TextField),
    );
    expect(
      tester.widget<TextField>(details).decoration?.hintText,
      'Tell us what happened',
    );
    final send = find.byKey(const ValueKey('chat-report-send'));
    expect(tester.widget<AppButton>(send).onPressed, isNull);

    await tester.ensureVisible(
      find.byKey(const ValueKey('chat-report-reason-harassment')),
    );
    await tester.tap(
      find.byKey(const ValueKey('chat-report-reason-harassment')),
    );
    await tester.ensureVisible(details);
    await tester.enterText(details, '  Keeps sending threats  ');
    await tester.pumpAndSettle();
    await tester.tap(send);
    await tester.pumpAndSettle();

    final payload =
        verify(() => harness.api.postJson(_reportsPath, captureAny()))
                .captured
                .single
            as Map<String, dynamic>;
    expect(payload, {
      'subjectType': 'message',
      'conversationId': threadId,
      'messageId': messageId(1),
      'reason': 'harassment',
      'details': 'Keeps sending threats',
      'alsoBlock': true,
    });
    expect(find.text('Report sent'), findsOneWidget);
    expect(find.text('message 1'), findsNothing);
    await _drainToasts(tester);
  });

  testWidgets('a user report can leave blocking unchecked', (tester) async {
    _phone(tester);
    when(() => harness.api.postJson(_reportsPath, any()))
        .thenAnswer((_) async => {'reportId': 'r-2', 'blocked': false});
    await tester.runAsync(harness.open);
    await tester.pumpApp(_thread(harness.cubit));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('message 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Report Ada'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chat-report-reason-spam')));
    final alsoBlock = find.byKey(const ValueKey('chat-report-also-block'));
    await tester.ensureVisible(alsoBlock);
    await tester.tap(alsoBlock);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('chat-report-send')));
    await tester.pumpAndSettle();

    final payload =
        verify(() => harness.api.postJson(_reportsPath, captureAny()))
                .captured
                .single
            as Map<String, dynamic>;
    expect(payload, {
      'subjectType': 'user',
      'reportedUserId': 'ada',
      'reason': 'spam',
      'alsoBlock': false,
    });
    expect(find.text('message 1'), findsOneWidget);
    await _drainToasts(tester);
  });

  testWidgets('blocking from a direct chat hides them and the composer', (
    tester,
  ) async {
    _phone(tester);
    harness.repository.conversations = [directWith('ada')];
    await tester.runAsync(harness.open);
    await tester.pumpApp(_thread(harness.cubit));
    await tester.pumpAndSettle();
    expect(find.text("You can't message this person"), findsNothing);

    await tester.longPress(find.text('message 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Block Ada'));
    await tester.pumpAndSettle();
    expect(find.text('Block Ada?'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('chat-block-confirm')));
    await tester.pumpAndSettle();

    verify(() => harness.api.postJson(_blocksPath, {'userId': 'ada'}))
        .called(1);
    expect(find.text('Ada blocked'), findsOneWidget);
    expect(find.text('message 1'), findsNothing);
    expect(find.text("You can't message this person"), findsOneWidget);

    // Realtime events are not filtered by the server.
    await tester.runAsync(() async {
      harness.inbox
        ..add(
          ChatRealtimeMessageEvent(
            type: 'message.created',
            message: _from(4, _ada),
          ),
        )
        ..add(
          ChatRealtimeMessageEvent(
            type: 'message.created',
            message: _from(5, _grace),
          ),
        );
      await harness.settle();
    });
    await tester.pumpAndSettle();
    expect(find.text('message 4'), findsNothing);
    expect(find.text('message 5'), findsOneWidget);
    await _drainToasts(tester);
  });

  testWidgets('a send refused as chat_blocked explains it inline', (
    tester,
  ) async {
    _phone(tester);
    final repository = BlockedSendRepository(harness.api)
      ..conversations = [directWith('ada')];
    final cubit = ChatCubit(
      repository: repository,
      realtimeClient: harness.realtime,
      currentUserId: () => 'me',
    );
    addTearDown(cubit.close);
    await tester.runAsync(() async {
      await cubit.setWorkspace(fixtureWs, initialConversationId: threadId);
      await harness.settle();
    });
    await tester.pumpApp(_thread(cubit));
    await tester.pumpAndSettle();
    expect(find.text("You can't message this person"), findsNothing);

    await tester.enterText(find.byType(TextField), 'hello');
    await tester.pump();
    await tester.tap(find.byTooltip('Send message'));
    await tester.pumpAndSettle();

    expect(find.text("You can't message this person"), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('the blocked people list unblocks', (tester) async {
    _phone(tester);
    when(() => harness.api.getJson(_blocksPath)).thenAnswer(
      (_) async => {
        'blocks': [
          {'userId': 'ada', 'displayName': 'Ada', 'createdAt': null},
        ],
      },
    );
    await tester.pumpApp(
      ChatBlockedPeopleSheet(wsId: fixtureWs, repository: harness.repository),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ada'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('chat-unblock-ada')));
    await tester.pumpAndSettle();

    verify(() => harness.api.deleteJson('$_blocksPath/ada')).called(1);
    expect(find.byKey(const ValueKey('chat-blocked-ada')), findsNothing);
    expect(find.text('No one is blocked'), findsOneWidget);
    await _drainToasts(tester);
  });
}
