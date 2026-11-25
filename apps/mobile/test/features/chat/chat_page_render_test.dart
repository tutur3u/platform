import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
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

import '../../helpers/design_render_harness.dart';
import '../../helpers/pump_app.dart';
import 'chat_render_fixtures.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Realtime extends Mock implements ChatRealtimeClient {}

const _sizes = {
  'phone': Size(390, 844),
  'tablet': Size(834, 1194),
  'desktop': Size(1440, 900),
};

Future<void> _pumpChat(
  WidgetTester tester, {
  required Size size,
  required Brightness brightness,
  String? conversationId,
  bool fail = false,
}) async {
  DesignRender.setSize(tester, size);
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
  when(() => api.getJson(any())).thenAnswer(
    (invocation) async =>
        (invocation.positionalArguments.first as String).contains(
          '/attachments/',
        )
        ? {'signedUrl': 'https://example.invalid/file'}
        : <String, dynamic>{},
  );
  when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
  final realtime = _Realtime();
  when(
    () => realtime.connect(any(), conversationId: any(named: 'conversationId')),
  ).thenAnswer((_) => const Stream.empty());
  when(realtime.dispose).thenReturn(null);
  final router = GoRouter(
    initialLocation: conversationId == null
        ? Routes.chat
        : Routes.chatConversationPath(conversationId),
    routes: [
      GoRoute(
        path: Routes.chat,
        // The shell paints the page background in the app.
        builder: (context, state) => ColoredBox(
          color: AppTokens.of(context).colorScheme.background,
          child: ChatPage(
            cubitFactory: (actor) => ChatCubit(
              repository: ChatFixtureRepository(api, failConversations: fail),
              realtimeClient: realtime,
              currentUserId: () => actor,
            ),
          ),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpAppRouter(
    router,
    brightness: brightness,
    wrap: (app) => RepaintBoundary(
      key: DesignRenderApp.boundaryKey,
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: app,
      ),
    ),
  );
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUpAll(() async {
    registerFallbackValue(ChatArchivedFilter.active);
    await DesignRender.loadFonts();
  });
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  for (final size in _sizes.entries) {
    for (final brightness in Brightness.values) {
      final name = '${size.key}-${brightness.name}';

      testWidgets('chat inbox renders at $name', (tester) async {
        await _pumpChat(tester, size: size.value, brightness: brightness);
        expect(tester.takeException(), isNull);
        expect(find.text('design-review'), findsWidgets);
        await DesignRender.capture(tester, 'chat-inbox-$name');
        await tester.pumpWidget(const SizedBox.shrink());
      });

      testWidgets('chat thread renders at $name', (tester) async {
        await _pumpChat(
          tester,
          size: size.value,
          brightness: brightness,
          conversationId: 'design',
        );
        expect(tester.takeException(), isNull);
        expect(find.textContaining('Shipping it to QA'), findsWidgets);
        await DesignRender.capture(tester, 'chat-thread-$name');
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets('chat error state renders', (tester) async {
    await _pumpChat(
      tester,
      size: _sizes['tablet']!,
      brightness: Brightness.light,
      fail: true,
    );
    expect(tester.takeException(), isNull);
    await DesignRender.capture(tester, 'chat-error-tablet-light');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
