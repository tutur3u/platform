import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/view/chat_page.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Chat extends MockCubit<ChatState> implements ChatCubit {}

ChatConversation _conversation(String id, String title) =>
    ChatConversation.fromJson({
      'id': id,
      'wsId': 'ws-1',
      'type': 'ai',
      'title': title,
    });

ChatMessage _message(String id, String conversationId, String content) =>
    ChatMessage(
      id: id,
      conversationId: conversationId,
      content: content,
      kind: ChatMessageKind.user,
      createdAt: DateTime(2026),
    );

final ChatMessage _hello = _message('hello', 'ai-1', 'Hello');
final _base = ChatState(
  wsId: 'ws-1',
  status: ChatStatus.loaded,
  messageStatus: ChatMessageStatus.loaded,
  conversations: [
    _conversation('ai-1', 'Assistant'),
    _conversation('ai-2', 'Planner'),
  ],
  messages: {
    'ai-1': [_hello],
    'ai-2': [_message('plan', 'ai-2', 'Plan ready')],
  },
  selectedConversationId: 'ai-1',
);

/// Pumps Chat in its two-pane layout and returns the controller that feeds
/// the page's cubit. [sidecar] mounts beside the app on the same cubit.
Future<StreamController<ChatState>> _pump(
  WidgetTester tester, {
  Widget Function(ChatCubit chat)? sidecar,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(1000, 900);
  addTearDown(tester.view.reset);
  final auth = _Auth();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.authenticated(
      User(
        id: 'alice',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-10-06T00:00:00Z',
      ),
    ),
  );
  final workspace = _Workspace();
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      currentWorkspace: Workspace(id: 'ws-1', name: 'Synthetic'),
    ),
  );
  final states = StreamController<ChatState>.broadcast();
  addTearDown(states.close);
  final chat = _Chat();
  whenListen(chat, states.stream, initialState: _base);
  when(
    () => chat.setWorkspace(
      any(),
      initialConversationId: any(named: 'initialConversationId'),
    ),
  ).thenAnswer((_) async {});
  when(() => chat.selectConversation(any())).thenAnswer((_) async {});
  final router = GoRouter(
    initialLocation: Routes.chatConversationPath('ai-1'),
    routes: [
      GoRoute(
        path: Routes.chat,
        builder: (_, _) =>
            shad.DrawerOverlay(child: ChatPage(cubitFactory: (_) => chat)),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpAppRouter(
    router,
    wrap: (app) => MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
      ],
      child: sidecar == null
          ? app
          : Directionality(
              textDirection: TextDirection.ltr,
              child: Stack(
                fit: StackFit.expand,
                children: [sidecar(chat), app],
              ),
            ),
    ),
  );
  await tester.pumpAndSettle();
  return states;
}

T _widget<T extends Widget>(WidgetTester tester) =>
    tester.widget<T>(find.byType(T));

ListView _messageList(WidgetTester tester) => tester.widget<ListView>(
  find.descendant(
    of: find.byType(ChatThreadView),
    matching: find.byType(ListView),
  ),
);

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('streamed tokens rebuild only the streaming bubble', (
    tester,
  ) async {
    // The page builder's configuration before buildWhen: every state runs it.
    var controlBuilds = 0;
    final states = await _pump(
      tester,
      sidecar: (chat) => BlocBuilder<ChatCubit, ChatState>(
        bloc: chat,
        builder: (_, _) {
          controlBuilds++;
          return const SizedBox.shrink();
        },
      ),
    );
    controlBuilds = 0;

    final page = _widget<ChatThreadView>(tester);
    final conversations = _widget<ChatConversationList>(tester);
    final text = StringBuffer();
    late ListView list;
    late Text helloText;
    var pageBuilds = 0;
    var conversationListBuilds = 0;
    var messageListBuilds = 0;
    for (var i = 0; i < 20; i++) {
      text.write('w$i ');
      states.add(_base.copyWith(streamingAssistantText: text.toString()));
      await tester.pump();
      if (!identical(_widget<ChatThreadView>(tester), page)) pageBuilds++;
      if (!identical(_widget<ChatConversationList>(tester), conversations)) {
        conversationListBuilds++;
      }
      if (i == 0) {
        // Starting a stream adds the bubble's slot to the message list once.
        list = _messageList(tester);
        helloText = tester.widget<Text>(find.text('Hello'));
      } else if (!identical(_messageList(tester), list)) {
        messageListBuilds++;
      }
      expect(find.text(text.toString()), findsOneWidget);
    }
    states.add(
      _base.copyWith(
        streamingAssistantText: text.toString(),
        typingUserIds: {'bob'},
      ),
    );
    await tester.pump();

    expect(controlBuilds, 21, reason: 'a builder without buildWhen');
    expect(identical(_widget<ChatThreadView>(tester), page), isTrue);
    expect(pageBuilds, 0);
    expect(conversationListBuilds, 0);
    expect(messageListBuilds, 0);
    expect(identical(tester.widget<Text>(find.text('Hello')), helloText), true);
    // The reversed list keeps the newest reply at the bottom, scrolled in.
    expect(
      tester.getCenter(find.text(text.toString())).dy,
      greaterThan(tester.getCenter(find.text('Hello')).dy),
    );
    final scrollable = tester.state<ScrollableState>(
      find.descendant(
        of: find.byWidget(_messageList(tester)),
        matching: find.byType(Scrollable),
      ),
    );
    expect(scrollable.position.pixels, 0);
  });

  testWidgets('the saved reply replaces the streaming bubble', (tester) async {
    final states = await _pump(tester);
    const reply = 'Here is the plan.';
    states.add(_base.copyWith(streamingAssistantText: reply));
    await tester.pump();
    final page = _widget<ChatThreadView>(tester);
    final saved = ChatMessage(
      id: 'reply',
      conversationId: 'ai-1',
      content: reply,
      kind: ChatMessageKind.assistant,
      createdAt: DateTime(2026),
    );
    states.add(
      _base.copyWith(
        messages: {
          ..._base.messages,
          'ai-1': [_hello, saved],
        },
        streamingAssistantText: reply,
      ),
    );
    await tester.pump();
    expect(identical(_widget<ChatThreadView>(tester), page), isFalse);
    expect(find.text(reply), findsNWidgets(2));

    states.add(
      _base.copyWith(
        messages: {
          ..._base.messages,
          'ai-1': [_hello, saved],
        },
        isSending: false,
        streamingAssistantText: '',
      ),
    );
    await tester.pump();
    expect(find.text(reply), findsOneWidget);
    expect(find.text('Hello'), findsOneWidget);
  });

  testWidgets('a stream error removes the partial bubble', (tester) async {
    final states = await _pump(tester);
    states.add(_base.copyWith(streamingAssistantText: 'Partial'));
    await tester.pump();
    expect(find.text('Partial'), findsOneWidget);
    states.add(
      _base.copyWith(
        error: 'stream failed',
        isSending: false,
        streamingAssistantText: '',
      ),
    );
    await tester.pump();
    expect(find.text('Partial'), findsNothing);
    expect(find.text('Hello'), findsOneWidget);
  });

  testWidgets('switching conversations mid-stream drops the bubble', (
    tester,
  ) async {
    final states = await _pump(tester);
    states.add(_base.copyWith(streamingAssistantText: 'Partial'));
    await tester.pump();
    states.add(
      _base.copyWith(
        selectedConversationId: 'ai-2',
        messageStatus: ChatMessageStatus.loaded,
        streamingAssistantText: '',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Partial'), findsNothing);
    expect(find.text('Plan ready'), findsOneWidget);
    expect(find.text('Hello'), findsNothing);
  });
}
