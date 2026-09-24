import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';
import 'package:mobile/features/meet/data/meet_call_controller.dart';
import 'package:mobile/features/meet/view/meet_assistant_review_card.dart';
import 'package:mobile/features/meet/view/meet_personal_chat_panel.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<void> showMeetChatSheet(
  BuildContext context,
  MeetCallController call,
) async {
  final input = TextEditingController();
  try {
    unawaited(call.roomAssistant.refreshReviews());
    await showAdaptiveSheet<void>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => DefaultTabController(
        length: 2,
        child: AppDialogScaffold(
          title: sheetContext.l10n.meetChat,
          child: SizedBox(
            height: 480,
            child: Column(
              children: [
                TabBar(
                  tabs: [
                    Tab(
                      icon: const Icon(Icons.groups_outlined),
                      text: sheetContext.l10n.meetEveryone,
                    ),
                    Tab(
                      icon: const Icon(Icons.lock_outline),
                      text: sheetContext.l10n.meetPrivateMira,
                    ),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      _roomChatPanel(call, input),
                      MeetPersonalChatPanel(call: call),
                    ],
                  ),
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

Widget _roomChatPanel(MeetCallController call, TextEditingController input) =>
    AnimatedBuilder(
      animation: Listenable.merge([call, call.roomAssistant]),
      builder: (context, _) => Column(
        children: [
          Expanded(
            child: ListView(
              children: [
                for (final message in call.messages)
                  ListTile(
                    title: Text(message['displayName'] as String? ?? ''),
                    subtitle: AssistantMarkdownBody(
                      data: message['body'] as String? ?? '',
                    ),
                    dense: true,
                  ),
                if (call.roomAssistant.reviews.isNotEmpty) ...[
                  ListTile(
                    leading: const Icon(Icons.lock_outline),
                    title: Text(context.l10n.meetMiraReviews),
                    subtitle: Text(context.l10n.meetMiraReviewsHint),
                  ),
                  for (final review in call.roomAssistant.reviews)
                    MeetAssistantReviewCard(
                      key: ValueKey('${review['id']}:${review['revision']}'),
                      assistant: call.roomAssistant,
                      review: review,
                    ),
                ],
              ],
            ),
          ),
          if (call.roomAssistant.thinking)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Text(context.l10n.meetMiraThinking),
                ],
              ),
            ),
          if (call.roomAssistant.error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      call.roomAssistant.error == 'reviews_failed'
                          ? context.l10n.meetMiraReviewFailed
                          : context.l10n.meetMiraReplyFailed,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => unawaited(
                      call.roomAssistant.retryMessageId == null
                          ? call.roomAssistant.refreshReviews()
                          : call.roomAssistant.ask(
                              call.roomAssistant.retryMessageId!,
                            ),
                    ),
                    icon: const Icon(Icons.refresh),
                    label: Text(
                      call.roomAssistant.retryMessageId == null
                          ? context.l10n.meetMiraReviewRefresh
                          : context.l10n.meetMiraRetry,
                    ),
                  ),
                ],
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
                  onSubmitted: (_) => unawaited(_send(context, input, call)),
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
    );

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
                subtitle: call.isHandRaised(person['userId'] as String? ?? '')
                    ? Text(context.l10n.meetRaiseHand)
                    : null,
                trailing:
                    person['userId'] == call.selfUserId || call.role != 'host'
                    ? Icon(
                        (person['media'] as Map?)?['audioEnabled'] == true
                            ? Icons.mic_outlined
                            : Icons.mic_off_outlined,
                      )
                    : PopupMenuButton<String>(
                        tooltip: context.l10n.meetParticipantActions,
                        onSelected: (action) {
                          final userId = person['userId'] as String;
                          if (action == 'mute') {
                            call.muteParticipant(userId);
                          }
                          if (action == 'remove') {
                            call.removeParticipant(userId);
                          }
                        },
                        itemBuilder: (_) => [
                          PopupMenuItem(
                            value: 'mute',
                            child: Row(
                              children: [
                                const Icon(Icons.mic_off_outlined),
                                const SizedBox(width: 8),
                                Text(context.l10n.meetMuteParticipant),
                              ],
                            ),
                          ),
                          PopupMenuItem(
                            value: 'remove',
                            child: Row(
                              children: [
                                const Icon(Icons.person_remove_outlined),
                                const SizedBox(width: 8),
                                Text(context.l10n.meetRemoveParticipant),
                              ],
                            ),
                          ),
                        ],
                      ),
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
            if (call.role == 'host') ...[
              SwitchListTile(
                secondary: const Icon(Icons.lock_outline),
                title: Text(context.l10n.meetLockRoom),
                value: call.stage['locked'] == true,
                onChanged: (locked) => call.setRoomLocked(locked: locked),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.chat_bubble_outline),
                title: Text(context.l10n.meetSaveChat),
                value: call.settings['saveChat'] != false,
                onChanged: (enabled) =>
                    call.updateSettings({'saveChat': enabled}),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.description_outlined),
                title: Text(context.l10n.meetShareNotes),
                value: call.settings['shareNotes'] == true,
                onChanged: (enabled) =>
                    call.updateSettings({'shareNotes': enabled}),
              ),
              for (final person in call.approved)
                ListTile(
                  leading: const Icon(Icons.verified_user_outlined),
                  title: Text(person['displayName'] as String? ?? ''),
                  subtitle: Text(context.l10n.meetApprovedParticipant),
                  trailing: IconButton(
                    tooltip: context.l10n.meetForgetApproval,
                    onPressed: () =>
                        call.forgetApproval(person['userId'] as String),
                    icon: const Icon(Icons.person_remove_outlined),
                  ),
                ),
            ],
          ],
        ),
      ),
    ),
  ),
);

