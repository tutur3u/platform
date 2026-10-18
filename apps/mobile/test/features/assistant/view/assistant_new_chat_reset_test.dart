import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_history_sheet_body.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_slot.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

import '../../../helpers/helpers.dart';
import 'background_reply_harness.dart';

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '22222222-2222-4222-8222-222222222222';
const _other = '55555555-5555-4555-8555-555555555555';
const _saved = '44444444-4444-4444-8444-444444444444';
const _liveSaved = 'ai-chat-44444444-4444-4444-8444-444444444444';
const _sessionPath =
    '/api/v1/live/session?wsId=$_workspace&scopeKey=synthetic-scope';
const _envelopeKey = '$_actor::mira-conversation-envelope::v1::$_workspace';

void main() {
  testWidgets('Unheld reset skips consent', (tester) async {
    final h = await _mount(tester, held: false);
    await h.openHistory(tester);
    await h.begin(tester);
    expect(find.byType(AlertDialog), findsNothing);
    expect(h.host.writes, 2);
    expect(h.chat.state.storedChatId, isNull);
    expect(h.controller.text, isEmpty);
    expect(tester.takeException(), isNull);
  });
  for (final choice in ['Cancel', 'Check history']) {
    testWidgets('History $choice retains origin', (tester) async {
      final h = await _mount(tester);
      final draft = h.controller.value;
      final attachments = h.chat.state.composerAttachments;
      await h.openHistory(tester);
      await h.begin(tester);
      expect(h.host.writes, 0);
      await tester.tap(find.widgetWithText(TextButton, choice));
      await tester.pumpAndSettle();
      expect(h.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      expect(h.chat.state.storedChatId, _saved);
      expect(await h.preferences.loadChatId(_workspace), _saved);
      expect(h.host.writes, 0);
      expect(find.byType(AssistantHistorySheetBody), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('Cancel retains live presentation', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    await h.openHistory(tester);
    h.chrome.enterLiveMode(); // Synthetic presentation; no provider session.
    await tester.pumpAndSettle();
    await h.begin(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
    await tester.pumpAndSettle();
    expect(h.chrome.state.isLiveMode, isTrue);
    expect(h.controller.value, draft);
    expect(h.chat.state.storedChatId, _saved);
    expect(h.host.writes, 0);
    expect(find.byType(AssistantHistorySheetBody), findsOneWidget);
  });
  testWidgets('Actor ABA refuses stale consent', (tester) async {
    final h = await _mount(tester);
    await h.openHistory(tester);
    await h.begin(tester);
    final original = h.auth.state;
    h.auth.change(const AuthState.unauthenticated());
    await tester.pump();
    h.auth.change(original);
    await tester.pumpAndSettle();
    final afterScopeTransition = h.controller.value;
    await h.confirm(tester);
    expect(h.host.writes, 0);
    expect(h.controller.value, afterScopeTransition);
    expect(tester.takeException(), isNull);
  });
  testWidgets('Duplicate actions require one consent', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    await h.openHistory(tester);
    final newConversation = tester
        .widget<IconButton>(
          find.widgetWithIcon(IconButton, Icons.add_comment_outlined),
        )
        .onPressed!;
    // Invoke the actual drawer caller twice before presentation can mask it.
    newConversation();
    newConversation();
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(h.host.writes, 0);
    await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
    await tester.pumpAndSettle();
    expect(h.controller.value, draft);
    expect(h.host.writes, 0);
  });
  testWidgets('Edited draft keeps committed-stale UI', (tester) async {
    final h = await _mount(tester);
    h.host.holdAt = 2;
    final attachments = h.chat.state.composerAttachments;
    await h.openHistory(tester);
    await h.begin(tester);
    await h.confirm(tester);
    expect(h.host.entered.isCompleted, isTrue);
    h.controller.text = 'Synthetic newer draft';
    h.host.release.complete();
    await tester.pumpAndSettle();
    expect(h.controller.text, 'Synthetic newer draft');
    expect(h.chat.state.storedChatId, _saved);
    expect(h.chat.state.composerAttachments, attachments);
    expect(h.host.writes, 2);
    expect(
      find.textContaining('reset was saved for the earlier context'),
      findsOneWidget,
    );
    expect(find.byType(AssistantHistorySheetBody), findsOneWidget);
  });
  testWidgets('Changed hold rejects prior consent', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    await h.openHistory(tester);
    await h.begin(tester);
    await h.host.replaceHeldRecord();
    await h.confirm(tester);
    expect(h.host.writes, 0);
    expect(h.controller.value, draft);
    expect(h.chat.state.storedChatId, _saved);
    expect(find.textContaining('A new chat was not started'), findsOneWidget);
  });
  testWidgets('Observed hold ABA rejects consent', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    final attachments = h.chat.state.composerAttachments;
    await h.openHistory(tester);
    await h.begin(tester);
    await h.host.replaceHeldRecord();
    expect(await h.preferences.loadChatId(_workspace), _saved);
    await h.host.replaceHeldRecord(revision: 1);
    await h.confirm(tester);
    expect(h.host.writes, 0);
    expect(h.controller.value, draft);
    expect(h.chat.state.composerAttachments, attachments);
    expect(h.chat.state.storedChatId, _saved);
    expect(find.textContaining('A new chat was not started'), findsOneWidget);
  });
  testWidgets('Unreadable hold retains origin', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    final attachments = h.chat.state.composerAttachments;
    await h.openHistory(tester);
    h.host.unreadable = true;
    await h.begin(tester);
    expect(find.widgetWithText(FilledButton, 'Start a new chat'), findsNothing);
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(h.host.writes, 0);
    expect(h.controller.value, draft);
    expect(h.chat.state.composerAttachments, attachments);
    expect(h.chat.state.storedChatId, _saved);
    expect(
      find.textContaining('The reset could not be confirmed'),
      findsOneWidget,
    );
    h.host.unreadable = false;
  });
  testWidgets('Same-scope lock replacement denies', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    final attachments = h.chat.state.composerAttachments;
    await h.openHistory(tester);
    await h.begin(tester);
    await tester.runAsync(() async {
      h.lockRelease = Completer<void>();
      h.lockWork = AssistantResetPreferences.serialized(_envelopeKey, () async {
        await h.lockRelease!.future;
        await h.host.replaceHeldRecord();
        h.lockCompleted = true;
      });
    });
    await h.confirm(tester);
    await tester.runAsync(() async {
      h.lockRelease!.complete();
      await h.lockWork;
    });
    await tester.pumpAndSettle();
    expect(h.lockCompleted, isTrue);
    expect(h.host.writes, 0);
    expect(h.controller.value, draft);
    expect(h.chat.state.composerAttachments, attachments);
    expect(h.chat.state.storedChatId, _saved);
    expect(find.textContaining('A new chat was not started'), findsOneWidget);
  });
  testWidgets('Drawer cleanup failure is committed', (tester) async {
    final h = await _mount(tester);
    h.host.holdAt = 2;
    await h.openHistory(tester);
    await h.begin(tester);
    await h.confirm(tester);
    expect(h.host.entered.isCompleted, isTrue);
    await tester.tap(find.byIcon(Icons.close_rounded).hitTestable());
    await tester.pumpAndSettle();
    h.host.release.complete();
    await tester.pumpAndSettle();
    expect(h.chat.state.storedChatId, isNull);
    expect(await h.preferences.loadChatId(_workspace), isNull);
    expect(h.controller.text, isEmpty);
    expect(h.host.writes, 2);
    expect(
      find.textContaining('reset was saved, but finishing this screen failed'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
  for (final mode
      in 'failure| history| history ABA| context ABA| '
              'ACK committed| ACK false| ACK throw| '
              'ACK B| ACK ABA| ACK no-op| ACK legacy'
          .split('| ')) {
    testWidgets('Real reset boundary: $mode', (tester) async {
      final ack = mode.startsWith('ACK');
      final fault = mode == 'ACK false' || mode == 'ACK throw';
      final current = mode == 'ACK committed';
      final api = _CleanupApi(
        hold: !ack && mode != 'failure',
        fail: mode == 'failure',
      );
      final h = await _mount(tester, api: api);
      final messenger = tester.binding.defaultBinaryMessenger;
      const pcm = MethodChannel('flutter_pcm_sound/methods');
      final pcmCalls = <String>[];
      messenger.setMockMethodCallHandler(pcm, (call) async {
        pcmCalls.add(call.method);
        if (call.method == 'setup') {
          throw PlatformException(code: 'synthetic-audio-admission');
        }
        return true;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(pcm, null));
      addTearDown(() {
        if (!api.release.isCompleted) api.release.complete();
      });
      final element = tester.element(find.byType(ShellDockPublisher));
      final live = element.read<AssistantLiveCubit>();
      final shell = element.read<AssistantShellCubit>();
      var networkAttempts = 0;
      var preparationCompleted = false;
      final preparing = HttpOverrides.runZoned(
        () => live.prepareSession(wsId: _workspace, chatId: _saved),
        createHttpClient: (_) {
          networkAttempts++;
          throw StateError('Provider connection forbidden in this fixture');
        },
      ).whenComplete(() => preparationCompleted = true);
      await tester.pumpAndSettle();
      expect(preparationCompleted, isTrue);
      await preparing;
      expect(pcmCalls, contains('setup'));
      expect(live.state.status, AssistantLiveConnectionStatus.error);
      expect(live.state.scopeKey, 'synthetic-scope');
      expect(live.state.error, contains('synthetic-audio-admission'));
      expect(networkAttempts, 0);
      expect(api.posts, 1);
      final baseline = h.host.writes;
      expect(baseline, 1);
      final before = h.chat.state;
      final draft = h.controller.value;
      if (ack) h.host.holdAt = baseline + 2;
      if (fault) {
        h.host.faultAt = baseline + 2;
        h.host.throws = mode == 'ACK throw';
      }
      await h.openHistory(tester);
      h.chrome.enterLiveMode();
      await tester.pumpAndSettle();
      await h.begin(tester);
      await h.confirm(tester);
      expect(h.host.writes - baseline, 2);
      final resetIds = h.repository.ids;
      final saves = <Future<void>>[];
      Future<bool>? legacyReset;
      var userWrites = 0;
      String? selected;
      if (ack) {
        expect(h.host.entered.isCompleted, isTrue);
        expect(h.controller.value, draft);
        expect(h.chat.state.composerAttachments, before.composerAttachments);
        expect(h.chat.state.storedChatId, _liveSaved);
        if (!current && !fault) {
          if (mode == 'ACK legacy') {
            legacyReset = shell.resetWorkspaceContextAcknowledged(
              'personal',
              () => true,
            );
          } else {
            saves.add(
              shell.setWorkspaceContextId(
                mode == 'ACK no-op' ? 'personal' : 'synthetic-B',
              ),
            );
            await tester.pumpAndSettle();
            if (mode == 'ACK ABA') {
              saves.add(shell.setWorkspaceContextId('personal'));
            }
          }
          userWrites = mode == 'ACK ABA' ? 2 : 1;
        }
        await tester.pumpAndSettle();
        expect(h.host.writes - baseline, 2);
        h.host.release.complete();
        await tester.pumpAndSettle();
        for (final save in saves) {
          await save;
        }
        if (legacyReset != null) {
          final accepted = await legacyReset;
          expect(accepted, isTrue);
        }
        selected = current ? null : _liveSaved;
      } else if (mode.startsWith('history')) {
        await h.selectHistory(tester, _other);
        if (mode == 'history ABA') {
          await h.openHistory(tester);
          await h.selectHistory(tester, _saved);
        }
        selected = mode == 'history' ? _other : _saved;
        userWrites = mode == 'history' ? 1 : 2;
      } else if (mode == 'context ABA') {
        await shell.setWorkspaceContextId('synthetic-other-context');
        await shell.setWorkspaceContextId('personal');
        await tester.pumpAndSettle();
        userWrites = 2;
      }
      if (api.hold) {
        api.release.complete();
        await tester.pumpAndSettle();
      }
      expect(h.repository.ids, resetIds + (current ? 1 : 0));
      final persisted = ack ? (fault ? _liveSaved : null) : selected;
      expect(await h.preferences.loadChatId(_workspace), persisted);
      expect(h.chat.state.storedChatId, selected);
      expect(h.host.writes - baseline, 2 + userWrites);
      expect(api.deletes, ack && !current ? <String>[] : [_sessionPath]);
      expect(api.entered, !ack || current);
      expect(
        live.state.status,
        ack && !current
            ? AssistantLiveConnectionStatus.error
            : AssistantLiveConnectionStatus.disconnected,
      );
      expect(h.controller.text, current ? '' : draft.text);
      if (!current) expect(h.controller.value, draft);
      if (current) expect(h.chat.state.composerAttachments, isEmpty);
      if (ack && !current) {
        expect(h.chat.state.composerAttachments, before.composerAttachments);
        expect(h.chat.state.fallbackChatId, before.fallbackChatId);
        expect(h.chrome.state.isLiveMode, isTrue);
      }
      expect(
        find.byType(AssistantHistorySheetBody),
        current || mode.startsWith('history') ? findsNothing : findsOneWidget,
      );
      if (!current) {
        final message = mode == 'failure'
            ? 'reset was saved, but finishing this screen failed'
            : fault
            ? 'The reset could not be confirmed'
            : 'reset was saved for the earlier context';
        expect(find.textContaining(message), findsOneWidget);
        expect(find.textContaining('private fixture'), findsNothing);
        await tester.tap(find.widgetWithText(TextButton, 'Done'));
        await tester.pumpAndSettle();
      }
      expect(api.deletes, hasLength(ack && !current ? 0 : 1));
      expect(h.host.writes - baseline, 2 + userWrites);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('Draft ABA retains origin', (tester) async {
    final h = await _mount(tester);
    final draft = h.controller.value;
    await h.openHistory(tester);
    await h.begin(tester);
    h.controller.text = 'Synthetic edited draft';
    h.controller.value = draft;
    await h.confirm(tester);
    expect(h.host.writes, 0);
    expect(h.controller.value, draft);
    expect(h.chat.state.storedChatId, _saved);
  });
}

Future<_ResetHarness> _mount(
  WidgetTester tester, {
  bool held = true,
  _CleanupApi? api,
}) async {
  final h = _ResetHarness(held: held, liveRepository: api?.repository);
  addTearDown(() => h.dispose(tester));
  await h.mount(tester);
  return h;
}

class _ResetRepository extends ReplyRepository {
  _ResetRepository(this.preferences);
  final AssistantPreferences preferences;
  @override
  String? get currentActorId => _actor;
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async =>
      await preferences.resetStore(wsId).hasUnknownCreation();
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId, title: 'Synthetic history'),
    messages: const [],
    attachmentsByMessageId: const {},
  );
  @override
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
  }) async => throw const FormatException('Synthetic upload error retained');
}

class _ResetHost extends InMemorySharedPreferencesStore {
  _ResetHost({bool held = true})
    : super.withData({
        'flutter.$_envelopeKey': jsonEncode(_record(held: held)),
      });
  static Map<String, Object?> _record({int revision = 1, bool held = true}) => {
    'schema': 1,
    'actorId': _actor,
    'workspaceId': _workspace,
    'revision': revision,
    'generation': revision,
    'selectedChatId': _saved,
    'contextId': 'prior',
    'creation': {'status': held ? 'unknown' : 'clear', 'attemptId': null},
    'resetConsent': null,
    'resetIntent': null,
  };
  int writes = 0;
  int? holdAt;
  int? faultAt;
  bool throws = false;
  bool unreadable = false;
  @override
  Future<Map<String, Object>> getAll() async {
    if (unreadable) throw const FormatException('Unreadable fixture');
    return await super.getAll();
  }

  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (key == 'flutter.$_envelopeKey') {
      writes++;
      if (writes == holdAt) {
        entered.complete();
        await release.future;
      }
      if (writes == faultAt) {
        if (throws) throw StateError('Synthetic held host failure');
        return false;
      }
    }
    return await super.setValue(type, key, value);
  }

  Future<void> replaceHeldRecord({int revision = 2}) async {
    await super.setValue(
      'String',
      'flutter.$_envelopeKey',
      jsonEncode(_record(revision: revision)),
    );
  }
}

class _CleanupApi extends ApiClient {
  _CleanupApi({this.hold = false, this.fail = false});
  AssistantLiveRepository get repository =>
      AssistantLiveRepository(apiClient: this);
  final bool fail;
  final bool hold;
  final release = Completer<void>();
  bool entered = false;
  int posts = 0;
  final deletes = <String>[];
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, '/api/v1/assistant/live/token');
    posts++;
    return {
      'token': 'synthetic-never-connect',
      'chatId': _saved,
      'scopeKey': 'synthetic-scope',
      'model': 'synthetic-model',
      'sessionHandle': 'synthetic-handle',
    };
  }

  @override
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    deletes.add(path);
    entered = true;
    if (hold) await release.future;
    if (fail) {
      throw const ApiException(message: 'private fixture', statusCode: 500);
    }
    return {};
  }
}

