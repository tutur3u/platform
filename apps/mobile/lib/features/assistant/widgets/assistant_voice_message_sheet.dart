import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:video_player/video_player.dart';

/// A recording is uploaded only after explicit confirmation. Temporary audio
/// is deleted on dismissal, cancellation, or after copying the confirmed bytes.
class AssistantVoiceMessageSheet extends StatefulWidget {
  const AssistantVoiceMessageSheet({
    this.recorder,
    this.temporaryDirectory = getTemporaryDirectory,
    super.key,
  });

  final AudioRecorder? recorder;
  final Future<Directory> Function() temporaryDirectory;

  @override
  State<AssistantVoiceMessageSheet> createState() => _VoiceMessageState();
}

class _VoiceMessageState extends State<AssistantVoiceMessageSheet>
    with WidgetsBindingObserver {
  late final AudioRecorder _recorder = widget.recorder ?? AudioRecorder();
  VideoPlayerController? _preview;
  Timer? _timer;
  Future<void>? _operation;
  String? _path;
  String? _error;
  int _seconds = 0;
  bool _recording = false;
  bool _busy = false;
  bool _hasRecording = false;
  bool _captureAllowed = true;
  int _startGeneration = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _captureAllowed = true;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      _captureAllowed = false;
      _startGeneration++;
      if (_recording) unawaited(_stop());
    }
  }

  Future<void> _start() => _operation = _startRecording();

  Future<void> _startRecording() async {
    if (_busy || !_captureAllowed) return;
    final generation = ++_startGeneration;
    bool isCurrent() =>
        mounted && _captureAllowed && generation == _startGeneration;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final permitted = await _recorder.hasPermission();
      if (!isCurrent()) return;
      if (!permitted) {
        if (mounted) setState(() => _error = context.l10n.voicePermission);
        return;
      }
      final directory = await widget.temporaryDirectory();
      if (!isCurrent()) return;
      final path =
          '${directory.path}/mira-voice-${DateTime.now().microsecondsSinceEpoch}.m4a';
      _path = path;
      await _recorder.start(const RecordConfig(numChannels: 1), path: path);
      if (!isCurrent()) {
        try {
          await _recorder.stop();
        } finally {
          await _deleteRecording();
        }
        return;
      }
      setState(() {
        _recording = true;
        _seconds = 0;
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _seconds++);
        if (_seconds >= 120) unawaited(_stop());
      });
    } on Exception {
      await _deleteRecording();
      if (mounted) setState(() => _error = context.l10n.voiceRecordingError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stop() => _operation = _stopRecording();

  Future<void> _stopRecording() async {
    if (_busy || !_recording) return;
    _timer?.cancel();
    setState(() {
      _busy = true;
      _recording = false;
    });
    try {
      await _recorder.stop();
      final path = _path;
      if (!mounted || path == null) return;
      if (await File(path).length() == 0) {
        throw const FormatException('Empty voice recording');
      }
      if (!mounted) return;
      final preview = VideoPlayerController.file(File(path));
      _preview = preview;
      await preview.initialize();
      if (preview.value.duration <= Duration.zero) {
        throw const FormatException('Voice recording has no audio');
      }
      _hasRecording = true;
      if (mounted) preview.addListener(_updatePreview);
    } on Exception {
      _hasRecording = false;
      final preview = _preview;
      _preview = null;
      try {
        await preview?.dispose();
      } on Exception {
        // A failed native player must not prevent retrying capture.
      }
      await _deleteRecording();
      if (mounted) setState(() => _error = context.l10n.voiceRecordingError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _updatePreview() {
    if (mounted) setState(() {});
  }

  Future<void> _confirm() async {
    final path = _path;
    if (_busy || _recording || !_hasRecording || path == null) return;
    setState(() => _busy = true);
    try {
      final bytes = await File(path).readAsBytes();
      if (!mounted) return;
      Navigator.of(
        context,
      ).pop(AssistantMemoryFile(name: 'voice-message.m4a', bytes: bytes));
    } on Exception {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = context.l10n.voiceRecordingError;
        });
      }
    }
  }

  Future<void> _deleteRecording() async {
    final path = _path;
    _path = null;
    if (path == null) return;
    try {
      final file = File(path);
      if (file.existsSync()) await file.delete();
    } on FileSystemException {
      // The OS may already have reclaimed the temporary recording.
    }
  }

  Future<void> _cleanup() async {
    _timer?.cancel();
    // Do not dispose the native recorder while a permission/start/stop request
    // is still completing after the user dismisses this sheet.
    await _operation;
    try {
      await _recorder.dispose();
    } on Exception {
      // Continue removing the preview and temporary file after native failure.
    }
    try {
      _preview?.removeListener(_updatePreview);
      await _preview?.dispose();
    } on Exception {
      // File cleanup must still run if the native player has already closed.
    } finally {
      await _deleteRecording();
    }
  }

  @override
  void dispose() {
    _captureAllowed = false;
    _startGeneration++;
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_cleanup());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final preview = _preview;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.voiceMessage,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: () => unawaited(Navigator.of(context).maybePop()),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          Text(
            '${(_seconds ~/ 60).toString().padLeft(2, '0')}:'
            '${(_seconds % 60).toString().padLeft(2, '0')}',
          ),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_path == null || _recording)
                FilledButton.icon(
                  onPressed: _busy ? null : (_recording ? _stop : _start),
                  icon: Icon(
                    _recording ? Icons.stop_rounded : Icons.mic_rounded,
                  ),
                  label: Text(_recording ? l10n.voiceStop : l10n.voiceRecord),
                ),
              if (!_recording && _hasRecording) ...[
                if (preview != null && preview.value.isInitialized)
                  IconButton(
                    tooltip: l10n.voicePreview,
                    onPressed: () async {
                      if (preview.value.isPlaying) {
                        await preview.pause();
                      } else {
                        await preview.seekTo(Duration.zero);
                        await preview.play();
                      }
                    },
                    icon: Icon(
                      preview.value.isPlaying ? Icons.pause : Icons.play_arrow,
                    ),
                  ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy ? null : _confirm,
                  child: Text(l10n.voiceAttach),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
