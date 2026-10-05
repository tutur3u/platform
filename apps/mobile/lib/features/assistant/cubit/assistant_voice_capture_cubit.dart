import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

enum AssistantVoiceCaptureStatus {
  idle,
  starting,
  recording,
  paused,
  finishing,
}

enum AssistantVoiceCaptureError { permission, recording }

class AssistantVoiceCaptureState {
  const AssistantVoiceCaptureState({
    this.status = AssistantVoiceCaptureStatus.idle,
    this.seconds = 0,
    this.levels = const [],
    this.error,
  });

  final AssistantVoiceCaptureStatus status;
  final int seconds;
  final List<double> levels;
  final AssistantVoiceCaptureError? error;
  bool get visible => status != AssistantVoiceCaptureStatus.idle;
  bool get recording => status == AssistantVoiceCaptureStatus.recording;
  bool get paused => status == AssistantVoiceCaptureStatus.paused;
  bool get busy =>
      status == AssistantVoiceCaptureStatus.starting ||
      status == AssistantVoiceCaptureStatus.finishing;
}

/// Injectable native boundary; recordings remain local until explicit attach/send.
abstract class AssistantVoiceRecorder {
  Future<bool> hasPermission();
  Future<void> start(String path);
  Future<void> pause();
  Future<void> resume();
  Future<void> stop();
  Stream<double> get levels;
  Future<void> dispose();
}

class NativeAssistantVoiceRecorder implements AssistantVoiceRecorder {
  AudioRecorder? _native;
  AudioRecorder get _recorder => _native ??= AudioRecorder();
  @override
  Future<bool> hasPermission() => _recorder.hasPermission();
  @override
  Future<void> start(String path) =>
      _recorder.start(const RecordConfig(numChannels: 1), path: path);
  @override
  Future<void> pause() => _recorder.pause();
  @override
  Future<void> resume() => _recorder.resume();
  @override
  Future<void> stop() async {
    await _native?.stop();
  }

  @override
  Stream<double> get levels => _recorder
      .onAmplitudeChanged(const Duration(milliseconds: 80))
      .map((amplitude) => ((amplitude.current + 60) / 60).clamp(0, 1));
  @override
  Future<void> dispose() async {
    await _native?.dispose();
    _native = null;
  }
}