class _ResetHarness {
  _ResetHarness({this.held = true, this.liveRepository});
  final AssistantLiveRepository? liveRepository;
  final bool held;
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  late final preferences = AssistantPreferences(
    currentUserId: () => auth.state.user?.id,
  );
  late final repository = _ResetRepository(preferences);
  late final host = _ResetHost(held: held);
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = ShellDockSlotController();
  late AssistantChatCubit chat;
  late TextEditingController controller;
  Completer<void>? lockRelease;
  Future<void>? lockWork;
  bool lockCompleted = false;
  Future<void> mount(WidgetTester tester) async {
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = host;
    AssistantResetPreferences.revokeConsent(_envelopeKey);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (_) async => 'UTC',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
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
              liveRepository: liveRepository,
              preferences: preferences,
              currentActor: () => auth.state.user?.id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
    chat = tester
        .element(find.byType(ShellDockPublisher))
        .read<AssistantChatCubit>();
    controller = tester
        .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
        .controller;
    controller.value = const TextEditingValue(
      text: 'Synthetic preserved draft',
      selection: TextSelection(baseOffset: 3, extentOffset: 12),
    );
    await tester.runAsync(
      () => chat.addComposerAttachments(
        wsId: _workspace,
        files: [
          GalleryPlatformFile(
            XFile.fromData(Uint8List(3), name: 'fixture.txt'),
          ),
        ],
        modelId: 'synthetic-model',
        timezone: 'UTC',
      ),
    );
    await tester.pumpAndSettle();
    expect(chat.state.creationOutcomeUnknown, held);
    expect(chat.state.composerAttachments, hasLength(1));
  }

