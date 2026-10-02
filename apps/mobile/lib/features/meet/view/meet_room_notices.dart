import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/view/meet_participant_tile.dart';
import 'package:mobile/features/meet/view/meet_room_sheets.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetRoomNotices {
  ScaffoldMessengerState? _messenger;
  void dispose() {
    _messenger?.clearSnackBars();
  }

  bool sound = true;
  bool chatOpen = false;
  DateTime? _lastSound;

  Future<void> openChat(BuildContext context, MeetCallController call) async {
    if (chatOpen) return;
    chatOpen = true;
    ScaffoldMessenger.of(context).clearSnackBars();
    try {
      await showMeetChatSheet(context, call);
    } finally {
      chatOpen = false;
    }
  }

  void show(BuildContext context, MeetCallController call) {
    _messenger = ScaffoldMessenger.of(context);
    final notices = List.of(call.notices);
    call.notices.clear();
    var visible = false;
    for (final notice in notices) {
      if (notice.kind == 'chat' && chatOpen) continue;
      visible = true;
      final l10n = context.l10n;
      final label = switch (notice.kind) {
        'joined' => l10n.meetNoticeJoined(notice.name),
        'waiting' => l10n.meetNoticeWaiting(notice.name),
        _ => l10n.meetNoticeChat(notice.name),
      };
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(label),
          duration: Duration(seconds: notice.kind == 'waiting' ? 10 : 5),
          action: SnackBarAction(
            label: l10n.meetNoticeView,
            onPressed: () {
              if (notice.kind == 'chat') {
                unawaited(openChat(context, call));
              } else {
                unawaited(showMeetParticipantsSheet(context, call));
              }
            },
          ),
        ),
      );
    }
    final now = DateTime.now();
    if (visible &&
        sound &&
        (_lastSound == null ||
            now.difference(_lastSound!).inMilliseconds >= 1200)) {
      _lastSound = now;
      unawaited(
        const MethodChannel(
          'mobile/meet_screen_share',
        ).invokeMethod<void>('sound').catchError((Object _) {}),
      );
    }
  }
}

Future<void> toggleMeetScreen(
  BuildContext context,
  MeetCallController call,
) async {
  final l10n = context.l10n;
  if (!call.media.screenEnabled) {
    final agreed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.meetShareScreen),
        content: Text(l10n.meetScreenShareHint),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l10n.meetShareScreen),
          ),
        ],
      ),
    );
    if (!context.mounted || agreed != true) return;
  }
  try {
    await call.setScreen(
      enabled: !call.media.screenEnabled,
      title: l10n.meetShareScreen,
      stopLabel: l10n.meetStopSharing,
    );
  } on Object {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(l10n.meetScreenShareFailed)));
    }
  }
}

Widget buildMeetScreenTile(
  BuildContext context,
  MeetCallController call,
  int index,
) {
  final key = call.media.remoteRenderers.keys
      .where((key) => key.endsWith(':screen'))
      .elementAt(index);
  final name =
      call.participants[key.split(':').first]?['displayName'] ??
      context.l10n.meetParticipants;
  return MeetParticipantTile(
    name:
        '$name'
        ' · ${context.l10n.meetShareScreen}',
    microphoneOn: false,
    screen: true,
    renderer: call.media.remoteRenderers[key],
  );
}

Widget buildMeetSoundControl(
  BuildContext context,
  MeetRoomNotices notices,
  VoidCallback update,
) => IconButton.filledTonal(
  tooltip: context.l10n.meetNotificationSound,
  onPressed: () {
    notices.sound = !notices.sound;
    update();
  },
  icon: Icon(
    notices.sound
        ? Icons.notifications_active_outlined
        : Icons.notifications_off_outlined,
  ),
);

class MeetScreenControl extends StatefulWidget {
  const MeetScreenControl({required this.call, super.key});
  final MeetCallController call;
  @override
  State<MeetScreenControl> createState() => _MeetScreenControlState();
}

class _MeetScreenControlState extends State<MeetScreenControl> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) => IconButton.filledTonal(
    tooltip: widget.call.media.screenEnabled
        ? context.l10n.meetStopSharing
        : context.l10n.meetShareScreen,
    onPressed: _busy
        ? null
        : () async {
            setState(() => _busy = true);
            try {
              await toggleMeetScreen(context, widget.call);
            } finally {
              if (mounted) setState(() => _busy = false);
            }
          },
    icon: Icon(
      widget.call.media.screenEnabled
          ? Icons.stop_screen_share_outlined
          : Icons.screen_share_outlined,
    ),
  );
}
