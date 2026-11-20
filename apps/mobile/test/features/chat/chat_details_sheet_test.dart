import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_sheets.dart';

import '../../helpers/design_render_harness.dart';

const _me = ChatUserProfile(id: 'me', displayName: 'Me');
const _ada = ChatUserProfile(id: 'ada', displayName: 'Ada Lovelace');

ChatConversation _direct() {
  return ChatConversation(
    id: 'direct',
    wsId: 'workspace',
    type: ChatConversationType.direct,
    updatedAt: DateTime.utc(2026, 11, 20, 1, 50),
    title: 'Studio',
    memberCount: 2,
    members: const [
      ChatConversationMember(
        id: 'member-me',
        conversationId: 'direct',
        userId: 'me',
        user: _me,
        role: 'member',
      ),
      ChatConversationMember(
        id: 'member-ada',
        conversationId: 'direct',
        userId: 'ada',
        user: _ada,
        role: 'member',
      ),
    ],
  );
}

Future<ChatCubit> _pump(
  WidgetTester tester, {
  required ChatConversation conversation,
  required Widget sheet,
  bool canManageChat = false,
  Map<String, dynamic> metadata = const {},
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  final cubit = ChatCubit(currentUserId: () => 'me');
  addTearDown(cubit.close);
  cubit.emit(
    ChatState(
      wsId: 'workspace',
      status: ChatStatus.loaded,
      canManageChat: canManageChat,
      conversations: [conversation.copyWith(metadata: metadata)],
      selectedConversationId: conversation.id,
      messages: {
        conversation.id: const [
          ChatMessage(
            id: 'agenda',
            conversationId: 'direct',
            content: 'Today agenda',
            kind: ChatMessageKind.user,
          ),
          ChatMessage(
            id: 'notes',
            conversationId: 'direct',
            content: 'Bring the notes',
            kind: ChatMessageKind.user,
          ),
        ],
      },
      sharedContent: const ChatSharedContent(),
    ),
  );
  await tester.pumpWidget(
    DesignRenderApp(
      settings: DesignRender.themes['light']!.$1,
      brightness: Brightness.light,
      child: BlocProvider<ChatCubit>.value(value: cubit, child: sheet),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return cubit;
}

void main() {
  setUpAll(DesignRender.loadFonts);

  testWidgets('direct details use one header and search loaded messages', (
    tester,
  ) async {
    final conversation = _direct();
    await _pump(
      tester,
      conversation: conversation,
      sheet: const ChatDetailsSheet(currentUserId: 'me'),
    );

    expect(find.text('Details'), findsNothing);
    expect(find.text('Studio'), findsOneWidget);
    expect(find.text('2 members'), findsOneWidget);
    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(find.text('Mute notifications'), findsOneWidget);
    expect(find.text('Leave chat'), findsOneWidget);
    expect(find.text('No shared content yet.'), findsOneWidget);
    expect(find.text('Today agenda'), findsNothing);

    await tester.enterText(find.byType(EditableText), 'agenda');
    await tester.pump();

    expect(find.text('Today agenda'), findsOneWidget);
    expect(find.text('Bring the notes'), findsNothing);
    expect(find.text('Ada Lovelace'), findsNothing);
    expect(find.text('Studio'), findsOneWidget);

    await tester.enterText(find.byType(EditableText), '');
    await tester.pump();
    final leave = find.text('Leave chat');
    await tester.ensureVisible(leave);
    await tester.pump();
    await tester.tap(leave);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(
      find.text(
        'You stop seeing this chat. Messages stay for the other people.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a managed channel deletes and does not offer leave', (
    tester,
  ) async {
    final conversation = ChatConversation(
      id: 'channel',
      wsId: 'workspace',
      type: ChatConversationType.channel,
      updatedAt: DateTime.utc(2026, 11, 20, 1, 50),
      title: 'Announcements',
      memberCount: 1,
      members: const [
        ChatConversationMember(
          id: 'member-me',
          conversationId: 'channel',
          userId: 'me',
          user: _me,
          role: 'admin',
        ),
      ],
    );
    await _pump(
      tester,
      conversation: conversation,
      canManageChat: true,
      sheet: const ChatDetailsSheet(currentUserId: 'me'),
    );

    expect(find.text('Leave chat'), findsNothing);
    expect(find.text('Delete conversation'), findsOneWidget);
    expect(find.text('Details'), findsNothing);
  });

  testWidgets('a read-only agent hides mute and destructive actions', (
    tester,
  ) async {
    await _pump(
      tester,
      conversation: _direct(),
      metadata: const {'source': 'ai-agent', 'readOnly': true},
      sheet: const ChatDetailsSheet(currentUserId: 'me'),
    );

    expect(find.text('Mute notifications'), findsNothing);
    expect(find.text('Leave chat'), findsNothing);
    expect(find.text('Delete conversation'), findsNothing);
    expect(find.text('Studio'), findsOneWidget);
  });
}
