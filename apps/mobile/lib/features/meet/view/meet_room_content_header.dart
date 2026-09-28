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
    final l10n = context.l10n;
    final remaining = joinRequested && !call.ended
        ? formatMeetRemainingTime(call.roomExpiresAt)
        : null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          FloatingActionButton.small(
            heroTag: 'meet-room-back',
            tooltip: l10n.meetLeave,
            onPressed: onLeave,
            elevation: 0,
            child: const Icon(Icons.arrow_back_rounded),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              call.title ?? fallbackTitle ?? l10n.meetTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          if (remaining != null)
            Semantics(
              label: l10n.meetTimeRemaining,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(remaining),
              ),
            ),
          if (joinRequested && !call.ended)
            IconButton(
              tooltip: l10n.meetParticipantsAndInvite,
              onPressed: () =>
                  unawaited(showMeetParticipantsSheet(context, call)),
              icon: const Icon(Icons.group_add_outlined),
            ),
          if (joinRequested && !call.ended && call.role == 'host')
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
