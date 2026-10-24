import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
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
            id: '33333333-3333-4333-8333-333333333333',
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
          currentWorkspace: Workspace(
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Workspace',
          ),
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
  ReplyRepository({ApiClient? apiClient})
    : super(apiClient: apiClient ?? _ReplySettingsApi());
  @override
  String? get currentActorId => '33333333-3333-4333-8333-333333333333';
  // This synthetic repository models an explicitly acknowledged creation scope.
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async => false;

  final stream = StreamController<AssistantStreamEvent>(sync: true);
  final replacement = StreamController<AssistantStreamEvent>(sync: true);
  Completer<void>? cancelGate;
  bool cancellationEntered = false;
  void holdCancellation() {
    cancelGate = Completer<void>();
    stream.onCancel = () {
      cancellationEntered = true;
      return cancelGate!.future;
    };
  }

  int starts = 0;
  int saves = 0;
  int ids = 0;
  @override
  String generateUuid() =>
      'aaaaaaaa-aaaa-4aaa-8aaa-${(++ids).toString().padLeft(12, '0')}';
  @override
  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async => '22222222-2222-4222-8222-222222222222';
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
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
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
    ApiMutationAdmission? admission,
  }) {
    final target = starts++ == 0 ? stream : replacement;
    final user = messages.lastWhere((message) => message.role == 'user');
    final requestId = user.clientRequestId!;
    final text = user.parts
        .where((part) => part.type == 'text')
        .map((part) => part.text ?? '')
        .join('\n\n')
        .trim();
    final priorListen = target.onListen;
    target.onListen = () {
      priorListen?.call();
      scheduleMicrotask(() {
        if (!target.isClosed) {
          target.add(
            AssistantJsonStreamEvent({
              'type': 'saved-user-message',
              'clientRequestId': requestId,
              'messageId':
                  'bbbbbbbb-bbbb-4bbb-8bbb-'
                  '${ids.toString().padLeft(12, '0')}',
              'text': text,
              'nativeReceipt': {
                'actorId': currentActorId,
                'workspaceId': wsId,
                'chatId': chatId,
                'requestId': requestId,
                'messageId':
                    'bbbbbbbb-bbbb-4bbb-8bbb-'
                    '${ids.toString().padLeft(12, '0')}',
                'text': text,
                'attachments': attachments
                    .map(
                      (a) => {
                        'path': a.storagePath,
                        'name': a.name,
                        'type': a.type,
                        'size': a.size,
                      },
                    )
                    .toList(),
              },
            }),
          );
        }
      });
    };
    return target.stream;
  }

  @override
  Future<Set<String>> fetchModelFavorites(String wsId) async => {};
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
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
  BackgroundReplyHarness({ReplyRepository? repository})
    : repository = repository ?? ReplyRepository();
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final ReplyRepository repository;
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = ShellDockSlotController();
  late AssistantChatCubit chat;
  late BuildContext pageContext;
  Future<void> mount(WidgetTester tester, {VoidCallback? onFirstFrame}) async {
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
    onFirstFrame?.call();
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

  void pause(WidgetTester tester) {
    const [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
    ].forEach(tester.binding.handleAppLifecycleStateChanged);
  }

  void resume(WidgetTester tester) {
    if (tester.binding.lifecycleState == AppLifecycleState.paused) {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    }
    if (tester.binding.lifecycleState == AppLifecycleState.hidden) {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    }
    if (tester.binding.lifecycleState != AppLifecycleState.resumed) {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    }
  }

  Future<void> dispose(WidgetTester tester) async {
    if (repository.cancelGate case final gate? when !gate.isCompleted) {
      gate.complete();
    }
    unawaited(repository.replacement.close());
    resume(tester);
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

// Synthetic server receipt for tests whose subject is page reply lifecycle.
class _ReplySettingsApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> patchJsonAcknowledged(
    String path,
    Map<String, dynamic> body, {
    required String actorId,
    required bool Function() isCurrent,
  }) async {
    if (!isCurrent()) throw StateError('Synthetic departed settings selection');
    final segments = Uri.parse(path).pathSegments;
    return {
      'settings': {'conversationId': segments[segments.length - 2], ...body},
    };
  }
}
