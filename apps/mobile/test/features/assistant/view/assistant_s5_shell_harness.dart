import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/pump_app.dart';
import 'background_reply_harness.dart';

const _activeId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const _workspaceId = '22222222-2222-4222-8222-222222222222';
const archiveId = 'ai-chat-bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const ValueKey<String> assistantBoundary = ValueKey(
  'assistant-render-boundary',
);

void setUpAssistantShellHarness() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await supa.Supabase.initialize(
      url: 'https://synthetic.supabase.test',
      publishableKey: 'synthetic-test-key',
      authOptions: const supa.FlutterAuthClientOptions(
        autoRefreshToken: false,
        detectSessionInUri: false,
        localStorage: supa.EmptyLocalStorage(),
      ),
    );
  });
  tearDownAll(() => supa.Supabase.instance.dispose());
}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class AssistantShellFixtureRepository extends ReplyRepository {
  final archived = <String>[];
  static DateTime now() => DateTime(2030, 4, 3, 14, 30);

  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [
    AssistantChatRecord(
      id: _activeId,
      title: 'Launch follow-up',
      preview: 'I drafted the next steps for the launch.',
      updatedAt: now(),
    ),
    if (!archived.contains(archiveId))
      AssistantChatRecord(
        id: archiveId,
        title: 'Team check-in notes',
        preview: 'Review the interview feedback with Lan.',
        updatedAt: DateTime(2030, 4, 3, 9, 5),
      ),
    AssistantChatRecord(
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003',
      title: 'Sprint planning for the April release',
      preview: 'A summary of this week’s priorities.',
      updatedAt: DateTime(2030, 4, 2, 11, 25),
    ),
  ];

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId, title: 'Launch follow-up'),
    messages: [
      AssistantMessage(
        id: 'user-fixture',
        role: 'user',
        createdAt: DateTime(2030, 4, 3, 14, 25),
        parts: const [
          AssistantMessagePart(
            type: 'text',
            text: 'What should I follow up on for the launch?',
          ),
        ],
      ),
      const AssistantMessage(
        id: 'mira-fixture',
        role: 'assistant',
        parts: [
          AssistantMessagePart(
            type: 'dynamic-tool',
            toolName: 'create_task',
            toolCallId: 'launch-task',
            state: 'output-available',
            input: {'title': 'Review the launch checklist'},
            output: {'message': 'Task created'},
          ),
          AssistantMessagePart(
            type: 'text',
            text:
                'I drafted the next steps for the launch.\n\n'
                '- Review the launch checklist.\n'
                '- Ask Lan to confirm the handoff.',
          ),
        ],
      ),
    ],
    attachmentsByMessageId: const {},
  );

  @override
  Future<void> archiveHistoryChat(String wsId, AssistantChatRecord chat) async {
    expect(wsId, _workspaceId);
    archived.add(chat.id);
  }
}

Future<GoRouter> pumpAssistantShell(
  WidgetTester tester, {
  required AssistantShellFixtureRepository repository,
  String initialLocation = Routes.assistant,
  Brightness brightness = Brightness.light,
  SorbetTheme? sorbet,
  String? storedId = _activeId,
}) async {
  SharedPreferences.setMockInitialValues({});
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final profile = _Profile();
  final tabs = AppTabCubit(settingsRepository: SettingsRepository());
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(),
  );
  final preferences = AssistantPreferences(
    currentUserId: () => auth.state.user?.id,
  );
  if (storedId != null) await preferences.saveChatId(_workspaceId, storedId);
  final messenger = tester.binding.defaultBinaryMessenger;
  const record = MethodChannel('com.llfbandit.record/messages');
  messenger.setMockMethodCallHandler(record, (_) async => null);
  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          assistantConversationsEnabled: true,
          enableDebugLogs: false,
          assistantPageBuilder: (token) => AssistantPage(
            replayToken: token,
            shellLocation: state.uri.path,
            conversationsClock: AssistantShellFixtureRepository.now,
            repository: repository,
            preferences: preferences,
            currentActor: () => auth.state.user?.id,
          ),
          child: child,
        ),
        routes: [
          for (final path in [Routes.assistant, Routes.assistantConversations])
            GoRoute(
              path: path,
              builder: (_, _) => routedTestPage(const SizedBox.shrink()),
            ),
        ],
      ),
    ],
  );
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
    messenger.setMockMethodCallHandler(record, null);
    await auth.close();
    await workspace.close();
    await profile.close();
    await tabs.close();
  });
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<ShellProfileCubit>.value(value: profile),
        BlocProvider.value(value: tabs),
        BlocProvider(create: (_) => AssistantChromeCubit()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        BlocProvider(create: (_) => ShellMiniNavCubit()),
        BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      ],
      child: routedSorbetTestApp(
        router: router,
        locale: const Locale('en'),
        brightness: brightness,
        sorbet: sorbet,
        boundaryKey: assistantBoundary,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}
