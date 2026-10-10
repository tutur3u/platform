import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

class _Preferences extends AssistantPreferences {
  Exception? error;
  @override
  Future<String?> loadChatId(String wsId) async => null;
  @override
  Future<void> saveChatId(
    String wsId,
    String chatId, {
    bool Function()? shouldWrite,
  }) async {
    if (error != null) throw error!;
  }
}

class _Repository extends AssistantRepository {
  Exception? createError;
  Completer<AssistantChatRecord>? pendingCreate;
  final started = Completer<void>();
  final stream = StreamController<AssistantStreamEvent>.broadcast();
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
  }) async {
    if (!started.isCompleted) started.complete();
    if (pendingCreate != null) return await pendingCreate!.future;
    if (createError != null) throw createError!;
    return AssistantChatRecord(id: id);
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
  }) => stream.stream;
}

Future<void> _submit(AssistantChatCubit cubit, {bool Function()? isCurrent}) =>
    cubit.submit(
      wsId: 'ws',
      message: 'Synthetic private prompt',
      modelId: 'model',
      thinkingMode: AssistantThinkingMode.thinking,
      creditSource: AssistantCreditSource.workspace,
      workspaceContextId: 'ws',
      timezone: 'UTC',
      isCurrent: isCurrent,
    );

void main() {
  late _Repository repository;
  late _Preferences preferences;
  late AssistantChatCubit cubit;
  late List<OperationalErrorEvent> events;
  var failSink = false;
  setUp(() async {
    repository = _Repository();
    preferences = _Preferences();
    events = [];
    failSink = false;
    cubit = AssistantChatCubit(
      repository: repository,
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
      operationalReporter: OperationalErrorReporter(
        sink: (event) async {
          events.add(event);
          if (failSink) throw StateError('sink');
        },
      ),
    );
    await cubit.loadWorkspace('ws');
  });
  tearDown(() async {
    await cubit.close();
    await repository.stream.close();
  });

  for (final persist in [false, true]) {
    test(
      'handled failure at ${persist ? 'local persistence' : 'chat creation'}',
      () async {
        const error = ApiException(
          message: 'private@example.com prompt token URL',
          statusCode: 503,
        );
        if (persist) {
          preferences.error = error;
        } else {
          repository.createError = error;
        }
        final failed = cubit.stream.firstWhere(
          (state) => state.status == AssistantChatStatus.error,
        );
        await _submit(cubit);
        await failed.timeout(const Duration(seconds: 2));
        expect(events, hasLength(1));
        expect(
          events.single.phase,
          persist
              ? OperationalPhase.assistantPreferencePersist
              : OperationalPhase.assistantCreate,
        );
        expect(events.single.status, 503);
        expect(events.single.fields.toString(), isNot(contains('private')));
        expect(events.single.fields.toString(), isNot(contains('prompt')));
      },
    );
  }

  test('async sink failure preserves chat retry state', () async {
    failSink = true;
    repository.createError = const ApiException(
      message: 'private',
      statusCode: 503,
    );
    final failed = cubit.stream.firstWhere(
      (state) => state.status == AssistantChatStatus.error,
    );
    await _submit(cubit);
    await failed.timeout(const Duration(seconds: 2));
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.status, AssistantChatStatus.error);
    repository.createError = null;
    await _submit(cubit);
    // The real debounce and create path must recover despite failed telemetry.
    await cubit.stream
        .firstWhere((state) => state.status == AssistantChatStatus.submitting)
        .timeout(const Duration(seconds: 2));
    await Future<void>.delayed(Duration.zero);
    expect(repository.stream.hasListener, true);
    expect(events, hasLength(1));
  });

  test('late create failure after workspace ABA does not report', () async {
    final pending = Completer<AssistantChatRecord>();
    repository.pendingCreate = pending;
    await _submit(cubit);
    await repository.started.future.timeout(const Duration(seconds: 2));
    await cubit.loadWorkspace('other');
    await cubit.loadWorkspace('ws');
    pending.completeError(
      const ApiException(message: 'private', statusCode: 503),
    );
    await Future<void>.delayed(Duration.zero);
    expect(events, isEmpty);
    expect(cubit.state.status, AssistantChatStatus.idle);
  });

  test(
    'superseded stream errors and deliberate stop are not incidents',
    () async {
      var current = true;
      await _submit(cubit, isCurrent: () => current);
      await repository.started.future.timeout(const Duration(seconds: 2));
      await Future<void>.delayed(Duration.zero);
      current = false;
      repository.stream.addError(
        const ApiException(message: 'private', statusCode: 429),
      );
      await Future<void>.delayed(Duration.zero);
      await cubit.stopStreaming();
      repository.stream.addError(Exception('cancelled payload'));
      await Future<void>.delayed(Duration.zero);
      expect(events, isEmpty);
      expect(cubit.state.status, AssistantChatStatus.idle);
    },
  );

  test(
    'stream transport exception reports reply phase once without stack',
    () async {
      await _submit(cubit);
      await repository.started.future.timeout(const Duration(seconds: 2));
      await Future<void>.delayed(Duration.zero);
      final failed = cubit.stream.firstWhere(
        (state) => state.status == AssistantChatStatus.error,
      );
      repository.stream.addError(
        const ApiException.transport(message: 'private prompt'),
        StackTrace.fromString('private@example.com token URL'),
      );
      repository.stream.addError(Exception('another private payload'));
      await failed.timeout(const Duration(seconds: 2));
      await Future<void>.delayed(Duration.zero);
      expect(events, hasLength(1));
      expect(events.single.phase, OperationalPhase.assistantReply);
      expect(events.single.kind, OperationalFailureKind.transport);
      expect(events.single.status, isNull);
      expect(events.single.fields.toString(), isNot(contains('private')));
    },
  );
}
