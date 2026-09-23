import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<void> showMeetChatSheet(
  BuildContext context,
  MeetCallController call,
) async {
  final input = TextEditingController();
  try {
    await showAdaptiveSheet<void>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => AppDialogScaffold(
        title: sheetContext.l10n.meetChat,
        child: SizedBox(
          height: 420,
          child: AnimatedBuilder(
            animation: call,
            builder: (context, _) => Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    itemCount: call.messages.length,
                    itemBuilder: (context, index) {
                      final message = call.messages[index];
                      return ListTile(
                        title: Text(message['displayName'] as String? ?? ''),
                        subtitle: Text(message['body'] as String? ?? ''),
                        dense: true,
                      );
                    },
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: input,
                        maxLength: 2000,
                        decoration: InputDecoration(
                          hintText: context.l10n.meetMessageHint,
                          counterText: '',
                        ),
                        onSubmitted: (_) =>
                            unawaited(_send(context, input, call)),
                      ),
                    ),
                    IconButton(
                      tooltip: context.l10n.meetSend,
                      onPressed: () => unawaited(_send(context, input, call)),
                      icon: const Icon(Icons.send_outlined),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  } finally {
    input.dispose();
  }
}

Future<void> _send(
  BuildContext context,
  TextEditingController input,
  MeetCallController call,
) async {
  final body = input.text.trim();
  if (body.isEmpty) return;
  input.clear();
  try {
    await call.sendMessage(body);
  } on Object {
    if (!context.mounted) return;
    input.text = body;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
    );
  }
}

Future<void> showMeetParticipantsSheet(
  BuildContext context,
  MeetCallController call,
) => showAdaptiveSheet<void>(
  context: context,
  useRootNavigator: true,
  builder: (sheetContext) => AppDialogScaffold(
    title: sheetContext.l10n.meetParticipants,
    child: SizedBox(
      height: 420,
      child: AnimatedBuilder(
        animation: call,
        builder: (context, _) => ListView(
          children: [
            for (final person in call.participants.values)
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(person['displayName'] as String? ?? ''),
                trailing: (person['media'] as Map?)?['audioEnabled'] == true
                    ? const Icon(Icons.mic_outlined)
                    : const Icon(Icons.mic_off_outlined),
              ),
            if (call.role == 'host')
              for (final person in call.waiting)
                ListTile(
                  leading: const Icon(Icons.hourglass_top_outlined),
                  title: Text(person['displayName'] as String? ?? ''),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: context.l10n.meetAdmit,
                        onPressed: () => call.decideAdmission(
                          person['userId'] as String,
                          admit: true,
                        ),
                        icon: const Icon(Icons.check_circle_outline),
                      ),
                      IconButton(
                        tooltip: context.l10n.meetDecline,
                        onPressed: () => call.decideAdmission(
                          person['userId'] as String,
                          admit: false,
                        ),
                        icon: const Icon(Icons.cancel_outlined),
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    ),
  ),
);
