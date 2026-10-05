import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/features/notes/voice/notes_voice_repository.dart';

class NotesVoiceState {
  const NotesVoiceState({
    this.job,
    this.busy = false,
    this.unavailable = false,
    this.captureError = false,
    this.canResubmit = false,
  });
  final NotesVoiceJob? job;
  final bool busy;
  final bool unavailable;
  final bool captureError;
  final bool canResubmit;
}

/// Scope generations fence recording, requests, polling and away/back changes.
class NotesVoiceCubit extends Cubit<NotesVoiceState> {
  NotesVoiceCubit({
    required this.capture,
    NotesVoiceRepository? repository,
    Future<String> Function()? timezone,
  }) : _repository = repository ?? NotesVoiceRepository(),
       _timezone = timezone ?? getCurrentTimezoneIdentifier,
       super(const NotesVoiceState());
  final AssistantVoiceCaptureCubit capture;
  final NotesVoiceRepository _repository;
  final Future<String> Function() _timezone;
  String? _actor;
  String? _workspace;
  int _generation = 0;
  Uint8List? _audio;
  String? _intent;
  String? _zone;
  Timer? _poll;
  bool _fetching = false;
  bool _active = true;
  void setActive({required bool active}) {
    if (_active == active) return;
    _active = active;
    _poll?.cancel();
    if (active && state.job?.processing == true) unawaited(refresh());
  }

  bool _current(int generation) => !isClosed && generation == _generation;
  Future<void> setScope(String? actor, String? workspace) async {
    if (_actor == actor && _workspace == workspace) return;
    final generation = ++_generation;
    _repository.invalidateScope();
    _actor = actor;
    _workspace = workspace;
    _poll?.cancel();
    _audio = null;
    _intent = null;
    _zone = null;
    _fetching = false;
    emit(const NotesVoiceState());
    await capture.cancel();
    if (!_current(generation) || actor == null || workspace == null) return;
    try {
      final cached = await _repository.cached(actor, workspace);
      if (!_current(generation)) return;
      if (cached != null) {
        emit(NotesVoiceState(job: cached));
        await refresh();
      }
    } on Object {
      if (_current(generation)) emit(const NotesVoiceState(unavailable: true));
    }
  }

  Future<void> start() async {
    if (_actor == null ||
        _workspace == null ||
        state.busy ||
        state.job?.processing == true) {
      return;
    }
    _audio = null;
    _intent = null;
    _zone = null;
    emit(const NotesVoiceState());
    await capture.start();
  }

  Future<void> analyze() async {
    final actor = _actor;
    final workspace = _workspace;
    final generation = _generation;
    if (actor == null ||
        workspace == null ||
        state.busy ||
        state.job?.processing == true ||
        state.job?.status == 'review_required') {
      return;
    }
    emit(NotesVoiceState(job: state.job, busy: true));
    try {
      if (_audio == null) {
        final session = capture.sessionToken;
        final recording = await capture.takeRecording();
        if (!_current(generation) || session != capture.sessionToken) return;
        if (recording == null) {
          emit(const NotesVoiceState(captureError: true));
          return;
        }
        final bytes = await recording.readAsBytes();
        if (!_current(generation)) return;
        _audio = bytes;
        _intent = newLocalMutationId();
      }
      _zone ??= await _timezone();
      if (!_current(generation)) return;
      final job = await _repository.submit(
        actor,
        workspace,
        requestId: _intent!,
        audio: _audio!,
        timezone: _zone!,
        expectedRevision: state.job?.retryable == true
            ? state.job?.revision
            : null,
      );
      if (!_current(generation)) return;
      emit(
        NotesVoiceState(job: job, canResubmit: job.retryable && _audio != null),
      );
      if (job.processing) _schedule();
      if (job.complete || job.status == 'review_required') _audio = null;
    } on ApiException catch (error) {
      if (!_current(generation)) return;
      final denied =
          {401, 403}.contains(error.statusCode) &&
          !error.isVerificationRequired;
      if (denied) {
        _audio = null;
        _intent = null;
      }
      emit(
        NotesVoiceState(
          job: denied ? null : state.job,
          unavailable: true,
          canResubmit: _audio != null,
        ),
      );
    } on Object {
      if (_current(generation)) {
        emit(
          NotesVoiceState(
            job: state.job,
            unavailable: true,
            canResubmit: _audio != null,
          ),
        );
      }
    }
  }

