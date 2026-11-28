import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

import 'chat_cubit_fixture.dart';
import 'chat_safety_fixture.dart';

const _blocksPath = '/api/v1/workspaces/$fixtureWs/chat/blocks';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  setUp(() {
    harness = CubitHarness();
    when(() => harness.api.deleteJson(any())).thenAnswer((_) async => {});
    harness.repository.onListMessages = (_, _) async => [
      fixtureMessage(1),
      fixtureMessage(2, sender: 'me'),
      fixtureMessage(3, sender: 'grace'),
    ];
  });
  tearDown(() => harness.dispose());

  test('loads the blocked set when chat opens and hides them', () async {
    when(() => harness.api.getJson(_blocksPath)).thenAnswer(
      (_) async => {
        'blocks': [
          {
            'userId': 'ada',
            'displayName': 'Ada',
            'avatarUrl': null,
            'createdAt': '2026-11-20T09:00:00Z',
          },
        ],
      },
    );
    await harness.open();

    final state = harness.cubit.state;
    expect(state.blockedUserIds, {'ada'});
    expect(state.selectedMessages, hasLength(3));
    expect(state.visibleSelectedMessages.map((message) => message.senderId), [
      'me',
      'grace',
    ]);
  });

  test('blocking posts the user and hides later realtime messages', () async {
    await harness.open();
    await harness.cubit.blockUser(
      const ChatUserProfile(id: 'ada', displayName: 'Ada'),
    );

    verify(() => harness.api.postJson(_blocksPath, {'userId': 'ada'}))
        .called(1);
    expect(harness.cubit.state.visibleSelectedMessages.map((m) => m.senderId), [
      'me',
      'grace',
    ]);

    harness.inbox
      ..add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(4),
        ),
      )
      ..add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(5, sender: 'grace'),
        ),
      );
    await harness.settle();

    final ids = harness.cubit.state.selectedMessages.map((m) => m.id);
    expect(ids, isNot(contains(messageId(4))));
    expect(ids, contains(messageId(5)));
  });

  test('blocked people are left out of directory, search and requests', () {
    ChatFriendRequest request(String id, String from) => ChatFriendRequest(
      id: id,
      requesterUserId: from,
      recipientUserId: 'me',
      requester: ChatUserProfile(id: from, displayName: from),
      recipient: const ChatUserProfile(id: 'me', displayName: 'me'),
      status: ChatFriendRequestStatus.pending,
    );
    final state = ChatState(
      directoryResults: const [
        ChatUserProfile(id: 'ada', displayName: 'Ada'),
        ChatUserProfile(id: 'grace', displayName: 'Grace'),
      ],
      searchResults: [
        fixtureMessage(1),
        fixtureMessage(3, sender: 'grace'),
      ],
      friendRequests: ChatFriendRequests(
        incoming: [request('r-ada', 'ada'), request('r-grace', 'grace')],
      ),
      blockedUsers: const [ChatBlockedUser(userId: 'ada')],
    );

    expect(state.visibleDirectoryResults.map((user) => user.id), ['grace']);
    expect(state.visibleSearchResults.map((m) => m.senderId), ['grace']);
    expect(state.visibleFriendRequests.incoming.map((r) => r.id), ['r-grace']);
  });

  test('a blocked direct chat disables the composer after blocking', () async {
    harness.repository.conversations = [directWith('ada')];
    await harness.open();
    expect(harness.cubit.state.isSelectedComposerBlocked, isFalse);

    await harness.cubit.blockUser(
      const ChatUserProfile(id: 'ada', displayName: 'Ada'),
    );
    expect(harness.cubit.state.isSelectedComposerBlocked, isTrue);

    await harness.cubit.unblockUser('ada');
    verify(() => harness.api.deleteJson('$_blocksPath/ada')).called(1);
    expect(harness.cubit.state.isSelectedComposerBlocked, isFalse);
  });

  test('a send refused as chat_blocked marks the chat blocked', () async {
    final repository = BlockedSendRepository(harness.api)
      ..conversations = [directWith('ada')];
    final cubit = ChatCubit(
      repository: repository,
      realtimeClient: harness.realtime,
      currentUserId: () => 'me',
    );
    addTearDown(cubit.close);
    await cubit.setWorkspace(fixtureWs, initialConversationId: threadId);
    await harness.settle();

    await cubit.sendMessage('hello');
    await harness.settle();

    expect(cubit.state.isSelectedComposerBlocked, isTrue);
    expect(cubit.state.isSending, isFalse);
    expect(cubit.state.error, isNull);
  });

  test('a report with alsoBlock adds the sender to the blocked set', () async {
    when(
      () => harness.api.postJson(
        '/api/v1/workspaces/$fixtureWs/chat/reports',
        any(),
      ),
    ).thenAnswer((_) async => {'reportId': 'r-1', 'blocked': true});
    await harness.open();

    final receipt = await harness.cubit.submitReport(
      ChatReportDraft.message(
        conversationId: threadId,
        messageId: messageId(1),
        reason: ChatReportReason.spam,
        alsoBlock: true,
      ),
      subject: const ChatUserProfile(id: 'ada', displayName: 'Ada'),
    );

    expect(receipt, (reportId: 'r-1', blocked: true));
    expect(harness.cubit.state.blockedUserIds, {'ada'});
  });
}