Future<void> showMeetCostsSheet(
  BuildContext context,
  MeetCallController call,
) async {
  var request = call.getRoomCosts();
  await showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    builder: (sheetContext) => StatefulBuilder(
      builder: (context, setSheetState) => AppDialogScaffold(
        title: context.l10n.meetEstimatedCosts,
        child: SizedBox(
          height: 350,
          child: FutureBuilder<Map<String, dynamic>>(
            future: request,
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return Center(
                  child: snapshot.hasError
                      ? Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(context.l10n.meetCostsUnavailable),
                            TextButton.icon(
                              onPressed: () => setSheetState(
                                () => request = call.getRoomCosts(),
                              ),
                              icon: const Icon(Icons.refresh),
                              label: Text(context.l10n.commonRetry),
                            ),
                          ],
                        )
                      : const CircularProgressIndicator(),
                );
              }
              final costs = snapshot.data!;
              final cloudflare = costs['cloudflare'] as Map?;
              final live = costs['live'] as Map?;
              String usd(Object? value) =>
                  value is num ? '\$${value.toStringAsFixed(6)}' : '—';
              return ListView(
                children: [
                  ListTile(
                    leading: const Icon(Icons.info_outline),
                    title: Text(context.l10n.meetPartialEstimate),
                  ),
                  ListTile(
                    leading: const Icon(Icons.cloud_outlined),
                    title: Text(context.l10n.meetSfuEgress),
                    trailing: Text(usd(cloudflare?['sfuEgressUsd'])),
                  ),
                  ListTile(
                    leading: const Icon(Icons.data_usage_outlined),
                    title: Text(context.l10n.meetDurableRequests),
                    trailing: Text(usd(cloudflare?['durableRequestsUsd'])),
                  ),
                  ListTile(
                    leading: const Icon(Icons.auto_awesome_outlined),
                    title: Text(context.l10n.meetMiraCost),
                    trailing: Text(usd(costs['miraCostUsd'])),
                  ),
                  ListTile(
                    leading: const Icon(Icons.graphic_eq_outlined),
                    title: Text(context.l10n.meetLiveCost),
                    trailing: Text(usd(live?['costUsd'])),
                  ),
                  TextButton.icon(
                    onPressed: () =>
                        setSheetState(() => request = call.getRoomCosts()),
                    icon: const Icon(Icons.refresh),
                    label: Text(context.l10n.commonRefresh),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
}