  void _schedule() {
    _poll?.cancel();
    if (!_active) return;
    _poll = Timer(const Duration(seconds: 2), () => unawaited(refresh()));
  }

  Future<void> refresh() async {
    final job = state.job;
    final actor = _actor;
    final workspace = _workspace;
    final generation = _generation;
    if (job == null ||
        actor == null ||
        workspace == null ||
        !_active ||
        _fetching) {
      return;
    }
    _fetching = true;
    try {
      final latest = await _repository.refresh(actor, workspace, job.id);
      if (!_current(generation)) return;
      emit(
        NotesVoiceState(
          job: latest,
          canResubmit: latest?.retryable == true && _audio != null,
        ),
      );
      if (latest?.processing == true) _schedule();
      if (latest?.complete == true || latest?.status == 'review_required') {
        _audio = null;
      }
    } on ApiException catch (error) {
      if (!_current(generation)) return;
      final denied =
          {401, 403, 404}.contains(error.statusCode) &&
          !error.isVerificationRequired;
      if (denied) {
        _audio = null;
        _intent = null;
        _poll?.cancel();
      }
      emit(NotesVoiceState(job: denied ? null : job, unavailable: true));
      // Temporary failures retain this actor's result with explicit retry.
    } on Object {
      if (_current(generation)) {
        emit(NotesVoiceState(job: job, unavailable: true));
      }
    } finally {
      if (_current(generation)) _fetching = false;
    }
  }

  Future<bool> saveReviewed(String untitled) async {
    final job = state.job;
    final actor = _actor;
    final workspace = _workspace;
    final generation = _generation;
    if (job == null ||
        !job.canSave ||
        state.busy ||
        actor == null ||
        workspace == null) {
      return false;
    }
    emit(NotesVoiceState(job: job, busy: true));
    try {
      final verified = await _repository.refresh(actor, workspace, job.id);
      if (!_current(generation)) return false;
      if (verified == null || !verified.canSave) {
        emit(NotesVoiceState(job: verified, unavailable: true));
        return false;
      }
      await _repository.saveReviewed(actor, workspace, verified, untitled);
      if (!_current(generation)) return false;
      emit(NotesVoiceState(job: verified));
      return true;
    } on ApiException catch (error) {
      if (_current(generation)) {
        emit(
          NotesVoiceState(
            job:
                {401, 403, 404}.contains(error.statusCode) &&
                    !error.isVerificationRequired
                ? null
                : job,
            unavailable: true,
          ),
        );
      }
      return false;
    } on Object {
      if (_current(generation)) {
        emit(NotesVoiceState(job: job, unavailable: true));
      }
      return false;
    }
  }

  Future<void> discard() async {
    final generation = _generation;
    final actor = _actor;
    final workspace = _workspace;
    final job = state.job;
    if (state.busy || job?.processing == true) return;
    if (actor != null && workspace != null && job != null) {
      try {
        await _repository.delete(actor, workspace, job.id);
      } on Object {
        if (_current(generation)) {
          emit(NotesVoiceState(job: job, unavailable: true));
        }
        return;
      }
      if (!_current(generation)) return;
    }
    _audio = null;
    _intent = null;
    _zone = null;
    await capture.cancel();
    if (_current(generation)) emit(const NotesVoiceState());
  }

  @override
  Future<void> close() async {
    _generation++;
    _repository.invalidateScope();
    _poll?.cancel();
    _audio = null;
    await capture.close();
    _repository.dispose();
    return await super.close();
  }
}