class AssistantVoiceCaptureCubit extends Cubit<AssistantVoiceCaptureState>
    with WidgetsBindingObserver {
  AssistantVoiceCaptureCubit({
    AssistantVoiceRecorder? recorder,
    this.temporaryDirectory = getTemporaryDirectory,
    this.fileExtension = 'm4a',
    this.fileName = 'voice-message.m4a',
  }) : _recorder = recorder ?? NativeAssistantVoiceRecorder(),
       super(const AssistantVoiceCaptureState()) {
    if (fileExtension == 'wav' && recorder == null) {
      throw ArgumentError('WAV requires an explicitly configured WAV recorder');
    }
    if (!{'m4a', 'wav'}.contains(fileExtension) ||
        fileName.contains(RegExp(r'[/\\]')) ||
        !fileName.endsWith('.$fileExtension')) {
      throw ArgumentError('Invalid voice recording format');
    }
    WidgetsBinding.instance.addObserver(this);
  }

  final AssistantVoiceRecorder _recorder;
  final String fileExtension;
  final String fileName;
  final Future<Directory> Function() temporaryDirectory;
  StreamSubscription<double>? _levels;
  Timer? _timer;
  Future<void>? _operation;
  String? _path;
  int _generation = 0;
  bool _foreground = true;
  bool _closing = false;
  bool _needsStop = false;

  /// Changes on each capture or cancellation, including scope changes and back.
  int get sessionToken => _generation;

  bool _current(int generation) =>
      !isClosed && !_closing && generation == _generation;

  Future<void> start() {
    if (state.visible || !_foreground || _closing) return Future.value();
    return _operation = _start(++_generation);
  }

  Future<void> _start(int generation) async {
    emit(
      const AssistantVoiceCaptureState(
        status: AssistantVoiceCaptureStatus.starting,
      ),
    );
    try {
      if ((_path != null || _needsStop) && !await _discard()) {
        throw const FileSystemException('Recording cleanup failed');
      }
      final allowed = await _recorder.hasPermission();
      if (!_current(generation) || !_foreground) return;
      if (!allowed) {
        emit(
          const AssistantVoiceCaptureState(
            error: AssistantVoiceCaptureError.permission,
          ),
        );
        return;
      }
      final directory = await temporaryDirectory();
      if (!_current(generation) || !_foreground) return;
      _path =
          '${directory.path}/mira-voice-${DateTime.now().microsecondsSinceEpoch}.$fileExtension';
      _needsStop = true;
      await _recorder.start(_path!);
      if (!_current(generation) || !_foreground) return;
      emit(
        const AssistantVoiceCaptureState(
          status: AssistantVoiceCaptureStatus.recording,
        ),
      );
      _levels = _recorder.levels.listen(
        (level) {
          if (!_current(generation) || !state.recording) return;
          emit(
            AssistantVoiceCaptureState(
              status: state.status,
              seconds: state.seconds,
              levels: [
                ...state.levels.skip(state.levels.length >= 32 ? 1 : 0),
                if (level.isFinite) level.clamp(0, 1) else 0,
              ],
            ),
          );
        },
        onError: (Object error, StackTrace stack) {
          unawaited(_handleStreamFailure(generation));
        },
      );
      _startTimer(generation);
    } on Object {
      await _discard();
      if (_current(generation)) {
        emit(
          const AssistantVoiceCaptureState(
            error: AssistantVoiceCaptureError.recording,
          ),
        );
      }
    }
  }

  Future<void> _handleStreamFailure(int generation) async {
    if (!_current(generation)) return;
    final cleanup = cancel();
    final token = sessionToken;
    await cleanup;
    if (_current(token)) {
      emit(
        const AssistantVoiceCaptureState(
          error: AssistantVoiceCaptureError.recording,
        ),
      );
    }
  }

  void _startTimer(int generation) {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_current(generation) || !state.recording) return;
      emit(
        AssistantVoiceCaptureState(
          status: state.status,
          seconds: state.seconds + 1,
          levels: state.levels,
        ),
      );
      if (state.seconds >= 120) unawaited(pause());
    });
  }

  Future<void> pause() {
    if (!state.recording || _closing) return Future.value();
    return _operation = _toggle(pausing: true);
  }

  Future<void> resume() {
    if (!state.paused || !_foreground || _closing || state.seconds >= 120) {
      return Future.value();
    }
    return _operation = _toggle(pausing: false);
  }

  Future<void> _toggle({required bool pausing}) async {
    final generation = _generation;
    _timer?.cancel();
    final seconds = state.seconds;
    final levels = state.levels;
    emit(
      AssistantVoiceCaptureState(
        status: AssistantVoiceCaptureStatus.finishing,
        seconds: seconds,
        levels: levels,
      ),
    );
    try {
      if (pausing) {
        await _recorder.pause();
      } else {
        await _recorder.resume();
      }
      if (!_current(generation)) return;
      if (!pausing && !_foreground) await _recorder.pause();
      if (!_current(generation)) return;
      final paused = pausing || !_foreground;
      emit(
        AssistantVoiceCaptureState(
          status: paused
              ? AssistantVoiceCaptureStatus.paused
              : AssistantVoiceCaptureStatus.recording,
          seconds: seconds,
          levels: levels,
        ),
      );
      if (!paused) _startTimer(generation);
    } on Object {
      await _discard();
      if (_current(generation)) {
        emit(
          const AssistantVoiceCaptureState(
            error: AssistantVoiceCaptureError.recording,
          ),
        );
      }
    }
  }

  Future<AssistantMemoryFile?> takeRecording() async {
    if (!state.paused || _closing) return null;
    final generation = _generation;
    final work = _takeRecording(generation);
    _operation = work.then((_) {});
    return await work;
  }

  Future<AssistantMemoryFile?> _takeRecording(int generation) async {
    emit(
      AssistantVoiceCaptureState(
        status: AssistantVoiceCaptureStatus.finishing,
        seconds: state.seconds,
        levels: state.levels,
      ),
    );
    AssistantMemoryFile? recording;
    try {
      await _recorder.stop();
      _needsStop = false;
      final path = _path;
      if (!_current(generation) || path == null) return null;
      final bytes = await File(path).readAsBytes();
      if (!_current(generation)) return null;
      if (bytes.isEmpty) throw const FormatException('Empty recording');
      recording = AssistantMemoryFile(name: fileName, bytes: bytes);
    } on Object {
      if (_current(generation)) {
        emit(
          const AssistantVoiceCaptureState(
            error: AssistantVoiceCaptureError.recording,
          ),
        );
      }
      return null;
    } finally {
      final erased = await _discard();
      if (!erased) {
        recording = null;
        if (_current(generation)) {
          emit(
            const AssistantVoiceCaptureState(
              error: AssistantVoiceCaptureError.recording,
            ),
          );
        }
      }
      if (_current(generation) && state.error == null) {
        emit(const AssistantVoiceCaptureState());
      }
    }
    return _current(generation) ? recording : null;
  }

  Future<void> cancel() {
    ++_generation;
    final pending = _operation;
    return _operation = _cancel(pending, _generation);
  }

  Future<void> _cancel(Future<void>? pending, int generation) async {
    await pending;
    final erased = await _discard();
    if (_current(generation)) {
      emit(
        AssistantVoiceCaptureState(
          error: erased ? null : AssistantVoiceCaptureError.recording,
        ),
      );
    }
  }

  Future<void> restart() async {
    final cleanup = cancel();
    final token = sessionToken;
    await cleanup;
    if (_current(token)) await start();
  }

  Future<bool> _discard() async {
    _timer?.cancel();
    await _levels?.cancel();
    _levels = null;
    if (_needsStop) {
      try {
        await _recorder.stop();
        _needsStop = false;
      } on Object {
        // Erase local bytes; block capture until native stop works.
      }
    }
    final path = _path;
    if (path != null) {
      try {
        final file = File(path);
        if (file.existsSync()) await file.delete();
        _path = null;
      } on Object {
        // Retain the path until its recording has been erased.
        return false;
      }
    }
    return !_needsStop;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) {
      if (this.state.recording) {
        unawaited(pause());
      } else if (this.state.status == AssistantVoiceCaptureStatus.starting) {
        unawaited(cancel());
      }
    }
  }

  @override
  Future<void> close() async {
    _closing = true;
    WidgetsBinding.instance.removeObserver(this);
    await cancel();
    await _recorder.dispose();
    await super.close();
  }
}
