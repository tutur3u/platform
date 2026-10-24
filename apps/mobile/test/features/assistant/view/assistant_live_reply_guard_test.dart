import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:mobile/core/utils/gallery_platform_file.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_stage_card.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import 'background_reply_harness.dart';

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '22222222-2222-4222-8222-222222222222';
const _chat = '44444444-4444-4444-8444-444444444444';
const _answer = '55555555-5555-4555-8555-555555555555';
const _saved = '77777777-7777-4777-8777-777777777777';
const _draft = 'Retained reply\nSecond line';
const _notice =
    'Replies are unavailable while Live is connected. '
    'End the call or cancel the reply before sending.';

class _Repository extends ReplyRepository {
  List<AssistantMessage>? sent;
  List<AssistantAttachment> sentAttachments = const [];

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId),
    messages: const [
      AssistantMessage(
        id: _answer,
        role: 'assistant',
        isPersisted: true,
        parts: [AssistantMessagePart(type: 'text', text: 'Saved answer')],
      ),
    ],
    attachmentsByMessageId: const {},
  );

  @override
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
  }) async => AssistantAttachment(
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.mimeType,
    storagePath: 'synthetic/retained.txt',
    uploadState: AssistantAttachmentUploadState.uploaded,
  );

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
    admission?.recordDispatchPossible();
    starts++;
    sent = messages;
    sentAttachments = attachments;
    return stream.stream;
  }

  void acknowledge() {
    final row = sent!.lastWhere((message) => message.role == 'user');
    final text = row.parts
        .where((part) => part.type == 'text')
        .map((part) => part.text ?? '')
        .join('\n\n')
        .trim();
    stream.add(
      AssistantJsonStreamEvent({
        'type': 'saved-user-message',
        'messageId': _saved,
        'clientRequestId': row.clientRequestId,
        'text': text,
        'message': row.copyWith(id: _saved, isPersisted: true).toJson(),
        'nativeReceipt': {
          'actorId': _actor,
          'workspaceId': _workspace,
          'chatId': _chat,
          'requestId': row.clientRequestId,
          'messageId': _saved,
          'text': text,
          'replyToMessageId': row.replyToMessageId,
          'attachments': [
            for (final attachment in sentAttachments)
              {
                'path': attachment.storagePath,
                'name': attachment.name,
                'type': attachment.type,
                'size': attachment.size,
              },
          ],
        },
      }),
    );
  }
}

AssistantComposerDock _composer(WidgetTester tester) =>
    tester.widget<AssistantComposerDock>(find.byType(AssistantComposerDock));

AssistantTranscriptBubble _bubble(WidgetTester tester) => tester
    .widgetList<AssistantTranscriptBubble>(
      find.byType(AssistantTranscriptBubble),
    )
    .singleWhere((bubble) => bubble.text == 'Saved answer');

Future<BackgroundReplyHarness> _mount(WidgetTester tester) async {
  final h = BackgroundReplyHarness(repository: _Repository());
  addTearDown(() => h.dispose(tester));
  await h.mount(
    tester,
    initialPreferences: {
      '$_actor::$assistantKeepLiveWhileBrowsingKeyPrefix$_workspace': true,
    },
  );
  await h.chat.openChatById(_workspace, _chat);
  await tester.pumpAndSettle();
  if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
  }
  expect(_composer(tester).chatCubit, same(h.chat));
  return h;
}

void _connect(AssistantLiveCubit live) {
  // Seed provider connection state; page and dispatch Cubits stay real.
  live.emit(
    const AssistantLiveState(
      workspaceId: _workspace,
      chatId: _chat,
      status: AssistantLiveConnectionStatus.connected,
    ),
  );
}

Future<void> _browseFromLive(
  WidgetTester tester,
  BackgroundReplyHarness h,
) async {
  h.chrome.enterLiveMode();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  final liveView = tester.widget<AssistantLiveModeView>(
    find.byType(AssistantLiveModeView),
  );
  await liveView.onOpenTextEntry();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  expect(h.chrome.state.isLiveMode, isFalse);
  expect(
    _composer(tester).liveState.status,
    AssistantLiveConnectionStatus.connected,
  );
}

