import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';
import 'chat_cubit_fixture.dart';

const _found = '33333333-3333-4333-8333-333333333333';

Map<String, dynamic> _foundJson() => {
  'id': _found,
  'wsId': fixtureWs,
  'type': 'channel',
  'title': 'Lĩnh ops',
  'updatedAt': '2026-11-20T09:00:00Z',
};

ChatConversationMember _member(String userId, DateTime? readAt) =>
    ChatConversationMember(
      id: 'member-$userId',
      conversationId: threadId,
      userId: userId,
      user: ChatUserProfile(id: userId, displayName: userId),
      role: 'member',
      lastReadAt: readAt,
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  setUp(() => harness = CubitHarness());
  tearDown(() => harness.dispose());

  List<String> conversationQueries() => [
    for (final call in verify(
      () => harness.api.getJson(
        captureAny(that: allOf(contains('/conversations?'), contains('q='))),
      ),
    ).captured)
      Uri.parse(call as String).queryParameters['q']!,
  ];

  group('conversation search', () {
    setUp(() {
      when(
        () => harness.api.getJson(any(that: contains('/conversations?'))),
      ).thenAnswer(
        (_) async => {
          'conversations': [_foundJson()],
          'canModerate': false,
        },
      );
    });

    test('asks the server once typing pauses', () async {
      await harness.open();
      harness.cubit
        ..search('li')
        ..search('lin');
      await Future<void>.delayed(
        ChatCubitSearch.debounce + const Duration(milliseconds: 50),
      );
      await harness.settle();

      expect(conversationQueries(), ['lin']);
      expect(harness.cubit.state.conversationSearchResults?.single.id, _found);
    });

    test('a one-character query clears results without a request', () async {
      await harness.open();
      await harness.cubit.searchMessages('lin');
      expect(harness.cubit.state.conversationSearchResults, isNotEmpty);
      // Marks the search above as seen, so only later requests count.
      expect(conversationQueries(), ['lin']);

      harness.cubit.search('l');
      await Future<void>.delayed(
        ChatCubitSearch.debounce + const Duration(milliseconds: 50),
      );
      await harness.settle();
      expect(harness.cubit.state.conversationSearchResults, isNull);
      verifyNever(
        () => harness.api.getJson(
          any(that: allOf(contains('/conversations?'), contains('q='))),
        ),
      );
    });

    test('opening a result that is not loaded adds it to the list', () async {
      await harness.open();
      await harness.cubit.searchMessages('lin');
      await harness.cubit.openSearchResult(_found);
      await harness.settle();

      expect(harness.cubit.state.selectedConversationId, _found);
      expect(harness.cubit.state.selectedConversation?.title, 'Lĩnh ops');
    });

    test('a failed search falls back to the loaded list', () async {
      when(
        () => harness.api.getJson(any(that: contains('/conversations?'))),
      ).thenThrow(StateError('offline'));
      await harness.open();
      await harness.cubit.searchMessages('design');
      expect(harness.cubit.state.conversationSearchResults, isNull);
    });
  });

  group('moderation', () {
    test('the list flag allows deleting others in server threads', () async {
      harness.repository.canModerate = true;
      await harness.open();
      expect(harness.cubit.state.canModerate, isTrue);
      expect(harness.cubit.state.canModerateSelected, isTrue);

      harness.repository.canModerate = false;
      await harness.cubit.refresh(fresh: true);
      expect(harness.cubit.state.canModerateSelected, isFalse);
    });

    test('an assistant conversation is never moderated here', () async {
      harness.repository
        ..canModerate = true
        ..conversations = [
          fixtureConversation(threadId).copyWith(type: ChatConversationType.ai),
        ];
      await harness.open();
      expect(harness.cubit.state.canModerateSelected, isFalse);
    });

    Future<void> pumpThread(WidgetTester tester, {required bool moderator}) {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      return tester.pumpApp(
        ChatThreadView(
          conversation: fixtureConversation(threadId),
          messages: [fixtureMessage(1)],
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
          onDeleteMessage: (_) async {},
          isMessageSynced: (_) => true,
          canDeleteOthers: moderator,
        ),
      );
    }

    for (final moderator in [true, false]) {
      testWidgets(
        "others' messages offer Delete only to moderators ($moderator)",
        (tester) async {
          await pumpThread(tester, moderator: moderator);
          await tester.longPress(find.text('message 1'));
          await tester.pumpAndSettle();
          expect(
            find.text('Delete message'),
            moderator ? findsOneWidget : findsNothing,
          );
        },
      );
    }
  });

  test('a conversation payload never moves a read cursor back', () async {
    final read = fixtureStart.add(const Duration(hours: 1));
    harness.repository.conversations = [
      fixtureConversation(
        threadId,
      ).copyWith(members: [_member('me', null), _member('ada', read)]),
    ];
    await harness.open();

    // An update built before Ada's cursor moved.
    harness.inbox.add(
      ChatRealtimeConversationEvent(
        type: 'conversation.updated',
        conversation: fixtureConversation(threadId).copyWith(
          title: 'renamed',
          members: [_member('me', null), _member('ada', fixtureStart)],
        ),
      ),
    );
    await harness.settle();

    final conversation = harness.cubit.state.conversations.firstWhere(
      (item) => item.id == threadId,
    );
    expect(conversation.title, 'renamed');
    expect(
      conversation.members
          .firstWhere((member) => member.userId == 'ada')
          .lastReadAt,
      read,
    );
  });
}
