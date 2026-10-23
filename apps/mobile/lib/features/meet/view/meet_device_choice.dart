import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/l10n/l10n.dart';

Widget buildMeetDeviceChoice(BuildContext context, MeetCallController call) {
  final l10n = context.l10n;
  return Center(
    child: Padding(
      padding: EdgeInsets.all(AppLayout.gutter(context.deviceClass)),
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
