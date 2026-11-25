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
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/view/chat_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/pump_app.dart';
import 'chat_render_fixtures.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Realtime extends Mock implements ChatRealtimeClient {}

const _failure = "Couldn't finish that. Try again.";

/// Pumps Chat on a phone with the list showing and returns its repository.
Future<ChatFixtureRepository> _pumpList(
  WidgetTester tester, {
  List<ChatConversation>? conversations,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  final auth = _Auth();
  final workspace = _Workspace();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.authenticated(
      User(
        id: 'me',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-10-06T00:00:00Z',
      ),
    ),
  );
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      currentWorkspace: Workspace(id: 'ws-1', name: 'Synthetic'),
    ),
  );
  final api = ChatFixtureApi();
  when(() => api.getJson(any())).thenAnswer((_) async => {});
  when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
  final realtime = _Realtime();
  when(
    () => realtime.connect(any(), conversationId: any(named: 'conversationId')),
  ).thenAnswer((_) => const Stream.empty());
  when(realtime.dispose).thenReturn(null);
  final repository = ChatFixtureRepository(api, conversations: conversations);
  final router = GoRouter(
    initialLocation: Routes.chat,
    routes: [
      GoRoute(
        path: Routes.chat,
        builder: (context, state) => ChatPage(
          cubitFactory: (actor) => ChatCubit(
            repository: repository,
            realtimeClient: realtime,
            currentUserId: () => actor,
          ),
        ),
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
      child: app,
    ),
  );
  await tester.pumpAndSettle();
  return repository;
}

Future<void> _pullDown(WidgetTester tester) async {
  await tester.fling(
    find.byType(CustomScrollView).first,
    const Offset(0, 400),
    1000,
  );
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  setUpAll(() => registerFallbackValue(ChatArchivedFilter.active));
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('pull to refresh fetches from the server', (tester) async {
    final repository = await _pumpList(tester);
    expect(find.text('design-review'), findsOneWidget);
    expect(repository.forcedConversationLoads, 0);

    await _pullDown(tester);

    expect(repository.forcedConversationLoads, 1);
    expect(find.text('design-review'), findsOneWidget);
    expect(find.text(_failure), findsNothing);
    await tester.drainShadToastTimers();
  });

  testWidgets('a failed pull reports again on each identical failure', (
    tester,
  ) async {
    final repository = await _pumpList(tester, conversations: const []);
    repository.failForcedLoads = true;

    await _pullDown(tester);
    expect(find.text(_failure), findsOneWidget);
    await tester.drainShadToastTimers();
    expect(find.text(_failure), findsNothing);

    await _pullDown(tester);
    expect(repository.forcedConversationLoads, 2);
    expect(find.text(_failure), findsOneWidget);
    await tester.drainShadToastTimers();
  });
}