Future<void> _prepareDraft(
  WidgetTester tester,
  BackgroundReplyHarness h,
) async {
  _bubble(tester).onReply!();
  await tester.pumpAndSettle();
  expect(h.chat.state.replyTarget?.id, _answer);
  _composer(tester).controller.value = const TextEditingValue(
    text: _draft,
    selection: TextSelection(baseOffset: 2, extentOffset: 9),
  );
  await tester.runAsync(
    () => h.chat.addComposerAttachments(
      wsId: _workspace,
      files: [
        GalleryPlatformFile(
          XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'retained.txt'),
        ),
      ],
      modelId: 'synthetic-model',
      timezone: 'UTC',
    ),
  );
  await tester.pumpAndSettle();
  expect(h.chat.state.composerAttachments.single.isUploaded, isTrue);
}

void main() {
  testWidgets('retained Live hides Reply and rejects a stale open sheet', (
    tester,
  ) async {
    final h = await _mount(tester);
    final live = h.pageContext.read<AssistantLiveCubit>();
    final staleReply = _bubble(tester).onReply!;
    await tester.longPress(find.text('Saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<AssistantMessageActions>(find.byType(AssistantMessageActions))
          .canReply,
      isTrue,
    );
    _connect(live);
    // Dispatch before a rebuild to cover a captured pre-Live callback too.
    staleReply();
    expect(h.chat.state.replyTarget, isNull);
    await tester.tap(find.text('Reply'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(h.chat.state.replyTarget, isNull);
    await _browseFromLive(tester, h);
    expect(_bubble(tester).onReply, isNull);
    await tester.longPress(find.text('Saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('Reply'), findsNothing);
    expect(
      tester
          .widget<AssistantMessageActions>(find.byType(AssistantMessageActions))
          .canReply,
      isFalse,
    );
    expect(h.repository.starts, 0);
    expect(live.state.userDraft, isEmpty);
  });

  testWidgets('mounted Reply sheet survives Live disabling its callback', (
    tester,
  ) async {
    final h = await _mount(tester);
    final live = h.pageContext.read<AssistantLiveCubit>()
      ..emit(
        const AssistantLiveState(
          workspaceId: _workspace,
          chatId: _chat,
          microphonePermission: AssistantLivePermissionState.denied,
        ),
      );
    await tester.pumpAndSettle();
    final transcript = find.byType(AssistantTranscriptSection);
    final originalTranscript = tester.element(transcript);
    final bubble = find.byType(AssistantTranscriptBubble).first;
    final originalBubble = tester.element(bubble);
    await tester.longPress(find.text('Saved answer', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('Reply'), findsOneWidget);

    _connect(live);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.element(transcript), same(originalTranscript));
    expect(tester.element(bubble), same(originalBubble));
    expect(_bubble(tester).onReply, isNull);
    expect(find.text('Reply'), findsOneWidget);
    await tester.tap(find.text('Reply'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AssistantMessageActions), findsNothing);
    expect(h.chat.state.replyTarget, isNull);
    expect(h.repository.starts, 0);
    expect(live.state.userDraft, isEmpty);
    expect(tester.takeException(), isNull);
  });

  for (final cancelReply in [false, true]) {
    testWidgets('blocked draft recovers with one ACK after '
        '${cancelReply ? 'cancel and end call' : 'end call'}', (tester) async {
      final h = await _mount(tester);
      final repository = h.repository as _Repository;
      final live = h.pageContext.read<AssistantLiveCubit>();
      await _prepareDraft(tester, h);
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      _connect(live);
      await composer.onSend();
      expect(repository.starts, 0);
      expect(live.state.userDraft, isEmpty);
      expect(composer.controller.value, draft);
      expect(h.chat.state.replyTarget?.id, _answer);
      expect(h.chat.state.composerAttachments, attachments);
      await _browseFromLive(tester, h);
      await _composer(tester).onSend();
      await tester.pump();
      expect(find.text(_notice), findsWidgets);
      expect(repository.starts, 0);
      expect(live.state.userDraft, isEmpty);
      expect(composer.controller.value, draft);
      expect(h.chat.state.replyTarget?.id, _answer);
      expect(h.chat.state.composerAttachments, attachments);
      if (cancelReply) {
        _composer(tester).onCancelReply!();
        await tester.pump();
        expect(h.chat.state.replyTarget, isNull);
        expect(composer.controller.value, draft);
        expect(h.chat.state.composerAttachments, attachments);
      }
      await tester
          .widget<AssistantLiveStageCard>(find.byType(AssistantLiveStageCard))
          .onDisconnect();
      await tester.pumpAndSettle();
      expect(live.state.status, AssistantLiveConnectionStatus.disconnected);
      final sending = _composer(tester).onSend();
      for (var i = 0; i < 8 && repository.starts == 0; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(repository.starts, 1);
      expect(
        repository.sent!.last.replyToMessageId,
        cancelReply ? isNull : _answer,
      );
      expect(repository.sentAttachments, attachments);
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      repository.acknowledge();
      await tester.pump();
      await sending;
      expect(composer.controller.text, isEmpty);
      expect(h.chat.state.replyTarget, isNull);
      expect(h.chat.state.composerAttachments, isEmpty);
      expect(repository.starts, 1);
    });
  }

  testWidgets('cancel reply permits one plain Live turn and clears its draft', (
    tester,
  ) async {
    final h = await _mount(tester);
    await _prepareDraft(tester, h);
    final live = h.pageContext.read<AssistantLiveCubit>();
    _connect(live);
    await _browseFromLive(tester, h);
    final composer = _composer(tester);
    final draft = composer.controller.value;
    final attachments = h.chat.state.composerAttachments;
    var typedTurns = 0;
    final subscription = live.stream.listen((state) {
      if (state.userDraft == _draft) typedTurns++;
    });
    addTearDown(subscription.cancel);
    await composer.onSend();
    await tester.pump();
    expect(typedTurns, 0);
    expect(composer.controller.value, draft);
    expect(h.chat.state.composerAttachments, attachments);
    composer.onCancelReply!();
    await tester.pump();
    expect(h.chat.state.replyTarget, isNull);
    expect(composer.controller.value, draft);
    expect(h.chat.state.composerAttachments, attachments);
    await _composer(tester).onSend();
    await tester.pump();
    expect(live.state.status, AssistantLiveConnectionStatus.connected);
    expect(typedTurns, 1);
    expect(live.state.userDraft, _draft);
    expect(h.repository.starts, 0);
    expect(composer.controller.text, isEmpty);
    expect(h.chat.state.composerAttachments, isEmpty);
    expect(h.chat.state.replyTarget, isNull);
  });

  testWidgets('Live connecting during timezone await blocks retained reply', (
    tester,
  ) async {
    final h = await _mount(tester);
    await _prepareDraft(tester, h);
    final composer = _composer(tester);
    final draft = composer.controller.value;
    final attachments = h.chat.state.composerAttachments;
    final entered = Completer<void>();
    final timezone = Completer<String>();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (_) {
        entered.complete();
        return timezone.future;
      },
    );
    final sending = composer.onSend();
    await tester.pump();
    expect(entered.isCompleted, isTrue);
    final live = h.pageContext.read<AssistantLiveCubit>();
    _connect(live);
    timezone.complete('UTC');
    await tester.pump();
    await sending;
    expect(h.repository.starts, 0);
    expect(live.state.userDraft, isEmpty);
    expect(composer.controller.value, draft);
    expect(h.chat.state.replyTarget?.id, _answer);
    expect(h.chat.state.composerAttachments, attachments);
    expect(find.text(_notice), findsOneWidget);
  });

  testWidgets('admitted native ACK and response survive next reply and Live', (
    tester,
  ) async {
    final h = await _mount(tester);
    final repository = h.repository as _Repository;
    final composer = _composer(tester);
    const original = 'Original native question';
    composer.controller.text = original;
    var completed = false;
    final sending = composer.onSend().then((_) => completed = true);
    for (var i = 0; i < 8 && repository.starts == 0; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(repository.starts, 1);
    final submitted = repository.sent!.last;
    expect(submitted.role, 'user');
    expect(submitted.parts.single.text, original);
    expect(submitted.replyToMessageId, isNull);
    expect(repository.sentAttachments, isEmpty);
    expect(completed, isFalse);
    repository.stream.add(
      const AssistantJsonStreamEvent({'type': 'native-dispatch-admitted'}),
    );

    _bubble(tester).onReply!();
    await tester.pump();
    composer.controller.value = const TextEditingValue(
      text: _draft,
      selection: TextSelection(baseOffset: 2, extentOffset: 9),
    );
    await tester.runAsync(
      () => h.chat.addComposerAttachments(
        wsId: _workspace,
        files: [
          GalleryPlatformFile(
            XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'retained.txt'),
          ),
        ],
        modelId: 'synthetic-model',
        timezone: 'UTC',
      ),
    );
    await tester.pump();
    final nextReply = h.chat.state.replyTarget;
    final nextDraft = composer.controller.value;
    final nextAttachments = h.chat.state.composerAttachments;
    expect(nextReply?.id, _answer);
    expect(nextAttachments.single.isUploaded, isTrue);
    expect(h.chat.replyBlockedByPendingSubmission, isTrue);
    final live = h.pageContext.read<AssistantLiveCubit>();
    _connect(live);
    await _browseFromLive(tester, h);
    expect(_bubble(tester).onReply, isNull);
    expect(completed, isFalse);

    repository.acknowledge();
    await tester.pump();
    expect(completed, isTrue);
    await sending;
    final saved = h.chat.state.messages.singleWhere((row) => row.id == _saved);
    expect(saved.isPersisted, isTrue);
    expect(saved.clientRequestId, submitted.clientRequestId);
    expect(saved.parts.single.text, original);
    expect(saved.replyToMessageId, isNull);
    expect(h.chat.replyBlockedByPendingSubmission, isFalse);
    repository.stream.add(const AssistantJsonStreamEvent({'type': 'start'}));
    repository.stream.add(
      const AssistantJsonStreamEvent({
        'type': 'text-delta',
        'id': 'original-response',
        'delta': 'Original native response',
      }),
    );
    unawaited(repository.stream.close());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(h.chat.state.status, AssistantChatStatus.idle);
    expect(
      h.chat.state.messages.last.parts.single.text,
      'Original native response',
    );
    expect(find.text('Original native response'), findsOneWidget);
    expect(repository.starts, 1);
    expect(live.state.userDraft, isEmpty);
    expect(h.chat.state.replyTarget, same(nextReply));
    expect(composer.controller.value, nextDraft);
    expect(h.chat.state.composerAttachments, nextAttachments);
  });

  testWidgets(
    'reply cancellation during timezone await refuses old submission',
    (tester) async {
      final h = await _mount(tester);
      await _prepareDraft(tester, h);
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      final entered = Completer<void>();
      final timezone = Completer<String>();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter_timezone'),
        (_) {
          entered.complete();
          return timezone.future;
        },
      );
      var completed = false;
      final sending = composer.onSend().then((_) => completed = true);
      await tester.pump();
      expect(entered.isCompleted, isTrue);
      composer.onCancelReply!();
      timezone.complete('UTC');
      await tester.pump();
      expect(completed, isTrue);
      await sending;
      expect(h.repository.starts, 0);
      expect(h.chat.state.replyTarget, isNull);
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
    },
  );

  for (final actorChange in [false, true]) {
    testWidgets('stale Reply refuses ${actorChange ? 'actor' : 'workspace'} '
        'departure', (tester) async {
      final h = await _mount(tester);
      final reply = _bubble(tester).onReply!;
      if (actorChange) {
        h.auth.change(const AuthState.unauthenticated());
      } else {
        h.workspace.change('88888888-8888-4888-8888-888888888888');
      }
      await tester.pumpAndSettle();
      reply();
      expect(h.chat.state.replyTarget, isNull);
      expect(h.repository.starts, 0);
    });
  }
}
