import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/view/chat_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Api extends Mock implements ApiClient {}

class _Repository extends ChatRepository {
  _Repository(this.api) : super(apiClient: api);
  final _Api api;
  late Future<ChatConversationPage> Function() read;
  @override
  Future<ChatConversationPage> listConversations(
    String wsId, {
    ChatArchivedFilter archived = ChatArchivedFilter.active,
    int limit = 40,
    int offset = 0,
  }) => read();
}

class _Realtime extends Mock implements ChatRealtimeClient {}

AuthState authenticated(String id) => AuthState.authenticated(
  User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '2026-10-06T00:00:00Z',
  ),
);
ChatConversationPage page(String title) => ChatConversationPage(
  conversations: [
    ChatConversation.fromJson({
      'id': title,
      'wsId': 'same-workspace',
      'type': 'channel',
      'title': title,
    }),
  ],
);

_Repository _repository() {
  final api = _Api();
  when(() => api.getJson(any())).thenAnswer((_) async => {});
  return _Repository(api);
}

_Realtime _realtime({Stream<ChatRealtimeEvent>? events}) {
  final client = _Realtime();
  when(
    () => client.connect(any()),
  ).thenAnswer((_) => events ?? const Stream.empty());
  return client;
}

void main() {
  setUpAll(() => registerFallbackValue(ChatArchivedFilter.active));
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  testWidgets('same workspace actor change replaces the actual Chat host', (
    tester,
  ) async {
    final auth = _Auth();
    final workspace = _Workspace();
    final authEvents = StreamController<AuthState>();
    whenListen(auth, authEvents.stream, initialState: authenticated('alice'));
    when(() => workspace.state).thenReturn(
      const WorkspaceState(
        currentWorkspace: Workspace(id: 'same-workspace', name: 'Synthetic'),
      ),
    );
    when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
    final created = <(String?, ChatCubit)>[];
    final bobRead = Completer<ChatConversationPage>();
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: ChatPage(
          cubitFactory: (actor) {
            final repo = _repository()
              ..read = () => actor == 'bob'
                  ? bobRead.future
                  : Future.value(page('Alice chat'));
            final cubit = ChatCubit(
              repository: repo,
              realtimeClient: _realtime(),
              currentUserId: () => auth.state.user?.id,
            );
            created.add((actor, cubit));
            return cubit;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Alice chat'), findsOneWidget);
    authEvents.add(const AuthState.unauthenticated());
    await tester.pump();
    await tester.pump();
    expect(created.map((item) => item.$1), ['alice', null]);
    expect(created.last.$2.state.status, ChatStatus.initial);
    expect(find.text('Alice chat'), findsNothing);
    authEvents.add(authenticated('bob'));
    await tester.pump();
    await tester.pump();
    expect(created.map((item) => item.$1), ['alice', null, 'bob']);
    expect(find.text('Alice chat'), findsNothing);
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    expect(created.first.$2.isClosed, isTrue);
    bobRead.complete(page('Bob chat'));
    await tester.pumpAndSettle();
    expect(find.text('Bob chat'), findsOneWidget);
    expect(find.text('Alice chat'), findsNothing);
    final previousBob = created.last.$2;
    // No intermediate frame: equal actor IDs still represent a new lifetime.
    authEvents
      ..add(const AuthState.unauthenticated())
      ..add(authenticated('bob'));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(created.last.$1, 'bob');
    expect(created.last.$2, isNot(same(previousBob)));
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    expect(previousBob.isClosed, isTrue);
    expect(find.text('Bob chat'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await authEvents.close();
  });

  test(
    'close fences pending callbacks before subscription cancellation ends',
    () async {
      final repo = _repository();
      final read = Completer<ChatConversationPage>();
      final entered = Completer<void>();
      var calls = 0;
      repo.read = () {
        if (++calls == 1) return Future.value(page('Current'));
        entered.complete();
        return read.future;
      };
      final cancelled = Completer<void>();
      final finishCancel = Completer<void>();
      final events = StreamController<ChatRealtimeEvent>(
        onCancel: () {
          cancelled.complete();
          return finishCancel.future;
        },
      );
      final cubit = ChatCubit(
        repository: repo,
        realtimeClient: _realtime(events: events.stream),
      );
      await cubit.setWorkspace('same-workspace');
      final refresh = cubit.refresh();
      await entered.future;
      final closing = cubit.close();
      await cancelled.future;
      read.complete(page('Stale'));
      await refresh;
      expect(cubit.state.conversations.map((row) => row.id), ['Current']);
      finishCancel.complete();
      await closing;
      await events.close();
    },
  );

  test('changed actor blocks a delayed conversation result', () async {
    var actor = 'alice';
    final repo = _repository();
    final read = Completer<ChatConversationPage>();
    repo.read = () => read.future;
    final cubit = ChatCubit(
      repository: repo,
      realtimeClient: _realtime(),
      currentUserId: () => actor,
    );
    final loading = cubit.setWorkspace('same-workspace');
    await Future<void>.delayed(Duration.zero);
    actor = 'bob';
    read.complete(page('Alice private'));
    await loading;
    expect(cubit.state.conversations, isEmpty);
    verifyNever(() => repo.api.getJson(any()));
    await cubit.close();
  });
}
