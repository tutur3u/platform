import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class ReplyAuth extends Cubit<AuthState> implements AuthCubit {
  ReplyAuth()
    : super(
        const AuthState.authenticated(
          User(
            id: 'synthetic-actor',
            appMetadata: {},
            userMetadata: {},
            aud: 'authenticated',
            createdAt: '2030-01-01T00:00:00Z',
          ),
        ),
      );
  void change(AuthState value) => emit(value);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ReplyWorkspace extends Cubit<WorkspaceState> implements WorkspaceCubit {
  ReplyWorkspace()
    : super(
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'synthetic-ws', name: 'Workspace'),
        ),
      );
  void change(String id) => emit(
    WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: id, name: 'Workspace'),
    ),
  );
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ReplyRepository extends AssistantRepository {
  final stream = StreamController<AssistantStreamEvent>(sync: true);
  int starts = 0;
  int saves = 0;
  int ids = 0;
  @override
  String generateUuid() => 'synthetic-${ids++}';
  @override
  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async => 'synthetic-ws';
  @override
  Future<AssistantSoul> fetchSoul({bool forceRefresh = false}) async =>
      const AssistantSoul();
  @override
  Future<AssistantTasksInsight> fetchTasksInsight({
    required String wsId,
    required bool isPersonal,
    bool forceRefresh = false,
  }) async => const AssistantTasksInsight();
  @override
  Future<AssistantCalendarInsight> fetchCalendarInsight(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCalendarInsight();
  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCredits(remaining: 1000);
  @override
  Future<List<AssistantGatewayModel>> fetchGatewayModels({
    bool forceRefresh = false,
  }) async => const [];
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => const [];
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
  }) async => AssistantChatRecord(id: id, model: modelId);
  @override
  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
  }) {
    starts++;
    return stream.stream;
  }

  @override
  Future<Set<String>> fetchModelFavorites(String wsId) async => {};
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
  }) async => null;
  @override
  Future<void> writeAssistantChatCache({
    required String wsId,
    required String chatId,
    required AssistantRestoredChat restored,
  }) async {
    saves++;
  }
}

class BackgroundReplyHarness {
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final repository = ReplyRepository();
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = ShellDockSlotController();
  late AssistantChatCubit chat;
  late BuildContext pageContext;
  Future<void> mount(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (call) async => 'UTC',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (call) async => null,
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: actions),
        ],
        child: ShellDockScope(
          controller: dock,
          child: FloatingShellDock(
            location: '/assistant',
            bottomInset: 68,
            navigation: const SizedBox(height: 52),
            child: AssistantPage(
              repository: repository,
              preferences: AssistantPreferences(
                currentUserId: () => auth.state.user?.id,
              ),
              currentActor: () => auth.state.user?.id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
      await tester.tap(find.byType(AssistantComposerFab));
      await tester.pumpAndSettle();
    }
    pageContext = tester.element(find.byType(ShellDockPublisher));
    chat = pageContext.read<AssistantChatCubit>();
  }

  Future<void> send(WidgetTester tester) async {
    final composer = tester.widget<AssistantComposerDock>(
      find.byType(AssistantComposerDock),
    );
    composer.controller.text = 'Synthetic question';
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
    for (var attempt = 0; attempt < 8 && repository.starts == 0; attempt++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(
      repository.starts,
      1,
      reason:
          'status=${chat.state.status} error=${chat.state.error} '
          'queued=${chat.state.queuedMessages.length}',
    );
    repository.stream.add(const AssistantJsonStreamEvent({'type': 'start'}));
    await tester.pump();
  }

  Future<void> dispose(WidgetTester tester) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(const SizedBox.shrink());
    if (repository.stream.hasListener) {
      unawaited(repository.stream.close());
    } else {
      unawaited(repository.stream.close());
    }
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      null,
    );
    await tester.pump();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      null,
    );
    await auth.close();
    await workspace.close();
    await chrome.close();
    await actions.close();
    dock.dispose();
  }
}
