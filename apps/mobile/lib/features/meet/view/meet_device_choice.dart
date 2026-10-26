import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/l10n/l10n.dart';

Widget buildMeetDeviceChoice(BuildContext context, MeetCallController call) {
  return LayoutBuilder(
    builder: (context, constraints) => _buildMeetDeviceChoice(
      context,
      call,
      gutter: AppPageInsets.gutterOf(context, width: constraints.maxWidth),
    ),
  );
}

Widget _buildMeetDeviceChoice(
  BuildContext context,
  MeetCallController call, {
  required double gutter,
}) {
  final l10n = context.l10n;
  return Center(
    child: Padding(
      padding: EdgeInsets.all(gutter),
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
            onPressed: call.status == 'connecting'
                ? null
                : () => unawaited(call.chooseDevice(switchToThisDevice: true)),
            icon: const Icon(Icons.swap_horiz),
            label: Text(l10n.meetSwitchDevice),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: call.status == 'connecting'
                ? null
                : () => unawaited(call.chooseDevice(switchToThisDevice: false)),
            icon: const Icon(Icons.devices),
            label: Text(l10n.meetJoinAnotherDevice),
          ),
          const SizedBox(height: 8),
          Text(l10n.meetDeviceEchoHint, textAlign: TextAlign.center),
          if (call.error != null) ...[
            const SizedBox(height: 12),
            Text(l10n.commonSomethingWentWrong),
          ],
        ],
      ),
    ),
  );
}

/// Retry prompt for a call that failed before it opened.
Widget buildMeetCallError(
  BuildContext context, {
  required VoidCallback onRetry,
}) {
  final l10n = context.l10n;
  return LayoutBuilder(
    builder: (context, constraints) => Center(
      child: Padding(
        padding: EdgeInsets.all(
          AppPageInsets.gutterOf(context, width: constraints.maxWidth),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.commonSomethingWentWrong, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(l10n.commonRetry),
            ),
          ],
        ),
      ),
    ),
  );
}
