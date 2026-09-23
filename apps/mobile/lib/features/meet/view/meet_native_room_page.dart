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

  @override
  void initState() {
    super.initState();
    unawaited(_call.start());
  }

  @override
  void dispose() {
    _call.dispose();
    super.dispose();
  }

  void _leave() => context.go(Routes.meet);

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
                IconButton(
                  tooltip: l10n.meetParticipants,
                  onPressed: () =>
                      unawaited(showMeetParticipantsSheet(context, _call)),
                  icon: const Icon(Icons.people_outline),
                ),
                if (_call.role == 'host')
                  PopupMenuButton<String>(
                    onSelected: (_) => unawaited(_end()),
                    itemBuilder: (_) => [
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
                    child: switch ((_call.ended, _call.admission)) {
                      (true, _) => Center(child: Text(l10n.meetCallEnded)),
                      _ when _call.error != null && _call.status != 'open' =>
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              l10n.commonSomethingWentWrong,
                              textAlign: TextAlign.center,
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
                                    person.value['displayName'] as String? ??
                                    l10n.meetParticipants,
                                microphoneOn: media?['audioEnabled'] == true,
                                renderer:
                                    _call.media.remoteRenderers[person.key],
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
                          if (_call.media.videoEnabled)
                            IconButton.filledTonal(
                              tooltip: l10n.meetSwitchCamera,
                              onPressed: () =>
                                  unawaited(_call.media.switchCamera()),
                              icon: const Icon(Icons.cameraswitch_outlined),
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
