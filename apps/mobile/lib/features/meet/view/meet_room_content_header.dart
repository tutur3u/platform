import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/view/meet_room_exit_actions.dart';
import 'package:mobile/features/meet/view/meet_room_sheets.dart';
import 'package:mobile/features/meet/view/meet_time_format.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetRoomContentHeader extends StatelessWidget {
  const MeetRoomContentHeader({
    required this.call,
    required this.joinRequested,
    required this.onLeave,
    this.fallbackTitle,
    super.key,
  });

  final MeetCallController call;
  final bool joinRequested;
  final VoidCallback onLeave;
  final String? fallbackTitle;

  @override
  Widget build(BuildContext context) {
    if (!joinRequested || call.ended) return const SizedBox.shrink();
    final l10n = context.l10n;
    final remaining = formatMeetRemainingTime(call.roomExpiresAt);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          const Spacer(),
          if (remaining != null)
            Semantics(
              label: l10n.meetTimeRemaining,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(remaining),
              ),
            ),
          IconButton(
            tooltip: l10n.meetParticipantsAndInvite,
            onPressed: () =>
                unawaited(showMeetParticipantsSheet(context, call)),
            icon: const Icon(Icons.group_add_outlined),
          ),
          if (call.role == 'host')
            MeetHostActionsMenu(
              onLeaveOrEnd: onLeave,
              onCosts: () => unawaited(showMeetCostsSheet(context, call)),
              onSettings: () => unawaited(showMeetSettingsSheet(context, call)),
            ),
        ],
      ),
    );
  }
}
