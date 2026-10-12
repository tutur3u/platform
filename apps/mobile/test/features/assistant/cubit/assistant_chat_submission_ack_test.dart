import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

const ws = '11111111-1111-4111-8111-111111111111';
const saved = '22222222-2222-4222-8222-222222222222';
const attachment = AssistantAttachment(
  id: 'file',
  name: 'fixture',
  size: 1,
  type: 'text/plain',
  storagePath: 'synthetic/file',
  uploadState: AssistantAttachmentUploadState.uploaded,
);

// These injected saved-user frames test the actual helper/Cubit ACK contract.
// They do not prove HTTP, authentication, device persistence,
// or provider calls.
class _Repository extends AssistantRepository {
  final body = StreamController<AssistantStreamEvent>.broadcast();
  Completer<void> started = Completer<void>();
  int ids = 0;
  int creates = 0;
  String request = '';
  String text = '';
  @override
  String generateUuid() =>
      'aaaaaaaa-aaaa-4aaa-8aaa-${(++ids).toString().padLeft(12, '0')}';
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async => false;
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
  }) async {
    creates++;
    throw StateError('Unexpected creation');
  }

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
    final user = messages.lastWhere((message) => message.role == 'user');
    request = user.clientRequestId!;
    text = user.parts
        .where((part) => part.type == 'text')
        .map((part) => part.text ?? '')
        .join('\n\n');
    started.complete();
    return body.stream;
  }

  void ack({String? requestId, String? messageId, String? content}) => body.add(
    AssistantJsonStreamEvent({
      'type': 'saved-user-message',
      'clientRequestId': requestId ?? request,
      'messageId':
          messageId ??
          'bbbbbbbb-bbbb-4bbb-8bbb-${ids.toString().padLeft(12, '0')}',
      'text': content ?? text,
    }),
  );
}

class _PreStreamFailureRepository extends _Repository {
  _PreStreamFailureRepository(this.failure);
  final String failure;
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
  }) async {
    if (failure == 'create') throw StateError('Synthetic creation error');
    return const AssistantChatRecord(id: saved);
  }

  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
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
    throw StateError('Synthetic stream setup error');
  }
}

class _PreStreamFailurePreferences extends AssistantPreferences {
  _PreStreamFailurePreferences(this.failure);
  final String failure;
  @override
  Future<void> saveChatId(
    String wsId,
    String chatId, {
    bool Function()? shouldWrite,
  }) async {
    if (failure == 'preference') throw StateError('Synthetic preference error');
  }
}

class _HeldCleanup {
  final started = Completer<void>();
  final release = Completer<void>();
  bool fail = false;
}

class _HeldObserverStream extends Stream<AssistantChatState> {
  _HeldObserverStream(this.source, this.cleanups);
  final Stream<AssistantChatState> source;
  final List<_HeldCleanup> cleanups;

