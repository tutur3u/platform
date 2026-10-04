import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_repository.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_server.dart';
import 'package:mobile/features/meet/fixtures/meet_fixture_sfu.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Reachable only from the debug fixture entrypoint; no account bootstrap.
class MeetCaptureFixture extends StatefulWidget {
  const MeetCaptureFixture({super.key});
  @override
  State<MeetCaptureFixture> createState() => _MeetCaptureFixtureState();
}

class _MeetCaptureFixtureState extends State<MeetCaptureFixture> {
  final _renderer = RTCVideoRenderer();
  late final _sfu = MeetFixtureSfu(_renderer);
  late final _server = MeetFixtureServer(
    sfuRequest: _sfu.request,
    sfuIdle: _sfu.idle,
    sfuReset: _sfu.reset,
  );
  MeetFixtureRepository? _repository;
  MeetCallController? _call;
  late final Future<void> _initialization;
  Timer? _poll;
  bool _busy = false;
  bool _failed = false;
  bool _polling = false;
  int _frames = 0;

  @override
  void initState() {
    super.initState();
    _initialization = _initialize();
    unawaited(_initialization);
  }

  Future<void> _initialize() async {
    try {
      await _renderer.initialize();
      if (!mounted) return;
      await _server.start();
      if (!mounted) return;
      final repository = MeetFixtureRepository(_server);
      _repository = repository;
      final call = MeetCallController(
        workspaceId: MeetFixtureServer.workspaceId,
        meetingId: MeetFixtureServer.meetingId,
        repository: repository,
      );
      _call = call;
      call.addListener(_updated);
      await call.start();
      if (!mounted) return;
      _poll = Timer.periodic(
        const Duration(seconds: 1),
        (_) => unawaited(_readFrames()),
      );
      setState(() {});
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _updated() {
    if (mounted) setState(() {});
  }

  Future<void> _screen(bool enabled) async {
    final call = _call;
    if (call == null || _busy) return;
    final l10n = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _failed = false;
      if (enabled) _frames = 0;
    });
    try {
      await call.setScreen(
        enabled: enabled,
        title: l10n.meetScreenFixtureTitle,
        stopLabel: l10n.meetStopSharing,
      );
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _readFrames() async {
    if (_polling) return;
    _polling = true;
    try {
      final frames = await _sfu.decodedFrames();
      if (mounted && _call?.media.screenEnabled == true) {
        setState(() => _frames = frames);
      }
    } on Object {
      // Closing a publisher concurrently with a stats read is expected.
    } finally {
      _polling = false;
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _call?.removeListener(_updated);
    _call?.dispose();
    _repository?.dispose();
    unawaited(_cleanup());
    super.dispose();
  }

  Future<void> _cleanup() async {
    await _initialization;
    await _server.close();
    await _sfu.close();
    _renderer.srcObject = null;
    await _renderer.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final call = _call;
    final live = call?.media.screenEnabled == true;
    final admitted = call?.status == 'open' && call?.admission == 'admitted';
    return Scaffold(
      appBar: AppBar(title: Text(l10n.meetScreenFixtureTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(l10n.meetScreenFixtureHint),
              Text(
                admitted ? l10n.meetFixtureConnected : l10n.meetConnecting,
                key: const Key('fixture-admission'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('fixture-start-capture'),
                onPressed: admitted && !_busy && !live
                    ? () => _screen(true)
                    : null,
                child: Text(l10n.meetShareScreen),
              ),
              TextButton(
                key: const Key('fixture-stop-capture'),
                onPressed: live && !_busy ? () => _screen(false) : null,
                child: Text(l10n.meetStopSharing),
              ),
              Wrap(
                children: [
                  TextButton(
                    key: const Key('fixture-revoke'),
                    onPressed: live ? _server.revokeScreen : null,
                    child: Text(l10n.meetFixtureRevoke),
                  ),
                  TextButton(
                    key: const Key('fixture-reconnect'),
                    onPressed: admitted && !_busy
                        ? () => unawaited(_server.disconnect())
                        : null,
                    child: Text(l10n.meetFixtureReconnect),
                  ),
                ],
              ),
              Text(
                l10n.meetScreenFixtureFrames(_frames),
                key: const Key('fixture-decoded-frames'),
              ),
              if (_failed || call?.error != null)
                Text(l10n.meetScreenShareFailed),
              const SizedBox(height: 12),
              Expanded(child: RTCVideoView(_renderer)),
            ],
          ),
        ),
      ),
    );
  }
}
