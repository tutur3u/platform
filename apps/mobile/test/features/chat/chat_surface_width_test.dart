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
  _Repository(_Api api) : super(apiClient: api);

  @override
  Future<ChatConversationPage> listConversations(
    String wsId, {
    ChatArchivedFilter archived = ChatArchivedFilter.active,
    int limit = 40,
    int offset = 0,
  }) async => ChatConversationPage(
    conversations: [
      ChatConversation.fromJson(const {
        'id': 'general',
        'wsId': 'ws-1',
        'type': 'channel',
        'title': 'General',
      }),
    ],
  );
}

class _Realtime extends Mock implements ChatRealtimeClient {}

const ValueKey<String> _pane = ValueKey('chat-conversation-pane');

/// Pumps Chat in a 1200dp window whose body is [bodyWidth] wide, as when the
/// navigation rail takes the leading edge.
Future<void> _pump(WidgetTester tester, double bodyWidth) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(1200, 900);
  addTearDown(tester.view.reset);
  final auth = _Auth();
  final workspace = _Workspace();
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
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      currentWorkspace: Workspace(id: 'ws-1', name: 'Synthetic'),
    ),
  );
  final api = _Api();
  when(() => api.getJson(any())).thenAnswer((_) async => {});
  final realtime = _Realtime();
  when(() => realtime.connect(any())).thenAnswer((_) => const Stream.empty());
  await tester.pumpApp(
    Align(
      alignment: Alignment.centerRight,
      child: SizedBox(
        width: bodyWidth,
        child: MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: ChatPage(
            cubitFactory: (actor) => ChatCubit(
              repository: _Repository(api),
              realtimeClient: realtime,
              currentUserId: () => actor,
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => registerFallbackValue(ChatArchivedFilter.active));
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('a body narrowed by the rail keeps the single-pane layout', (
    tester,
  ) async {
    await _pump(tester, 640);
    expect(find.text('General'), findsOneWidget);
    expect(find.byKey(_pane), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a wide body shows the list and thread side by side', (
    tester,
  ) async {
    await _pump(tester, 1000);
    expect(find.byKey(_pane), findsOneWidget);
    expect(tester.getSize(find.byKey(_pane)).width, 340);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