  @override
  StreamSubscription<AssistantChatState> listen(
    void Function(AssistantChatState)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    final cleanup = _HeldCleanup();
    cleanups.add(cleanup);
    late StreamSubscription<AssistantChatState> underlying;
    late StreamController<AssistantChatState> controller;
    controller = StreamController<AssistantChatState>(
      onListen: () {
        underlying = source.listen(
          controller.add,
          onError: controller.addError,
          onDone: controller.close,
        );
      },
      onCancel: () async {
        await underlying.cancel();
        cleanup.started.complete();
        await cleanup.release.future;
        if (cleanup.fail) throw StateError('Synthetic observer cleanup');
      },
    );
    return controller.stream.listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}

class _HeldObserverCubit extends AssistantChatCubit {
  _HeldObserverCubit(AssistantRepository repository)
    : super(
        repository: repository,
        preferences: AssistantPreferences(),
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
  final cleanups = <_HeldCleanup>[];
  @override
  Stream<AssistantChatState> get stream =>
      _HeldObserverStream(super.stream, cleanups);
}

void main() {
  late _Repository repository;
  late AssistantChatCubit chat;
  var lease = true;
  setUp(() {
    lease = true;
    repository = _Repository();
    chat = _HeldObserverCubit(repository);
    // Seed synthetic verified history; exercise the real submit path.
    chat.emit(
      chat.state.copyWith(
        workspaceId: ws,
        chat: const AssistantChatRecord(id: saved),
        storedChatId: saved,
        composerAttachments: const [attachment],
      ),
    );
  });
  tearDown(() async {
    for (final cleanup
        in (chat is _HeldObserverCubit
            ? (chat as _HeldObserverCubit).cleanups
            : <_HeldCleanup>[])) {
      if (!cleanup.release.isCompleted) cleanup.release.complete();
    }
    await repository.body.close();
    await chat.close();
  });
  Future<bool> send() => submitAssistantRemoteChat(
    chat,
    const AssistantShellState(),
    wsId: ws,
    message: 'Synthetic draft',
    isCurrent: () => lease,
    resolveTimezone: () async => 'UTC',
  );
  for (final failure in [
    'start-only',
    'wrong-request',
    'wrong-text',
    'malformed-id',
    'malformed-type',
    'throw',
    'done-only',
    'stale',
    'stale-error',
    'stale-done',
  ]) {
    test(
      'helper preserves composer without current USER receipt: $failure',
      () async {
        final pending = send();
        await repository.started.future;
        var settled = false;
        unawaited(pending.then((_) => settled = true));
        repository.body.add(
          const AssistantJsonStreamEvent({'type': 'start', 'messageId': saved}),
        );
        await Future<void>.delayed(Duration.zero);
        expect(settled, false);
        if (failure == 'wrong-request') {
          repository.ack(requestId: 'cccccccc-cccc-4ccc-8ccc-000000000001');
        }
        if (failure == 'wrong-text') repository.ack(content: 'Different draft');
        if (failure == 'malformed-id') repository.ack(messageId: 'malformed');
        if (failure == 'stale') {
          lease = false;
          repository.ack();
        }
        if (failure == 'malformed-type') {
          repository.body.add(
            const AssistantJsonStreamEvent({
              'type': 'saved-user-message',
              'clientRequestId': 1,
              'messageId': saved,
              'text': 'Synthetic draft',
            }),
          );
        }
        if (failure.startsWith('stale-')) lease = false;
        if (failure == 'throw') {
          repository.body.addError(
            const ApiException.transport(message: 'Synthetic unknown'),
          );
        } else if (failure.endsWith('done') || failure == 'done-only') {
          await repository.body.close();
        } else {
          repository.body.add(
            const AssistantJsonStreamEvent({
              'type': 'error',
              'message': 'Synthetic no receipt',
            }),
          );
        }
        expect(await pending, false);
        expect(chat.state.storedChatId, saved);
        expect(chat.state.composerAttachments, const [attachment]);
        expect(repository.creates, 0);
      },
    );
  }
  test(
    'unknown new creation is denied without API or composer consumption',
    () async {
      chat.emit(
        chat.state.copyWith(
          chat: null,
          storedChatId: null,
          creationOutcomeUnknown: true,
        ),
      );
      expect(await send(), false);
      expect(repository.creates, 0);
      expect(repository.started.isCompleted, false);
      expect(chat.state.composerAttachments, const [attachment]);
    },
  );
  test('matching USER acknowledgment precedes reply '
      'and survives later model failure', () async {
    final pending = send();
    await repository.started.future;
    repository.ack();
    expect(await pending, true);
    expect(chat.state.composerAttachments, isEmpty);
    final user = chat.state.messages.lastWhere(
      (message) => message.role == 'user',
    );
    expect(user.clientRequestId, repository.request);
    expect(user.id, isNot(repository.request));
    expect(chat.state.attachmentsByMessageId[user.id], const [attachment]);
    repository.body.add(
      const AssistantJsonStreamEvent({
        'type': 'error',
        'message': 'Synthetic model failure after saved user',
      }),
    );
    await Future<void>.delayed(Duration.zero);
    expect(chat.state.status, AssistantChatStatus.error);
    expect(chat.state.messages.contains(user), true);
  });
  test('saved USER resolves while observer cleanup remains held', () async {
    final pending = send();
    bool? accepted;
    unawaited(pending.then((value) => accepted = value));
    await repository.started.future;
    repository.ack();
    final cleanup = (chat as _HeldObserverCubit).cleanups.single;
    await cleanup.started.future;
    expect(cleanup.release.isCompleted, false);
    await Future<void>.delayed(Duration.zero);
    expect(accepted, true);
    expect(await pending, true);
    expect(chat.state.composerAttachments, isEmpty);
    expect(chat.state.messages.last.clientRequestId, repository.request);
  });
  test('old cleanup failure cannot settle or mutate a new request', () async {
    final first = send();
    await repository.started.future;
    repository.ack();
    expect(await first, true);
    final cleanup = (chat as _HeldObserverCubit).cleanups.single;
    await cleanup.started.future;
    repository.started = Completer<void>();
    final second = send();
    await repository.started.future;
    final request = repository.request;
    var settled = false;
    unawaited(second.then((_) => settled = true));
    cleanup.fail = true;
    cleanup.release.complete();
    await Future<void>.delayed(Duration.zero);
    expect(settled, false);
    expect(chat.state.messages.last.clientRequestId, request);
    repository.ack();
    expect(await second, true);
    expect(chat.state.messages.last.clientRequestId, request);
  });
  test(
    'known selected history follows up despite unknown new-creation marker',
    () async {
      chat.emit(chat.state.copyWith(creationOutcomeUnknown: true));
      final pending = send();
      await repository.started.future;
      repository.ack();
      expect(await pending, true);
      expect(repository.creates, 0);
    },
  );
  test(
    'acknowledged follow-up keeps distinct original IDs and saved history',
    () async {
      final first = send();
      await repository.started.future;
      repository.ack();
      expect(await first, true);
      final original = repository.request;
      repository.started = Completer<void>();
      final second = send();
      await repository.started.future;
      repository.ack();
      expect(await second, true);
      expect(repository.request, isNot(original));
      final users = chat.state.messages
          .where((message) => message.role == 'user')
          .toList();
      expect(users.length, 2);
      expect(users.map((message) => message.clientRequestId).toSet().length, 2);
      expect(users.map((message) => message.id).toSet().length, 2);
      expect(repository.creates, 0);
    },
  );
  for (final active in [false, true]) {
    test('default stop settles typed request (active=$active)', () async {
      final pending = send();
      bool? result;
      unawaited(pending.then((value) => result = value));
      if (active) {
        await repository.started.future;
      } else {
        await Future<void>.delayed(Duration.zero);
      }
      await chat.stopStreaming();
      await Future<void>.delayed(Duration.zero);
      expect(result, false);
      expect(chat.state.composerAttachments, const [attachment]);
      expect(repository.creates, 0);
      repository.started = Completer<void>();
      final replacement = send();
      await repository.started.future;
      repository.ack();
      expect(await replacement, true);
    });
  }
  test('untyped submission supersedes only the prior typed request', () async {
    final first = send();
    bool? result;
    unawaited(first.then((value) => result = value));
    await repository.started.future;
    repository.started = Completer<void>();
    await chat.submit(
      wsId: ws,
      message: 'Replacement',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.thinking,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: ws,
      timezone: 'UTC',
    );
    await Future<void>.delayed(Duration.zero);
    expect(result, false);
    await repository.started.future;
    expect(repository.text, 'Replacement');
  });
  for (final failure in ['create', 'preference', 'setup']) {
    test(
      'pre-listener StateError settles only its owned request: $failure',
      () async {
        await chat.close();
        await repository.body.close();
        repository = _PreStreamFailureRepository(failure);
        chat = AssistantChatCubit(
          repository: repository,
          preferences: _PreStreamFailurePreferences(failure),
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {},
        );
        // Seed a synthetic workspace; execute the async ownership boundary.
        chat.emit(
          chat.state.copyWith(
            workspaceId: ws,
            composerAttachments: const [attachment],
          ),
        );
        final result = await send();
        expect(result, false);
        expect(chat.state.composerAttachments, const [attachment]);
        expect(chat.state.status, AssistantChatStatus.error);
        expect(chat.state.creationOutcomeUnknown, failure != 'setup');
        expect(chat.state.messages.first.parts.single.text, 'Synthetic draft');
      },
    );
  }
  test(
    'explicit retry supersedes the previous typed waiter with original ID',
    () async {
      final pending = send();
      bool? result;
      unawaited(pending.then((value) => result = value));
      await repository.started.future;
      final original = repository.request;
      repository.started = Completer<void>();
      await chat.retryLast(
        wsId: ws,
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.thinking,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: ws,
        timezone: 'UTC',
      );
      await Future<void>.delayed(Duration.zero);
      expect(result, false);
      await repository.started.future;
      expect(repository.request, original);
    },
  );
}
