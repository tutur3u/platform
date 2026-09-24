import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/view/meet_ended_review.dart';
import 'package:mobile/features/meet/view/meet_media_status_banner.dart';
import 'package:mobile/features/meet/view/meet_participant_tile.dart';
import 'package:mobile/features/meet/view/meet_room_exit_actions.dart';
import 'package:mobile/features/meet/view/meet_room_sheets.dart';
import 'package:mobile/features/meet/view/meet_time_format.dart';
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
  late final MeetRepository _repository = widget.repository ?? MeetRepository();
  late final MeetCallController _call = MeetCallController(
    workspaceId: widget.workspaceId,
    meetingId: widget.meetingId,
    repository: widget.repository,
  );
  bool _joinRequested = false;
  bool _audioPreferred = true;
  bool _previewBusy = false;
  bool _checkingRoom = true;
  bool _reviewBusy = false;
  bool _endedReviewRequested = false;
  Map<String, dynamic>? _endedReview;
  String? _reviewError;
  Timer? _countdownTimer;
  bool _hadRecentReaction = false;

  @override
  void initState() {
    super.initState();
    _call.addListener(_onCallUpdated);
    unawaited(_checkRoomBeforeMedia());
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final hasRecentReaction = _call.hasRecentReaction;
      if (_call.roomExpiresAt != null ||
          hasRecentReaction ||
          _hadRecentReaction) {
        setState(() {});
      }
      _hadRecentReaction = hasRecentReaction;
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _call.removeListener(_onCallUpdated);
    _call.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  void _onCallUpdated() {
    if (_call.ended && !_endedReviewRequested) {
      _endedReviewRequested = true;
      unawaited(_loadEndedReview());
    }
  }

  Future<void> _checkRoomBeforeMedia() async {
    setState(() {
      _checkingRoom = true;
      _reviewError = null;
    });
    try {
      final review = await _repository.getMeetingReview(
        widget.workspaceId,
        widget.meetingId,
      );
      if (!mounted) return;
      if (review['ended'] == true) {
        setState(() => _endedReview = review);
      } else {
        await _call.prepareMedia();
      }
    } on Object {
      if (mounted) {
        setState(() => _reviewError = context.l10n.meetReviewCheckFailed);
      }
    } finally {
      if (mounted) setState(() => _checkingRoom = false);
    }
  }

  Future<void> _loadEndedReview() async {
    if (_reviewBusy) return;
    setState(() => _reviewBusy = true);
    try {
      final review = await _repository.getMeetingReview(
        widget.workspaceId,
        widget.meetingId,
      );
      if (mounted) setState(() => _endedReview = review);
    } on Object {
      if (mounted) {
        setState(() => _reviewError = context.l10n.meetReviewUnavailable);
      }
    } finally {
      if (mounted) setState(() => _reviewBusy = false);
    }
  }

  Future<void> _leave() async {
    if (_call.role != 'host' || _call.admission != 'admitted' || _call.ended) {
      context.go(Routes.meet);
      return;
    }
    final choice = await showMeetExitChoice(context);
    if (!mounted) return;
    if (choice == MeetExitChoice.leave) context.go(Routes.meet);
    if (choice == MeetExitChoice.end) await _end();
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
    final actions = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          children: [
            IconButton.filledTonal(
              tooltip: _audioPreferred ? l10n.meetMute : l10n.meetUnmute,
              onPressed: () =>
                  setState(() => _audioPreferred = !_audioPreferred),
              icon: Icon(
                _audioPreferred ? Icons.mic_outlined : Icons.mic_off_outlined,
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
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _join,
          icon: const Icon(Icons.login),
          label: Text(l10n.meetJoin),
        ),
      ],
    );
    Widget preview(double width) => SizedBox(
      width: width,
      height: width * 9 / 16,
      child: MeetParticipantTile(
        name: l10n.meetYou,
        local: true,
        microphoneOn: _audioPreferred,
        renderer: _call.media.videoEnabled ? _call.media.localRenderer : null,
      ),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 600;
        final previewWidth = math.min(
          wide ? (constraints.maxWidth - 56) * 0.55 : constraints.maxWidth - 48,
          constraints.maxHeight * (wide ? 0.72 : 0.34) * 16 / 9,
        );
        final intro = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.meetReadyToJoin,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            Text(l10n.meetPreviewPrivate, textAlign: TextAlign.center),
          ],
        );
        if (wide) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(child: Center(child: preview(previewWidth))),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(child: SingleChildScrollView(child: intro)),
                      const SizedBox(height: 20),
                      actions,
                    ],
                  ),
                ),
              ],
            ),
          );
        }
        return Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                intro,
                const SizedBox(height: 16),
                preview(previewWidth),
                const SizedBox(height: 16),
                actions,
              ],
            ),
          ),
        );
      },
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
      if (mounted) await _loadEndedReview();
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
                onPressed: () => unawaited(_leave()),
                icon: const Icon(Icons.arrow_back),
              ),
              actions: [
                if (_joinRequested &&
                    !_call.ended &&
                    formatMeetRemainingTime(_call.roomExpiresAt) != null)
                  Center(
                    child: Semantics(
                      label: l10n.meetTimeRemaining,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          formatMeetRemainingTime(_call.roomExpiresAt)!,
                        ),
                      ),
                    ),
                  ),
                if (_joinRequested && !_call.ended)
                  IconButton(
                    tooltip: l10n.meetParticipants,
                    onPressed: () =>
                        unawaited(showMeetParticipantsSheet(context, _call)),
                    icon: const Icon(Icons.people_outline),
                  ),
                if (_joinRequested && !_call.ended && _call.role == 'host')
                  MeetHostActionsMenu(
                    onLeaveOrEnd: () => unawaited(_leave()),
                    onCosts: () =>
                        unawaited(showMeetCostsSheet(context, _call)),
                    onSettings: () =>
                        unawaited(showMeetSettingsSheet(context, _call)),
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
                    child: _checkingRoom
                        ? const Center(child: NovaLoadingIndicator(size: 28))
                        : _endedReview != null
                        ? MeetEndedReview(
                            review: _endedReview!,
                            onRefresh: () => unawaited(_loadEndedReview()),
                          )
                        : _reviewError != null
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(_reviewError!),
                                const SizedBox(height: 12),
                                OutlinedButton.icon(
                                  onPressed: _call.ended
                                      ? () => unawaited(_loadEndedReview())
                                      : () =>
                                            unawaited(_checkRoomBeforeMedia()),
                                  icon: const Icon(Icons.refresh_rounded),
                                  label: Text(l10n.commonRetry),
                                ),
                              ],
                            ),
                          )
                        : !_joinRequested
                        ? _buildLobby(context)
                        : _call.requiresDeviceChoice
                        ? _buildDeviceChoice(context)
                        : switch ((_call.ended, _call.admission)) {
                            (true, _) => const Center(
                              child: NovaLoadingIndicator(size: 28),
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
                                        handRaised: _call.handRaised,
                                        reaction: _call.recentReaction(
                                          _call.selfUserId,
                                        ),
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
                                      handRaised: _call.isHandRaised(
                                        person.key,
                                      ),
                                      reaction: _call.recentReaction(
                                        person.key,
                                      ),
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
                  if (joined && _call.error == 'media')
                    MeetMediaStatusBanner(
                      onRetry: () => unawaited(_call.retryMedia()),
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
                            onPressed: () => unawaited(_leave()),
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
