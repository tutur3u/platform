import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_screen_capture.dart';
import 'package:mobile/features/meet/fixtures/meet_capture_loopback.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Deliberately reachable only from main_realtime_fixture.dart.
class MeetCaptureFixture extends StatefulWidget {
  const MeetCaptureFixture({super.key});
  @override
  State<MeetCaptureFixture> createState() => _MeetCaptureFixtureState();
}

class _MeetCaptureFixtureState extends State<MeetCaptureFixture>
    with WidgetsBindingObserver {
  final _capture = MeetScreenCapture();
  final _renderer = RTCVideoRenderer();
  MeetCaptureLoopback? _loopback;
  Timer? _poll;
  bool _ready = false;
  bool _busy = false;
  bool _live = false;
  bool _failed = false;
  bool _polling = false;
  int _frames = 0;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    await _renderer.initialize();
    if (mounted) {
      setState(() => _ready = true);
    } else {
      await _renderer.dispose();
    }
  }

  Future<void> _start() async {
    if (_busy || !_ready || _live) return;
    final generation = ++_generation;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _failed = false;
      _frames = 0;
    });
    try {
      await _capture.start(
        title: l10n.meetScreenFixtureTitle,
        stopLabel: l10n.meetStopSharing,
        onStopped: () => unawaited(_stop()),
      );
      if (!mounted || generation != _generation || _capture.stream == null) {
        return;
      }
      final loopback = MeetCaptureLoopback();
      _loopback = loopback;
      await loopback.start(_capture.stream!, _renderer);
      if (!mounted || generation != _generation) return;
      setState(() => _live = true);
      _poll = Timer.periodic(
        const Duration(seconds: 1),
        (_) => unawaited(_readFrames(generation)),
      );
    } on Object {
      await _stop();
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _readFrames(int generation) async {
    if (_polling) return;
    _polling = true;
    try {
      final frames = await _loopback?.decodedFrames();
      if (mounted && generation == _generation) {
        setState(() => _frames = frames ?? 0);
      }
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    } finally {
      _polling = false;
    }
  }

  Future<void> _stop() async {
    _generation++;
    _poll?.cancel();
    _poll = null;
    final loopback = _loopback;
    _loopback = null;
    _renderer.srcObject = null;
    try {
      await loopback?.close();
    } finally {
      await _capture.stop();
      if (mounted) setState(() => _live = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.detached) unawaited(_stop());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _generation++;
    _poll?.cancel();
    unawaited(_capture.stop());
    unawaited(_loopback?.close());
    _renderer.srcObject = null;
    unawaited(_renderer.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.meetScreenFixtureTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(l10n.meetScreenFixtureHint),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('fixture-start-capture'),
                onPressed: _ready && !_busy && !_live ? _start : null,
                child: Text(l10n.meetShareScreen),
              ),
              TextButton(
                key: const Key('fixture-stop-capture'),
                onPressed: _live || _busy ? _stop : null,
                child: Text(l10n.meetStopSharing),
              ),
              Text(
                l10n.meetScreenFixtureFrames(_frames),
                key: const Key('fixture-decoded-frames'),
              ),
              if (_failed) Text(l10n.meetScreenShareFailed),
              const SizedBox(height: 12),
              Expanded(child: RTCVideoView(_renderer)),
            ],
          ),
        ),
      ),
    );
  }
}
