import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/view/meet_participant_tile.dart';
import 'package:mobile/features/meet/view/meet_room_sheets.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class MeetNativeRoomPage extends StatefulWidget {
  const MeetNativeRoomPage({
    required this.workspaceId,
    required this.meetingId,
    super.key,
    this.title,
    this.repository,
  });

  final String workspaceId;
  final String meetingId;
  final String? title;
  final MeetRepository? repository;

  @override
  State<MeetNativeRoomPage> createState() => _MeetNativeRoomPageState();
}

class _MeetNativeRoomPageState extends State<MeetNativeRoomPage> {
  late final MeetCallController _call = MeetCallController(
    workspaceId: widget.workspaceId,
    meetingId: widget.meetingId,
    repository: widget.repository,
  );
  bool _joinRequested = false;
  bool _audioPreferred = true;
  bool _previewBusy = false;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    unawaited(_call.prepareMedia());
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _call.roomExpiresAt != null) setState(() {});
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _call.dispose();
    super.dispose();
  }

  void _leave() => context.go(Routes.meet);

  String? _remainingTime() {
    final deadline = _call.roomExpiresAt;
    if (deadline == null) return null;
    final seconds = deadline
        .difference(DateTime.now())
        .inSeconds
        .clamp(0, 86400);
    final minutes = seconds ~/ 60;
    final hours = (minutes ~/ 60).toString().padLeft(2, '0');
    final mins = (minutes % 60).toString().padLeft(2, '0');
    final secs = (seconds % 60).toString().padLeft(2, '0');
    return '$hours:$mins:$secs';
  }

  Future<void> _join() async {
    if (_joinRequested) return;
    setState(() => _joinRequested = true);
    try {
      if (_audioPreferred) await _call.setMicrophone(enabled: true);
      await _call.start();
    } on Object {
      if (mounted) setState(() => _joinRequested = false);
      _showError();
    }
  }

  Future<void> _togglePreviewVideo() async {
    if (_previewBusy) return;
    setState(() => _previewBusy = true);
    try {
      await _call.prepareMedia();
      await _call.setCamera(enabled: !_call.media.videoEnabled);
    } on Object {
      _showError();
    } finally {
      if (mounted) setState(() => _previewBusy = false);
    }
  }

  Widget _buildLobby(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.meetReadyToJoin,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            AspectRatio(
              aspectRatio: 16 / 9,
              child: MeetParticipantTile(
                name: l10n.meetYou,
                local: true,
                microphoneOn: _audioPreferred,
                renderer: _call.media.videoEnabled
                    ? _call.media.localRenderer
                    : null,
              ),
            ),
            const SizedBox(height: 12),
            Text(l10n.meetPreviewPrivate, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 12,
              children: [
                IconButton.filledTonal(
                  tooltip: _audioPreferred ? l10n.meetMute : l10n.meetUnmute,
                  onPressed: () =>
                      setState(() => _audioPreferred = !_audioPreferred),
                  icon: Icon(
                    _audioPreferred
                        ? Icons.mic_outlined
                        : Icons.mic_off_outlined,
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: _call.media.videoEnabled
                      ? l10n.meetCameraOff
                      : l10n.meetCameraOn,
                  onPressed: _previewBusy ? null : _togglePreviewVideo,
                  icon: Icon(
                    _call.media.videoEnabled
                        ? Icons.videocam_outlined
                        : Icons.videocam_off_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _join,
              icon: const Icon(Icons.login),
              label: Text(l10n.meetJoin),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeviceChoice(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.devices_outlined, size: 48),
            const SizedBox(height: 12),
            Text(
              l10n.meetDeviceAlreadyJoined,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(l10n.meetDeviceChoiceHint, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _call.status == 'connecting'
                  ? null
                  : () =>
                        unawaited(_call.chooseDevice(switchToThisDevice: true)),
              icon: const Icon(Icons.swap_horiz),
              label: Text(l10n.meetSwitchDevice),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _call.status == 'connecting'
                  ? null
                  : () => unawaited(
                      _call.chooseDevice(switchToThisDevice: false),
                    ),
              icon: const Icon(Icons.devices),
              label: Text(l10n.meetJoinAnotherDevice),
            ),
            const SizedBox(height: 8),
            Text(l10n.meetDeviceEchoHint, textAlign: TextAlign.center),
            if (_call.error != null) ...[
              const SizedBox(height: 12),
              Text(l10n.commonSomethingWentWrong),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _end() async {
    try {
      await _call.endRoom();
      if (mounted) _leave();
    } on Object {
      _showError();
    }
  }

  void _showError() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
    );
  }

  Future<void> _toggleAudio() async {
    try {
      await _call.setMicrophone(enabled: !_call.media.audioEnabled);
    } on Object {
      _showError();
    }
  }

  Future<void> _toggleVideo() async {
    try {
      await _call.setCamera(enabled: !_call.media.videoEnabled);
    } on Object {
      _showError();
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _call,
    builder: (context, _) {
      final l10n = context.l10n;
      final joined = _call.admission == 'admitted';
      final localName =
          _call.participants[_call.selfUserId]?['displayName'] as String? ??
          l10n.meetYou;
      final others = _call.participants.entries
          .where((entry) => entry.key != _call.selfUserId)
          .toList();
      return Stack(
        children: [
          const ShellChromeActions(
            ownerId: 'meet-native-room',
            locations: {Routes.meet},
            actions: [],
            immersive: true,
          ),
          Scaffold(
            appBar: AppBar(
              title: Text(
                _call.title ?? widget.title ?? l10n.meetTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              leading: IconButton(
                tooltip: l10n.meetLeave,
                onPressed: _leave,
                icon: const Icon(Icons.arrow_back),
              ),
              actions: [
                if (_joinRequested && _remainingTime() != null)
                  Center(
                    child: Semantics(
                      label: l10n.meetTimeRemaining,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(_remainingTime()!),
                      ),
                    ),
                  ),
                if (_joinRequested)
                  IconButton(
                    tooltip: l10n.meetParticipants,
                    onPressed: () =>
                        unawaited(showMeetParticipantsSheet(context, _call)),
                    icon: const Icon(Icons.people_outline),
                  ),
                if (_joinRequested && _call.role == 'host')
                  PopupMenuButton<String>(
                    onSelected: (action) {
                      if (action == 'end') unawaited(_end());
                      if (action == 'costs') {
                        unawaited(showMeetCostsSheet(context, _call));
                      }
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'costs',
                        child: Row(
                          children: [
                            const Icon(Icons.paid_outlined),
                            const SizedBox(width: 10),
                            Text(l10n.meetEstimatedCosts),
                          ],
                        ),
                      ),
                      PopupMenuItem(
                        value: 'end',
                        child: Row(
                          children: [
                            const Icon(Icons.call_end),
                            const SizedBox(width: 10),
                            Text(l10n.meetEndForEveryone),
                          ],
                        ),
                      ),
                    ],
                  ),
              ],
            ),
            body: SafeArea(
              child: Column(
                children: [
                  if (_call.waiting.isNotEmpty && _call.role == 'host')
                    ListTile(
                      leading: const Icon(Icons.person_add_alt_1_outlined),
                      title: Text(l10n.meetParticipants),
                      trailing: Text('${_call.waiting.length}'),
                      onTap: () =>
                          unawaited(showMeetParticipantsSheet(context, _call)),
                    ),
                  Expanded(
                    child: !_joinRequested
                        ? _buildLobby(context)
                        : _call.requiresDeviceChoice
                        ? _buildDeviceChoice(context)
                        : switch ((_call.ended, _call.admission)) {
                            (true, _) => Center(
                              child: Text(l10n.meetCallEnded),
                            ),
                            _
                                when _call.error != null &&
                                    _call.status != 'open' =>
                              Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        l10n.commonSomethingWentWrong,
                                        textAlign: TextAlign.center,
                                      ),
                                      const SizedBox(height: 12),
                                      TextButton.icon(
                                        onPressed: () =>
                                            unawaited(_call.start()),
                                        icon: const Icon(Icons.refresh),
                                        label: Text(l10n.commonRetry),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            (_, 'denied') => Center(
                              child: Text(l10n.meetAccessDenied),
                            ),
                            (_, 'waiting') => Center(
                              child: Text(l10n.meetWaitingForHost),
                            ),
                            _ when !joined => Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const NovaLoadingIndicator(size: 28),
                                  const SizedBox(height: 12),
                                  Text(
                                    _call.status == 'reconnecting'
                                        ? l10n.meetReconnecting
                                        : l10n.meetConnecting,
                                  ),
                                ],
                              ),
                            ),
                            _ => LayoutBuilder(
                              builder: (context, constraints) {
                                final columns = constraints.maxWidth >= 700
                                    ? 3
                                    : others.isEmpty
                                    ? 1
                                    : 2;
                                return GridView.builder(
                                  padding: const EdgeInsets.all(12),
                                  itemCount: others.length + 1,
                                  gridDelegate:
                                      SliverGridDelegateWithFixedCrossAxisCount(
                                        crossAxisCount: columns,
                                        crossAxisSpacing: 10,
                                        mainAxisSpacing: 10,
                                        childAspectRatio: 1.1,
                                      ),
                                  itemBuilder: (context, index) {
                                    if (index == 0) {
                                      return MeetParticipantTile(
                                        name: localName,
                                        local: true,
                                        microphoneOn: _call.media.audioEnabled,
                                        renderer: _call.media.videoEnabled
                                            ? _call.media.localRenderer
                                            : null,
                                      );
                                    }
                                    final person = others[index - 1];
                                    final media = person.value['media'] as Map?;
                                    return MeetParticipantTile(
                                      name:
                                          person.value['displayName']
                                              as String? ??
                                          l10n.meetParticipants,
                                      microphoneOn:
                                          media?['audioEnabled'] == true,
                                      renderer: _call
                                          .media
                                          .remoteRenderers[person.key],
                                    );
                                  },
                                );
                              },
                            ),
                          },
                  ),
                  if (joined && !_call.ended)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                      child: Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        children: [
                          IconButton.filledTonal(
                            tooltip: l10n.meetMicrophone,
                            onPressed: _toggleAudio,
                            icon: Icon(
                              _call.media.audioEnabled
                                  ? Icons.mic_outlined
                                  : Icons.mic_off_outlined,
                            ),
                          ),
                          IconButton.filledTonal(
                            tooltip: l10n.meetCamera,
                            onPressed: _toggleVideo,
                            icon: Icon(
                              _call.media.videoEnabled
                                  ? Icons.videocam_outlined
                                  : Icons.videocam_off_outlined,
                            ),
                          ),
                          if (_call.roomAudio.sessionId != null)
                            IconButton.filledTonal(
                              tooltip: _call.roomAudio.failed
                                  ? l10n.meetMiraAudioRetry
                                  : _call.roomAudio.enabled
                                  ? l10n.meetMiraAudioMute
                                  : l10n.meetMiraAudioUnmute,
                              onPressed: () => _call.roomAudio.setEnabled(
                                value: !_call.roomAudio.enabled,
                              ),
                              icon: Icon(
                                _call.roomAudio.enabled
                                    ? Icons.volume_up_outlined
                                    : Icons.volume_off_outlined,
                              ),
                            ),
                          if (_call.media.videoEnabled)
                            IconButton.filledTonal(
                              tooltip: l10n.meetSwitchCamera,
                              onPressed: () =>
                                  unawaited(_call.media.switchCamera()),
                              icon: const Icon(Icons.cameraswitch_outlined),
                            ),
                          IconButton.filledTonal(
                            tooltip: _call.handRaised
                                ? l10n.meetLowerHand
                                : l10n.meetRaiseHand,
                            onPressed: () =>
                                _call.setHandRaised(raised: !_call.handRaised),
                            icon: Icon(
                              _call.handRaised
                                  ? Icons.back_hand
                                  : Icons.back_hand_outlined,
                            ),
                          ),
                          PopupMenuButton<String>(
                            tooltip: l10n.meetReactions,
                            icon: const Icon(Icons.emoji_emotions_outlined),
                            onSelected: _call.react,
                            itemBuilder: (_) => [
                              for (final reaction in const [
                                'like',
                                'heart',
                                'clap',
                                'laugh',
                                'wow',
                                'celebrate',
                              ])
                                PopupMenuItem(
                                  value: reaction,
                                  child: Row(
                                    children: [
                                      Icon(switch (reaction) {
                                        'like' => Icons.thumb_up_outlined,
                                        'heart' => Icons.favorite_outline,
                                        'clap' => Icons.front_hand_outlined,
                                        'laugh' =>
                                          Icons.sentiment_very_satisfied,
                                        'wow' => Icons.auto_awesome_outlined,
                                        _ => Icons.celebration_outlined,
                                      }),
                                      const SizedBox(width: 10),
                                      Text(switch (reaction) {
                                        'like' => l10n.meetReactionLike,
                                        'heart' => l10n.meetReactionHeart,
                                        'clap' => l10n.meetReactionClap,
                                        'laugh' => l10n.meetReactionLaugh,
                                        'wow' => l10n.meetReactionWow,
                                        _ => l10n.meetReactionCelebrate,
                                      }),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                          IconButton.filledTonal(
                            tooltip: l10n.meetChat,
                            onPressed: () =>
                                unawaited(showMeetChatSheet(context, _call)),
                            icon: const Icon(Icons.chat_bubble_outline),
                          ),
                          IconButton.filled(
                            tooltip: l10n.meetLeave,
                            onPressed: _leave,
                            icon: const Icon(Icons.call_end),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      );
    },
  );
}
