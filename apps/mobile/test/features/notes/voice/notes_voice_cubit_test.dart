import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/features/notes/voice/notes_voice_repository.dart';

class Recorder implements AssistantVoiceRecorder {
  String? path;
  @override
  Future<bool> hasPermission() async => true;
  @override
  Future<void> start(String path) async {
    this.path = path;
    await File(path).writeAsBytes([1, 2, 3]);
  }

  @override
  Future<void> pause() async {}
  @override
  Future<void> resume() async {}
  @override
  Future<void> stop() async {}
  @override
  Stream<double> get levels => const Stream.empty();
  @override
  Future<void> dispose() async {}
}

class Repository implements NotesVoiceRepository {
  NotesVoiceJob? retained;
  Exception? failure;
  Completer<NotesVoiceJob?>? pendingRefresh;
  final ids = <String>[];
  final revisions = <int?>[];
  int saves = 0;
  @override
  Future<NotesVoiceJob?> cached(String actor, String ws) async => retained;
  @override
  Future<NotesVoiceJob?> refresh(String actor, String ws, String id) async {
    if (failure != null) throw failure!;
    return pendingRefresh == null ? retained : await pendingRefresh!.future;
  }

  @override
  Future<NotesVoiceJob> submit(
    String actor,
    String ws, {
    required String requestId,
    required Uint8List audio,
    required String timezone,
    int? expectedRevision,
  }) async {
    ids.add(requestId);
    revisions.add(expectedRevision);
    if (failure != null) throw failure!;
    return retained = NotesVoiceJob(
      id: requestId,
      workspaceId: ws,
      status: 'completed',
      revision: 4,
      transcript: 'Speech',
      artifact: const {},
    );
  }

  @override
  Future<void> delete(String actor, String ws, String id) async {
    retained = null;
  }

  @override
  Future<void> saveReviewed(
    String actor,
    String ws,
    NotesVoiceJob job,
    String untitled,
  ) async {
    saves++;
  }

  @override
  void invalidateScope() {}
  @override
  void dispose() {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late Recorder recorder;
  late Repository repository;
  late NotesVoiceCubit cubit;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('notes-voice-test-');
    recorder = Recorder();
    repository = Repository();
    cubit = NotesVoiceCubit(
      capture: AssistantVoiceCaptureCubit(
        recorder: recorder,
        temporaryDirectory: () async => directory,
        fileExtension: 'wav',
        fileName: 'voice-note.wav',
      ),
      repository: repository,
      timezone: () async => 'UTC',
    );
    await cubit.setScope('actor', 'workspace');
  });
  tearDown(() async {
    await cubit.close();
    await directory.delete(recursive: true);
  });
  Future<void> record() async {
    await cubit.start();
    await cubit.capture.pause();
  }

  test(
    'transport retry preserves intent and unsent bytes without replay queue',
    () async {
      await record();
      repository.failure = const ApiException.transport(message: 'offline');
      await cubit.analyze();
      expect(cubit.state.canResubmit, true);
      repository.failure = null;
      await cubit.analyze();
      expect(repository.ids.length, 2);
      expect(repository.ids[0], repository.ids[1]);
      expect(cubit.state.job?.complete, true);
      expect(File(recorder.path!).existsSync(), false);
    },
  );
  test(
    'account away-and-back clears recording and fences old status completion',
    () async {
      const original = NotesVoiceJob(
        id: 'old',
        workspaceId: 'workspace',
        status: 'completed',
        revision: 4,
        transcript: 'Private',
      );
      repository
        ..retained = original
        ..pendingRefresh = Completer();
      final entering = cubit.setScope('other', 'workspace');
      await Future<void>.delayed(Duration.zero);
      await cubit.setScope(null, null);
      repository.retained = null;
      await cubit.setScope('other', 'workspace');
      repository.pendingRefresh!.complete(original);
      await entering;
      expect(cubit.state.job, isNull);
      await record();
      await cubit.setScope('actor', 'different');
      expect(cubit.capture.state.visible, false);
      expect(File(recorder.path!).existsSync(), false);
    },
  );
  test(
    'temporary refresh retains same actor result; denied access clears it',
    () async {
      repository.retained = const NotesVoiceJob(
        id: 'job',
        workspaceId: 'workspace',
        status: 'completed',
        revision: 4,
        transcript: 'Speech',
      );
      await cubit.setScope('actor', 'different');
      await cubit.setScope('actor', 'workspace');
      repository.failure = const ApiException.transport(message: 'offline');
      await cubit.refresh();
      expect(cubit.state.job?.transcript, 'Speech');
      expect(cubit.state.unavailable, true);
      repository.failure = const ApiException(
        message: 'denied',
        statusCode: 403,
      );
      await cubit.refresh();
      expect(cubit.state.job, isNull);
    },
  );
  test('verification challenge retains authorized snapshot', () async {
    repository.retained = const NotesVoiceJob(
      id: 'job',
      workspaceId: 'workspace',
      status: 'completed',
      revision: 4,
      transcript: 'Speech',
    );
    await cubit.setScope('actor', 'different');
    await cubit.setScope('actor', 'workspace');
    repository.failure = const ApiException(
      message: 'MFA',
      statusCode: 403,
      isVerificationRequired: true,
    );
    await cubit.refresh();
    expect(cubit.state.job?.transcript, 'Speech');
  });
  test('review-required jobs never start a paid automatic retry', () async {
    repository.retained = const NotesVoiceJob(
      id: 'job',
      workspaceId: 'workspace',
      status: 'review_required',
      revision: 4,
    );
    await cubit.setScope('actor', 'different');
    await cubit.setScope('actor', 'workspace');
    await cubit.analyze();
    expect(repository.ids, isEmpty);
  });
  test(
    'explicit save rechecks access before publishing private content',
    () async {
      repository.retained = const NotesVoiceJob(
        id: 'job',
        workspaceId: 'workspace',
        status: 'completed',
        revision: 4,
        transcript: 'Speech',
      );
      await cubit.setScope('actor', 'different');
      await cubit.setScope('actor', 'workspace');
      repository.failure = const ApiException(
        message: 'denied',
        statusCode: 403,
      );
      expect(await cubit.saveReviewed('Untitled'), false);
      expect(repository.saves, 0);
      expect(cubit.state.job, isNull);
    },
  );
  test('background status checks wait until the app is active', () async {
    repository.retained = const NotesVoiceJob(
      id: 'job',
      workspaceId: 'workspace',
      status: 'pending',
      revision: 1,
    );
    cubit.setActive(active: false);
    await cubit.setScope('actor', 'different');
    await cubit.setScope('actor', 'workspace');
    repository.failure = const ApiException(message: 'denied', statusCode: 403);
    await cubit.refresh();
    expect(cubit.state.job?.status, 'pending');
    cubit.setActive(active: true);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.job, isNull);
  });
}