  Future<void> openHistory(WidgetTester tester) async {
    actions.state
        .resolveForLocation('/assistant')
        .singleWhere((a) => a.id == 'assistant-more')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recent chats'));
    await tester.pumpAndSettle();
    expect(find.byType(AssistantHistorySheetBody), findsOneWidget);
  }

  Future<void> begin(WidgetTester tester) async {
    await tester.tap(find.byTooltip('New conversation'));
    await tester.pumpAndSettle();
  }

  Future<void> confirm(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(FilledButton, 'Start a new chat'));
    await tester.pumpAndSettle();
  }

  Future<void> selectHistory(WidgetTester tester, String id) async {
    final finder = find.byType(AssistantHistorySheetBody);
    final body = tester.widget<AssistantHistorySheetBody>(finder);
    final selecting = body.onSelectChat(AssistantChatRecord(id: id));
    await tester.pumpAndSettle();
    await selecting;
  }

  Future<void> dispose(WidgetTester tester) async {
    if (lockRelease case final gate? when !gate.isCompleted) gate.complete();
    await lockWork;
    if (!host.release.isCompleted) host.release.complete();
    host.unreadable = false;
    unawaited(repository.stream.close());
    unawaited(repository.replacement.close());
    if (find.byType(AlertDialog).evaluate().isNotEmpty) {
      Navigator.of(tester.element(find.byType(AlertDialog))).pop();
      await tester.pumpAndSettle();
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    for (final channel in [
      'flutter_timezone',
      'com.llfbandit.record/messages',
    ]) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        null,
      );
    }
    await auth.close();
    await workspace.close();
    await chrome.close();
    await actions.close();
    dock.dispose();
  }
}
