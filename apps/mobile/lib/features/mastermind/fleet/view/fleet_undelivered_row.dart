import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_answer_status.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Sends [text] to the orchestrator as a new free-text note.
typedef FleetNoteSender =
    Future<IrisResult<IrisReceipt>> Function(
      String text, {
      required String idempotencyKey,
    });

/// The "Not delivered" header and rows, or nothing when every answer landed.
List<Widget> fleetUndeliveredSection(
  AppLocalizations l10n,
  List<(String, FleetPendingAnswer)> undelivered, {
  required String orchestrator,
  required void Function(String decisionId) onDismiss,
  FleetNoteSender? sendNote,
}) => [
  if (undelivered.isNotEmpty) ...[
    AppSectionHeader(
      title: l10n.mastermindFleetUndeliveredTitle,
      count: undelivered.length,
    ),
    for (final (id, answer) in undelivered)
      FleetUndeliveredRow(
        key: ValueKey('fleet-undelivered-$id'),
        answer: answer,
        orchestrator: orchestrator,
        onDismiss: () => onDismiss(id),
        sendNote: sendNote,
      ),
  ],
];

/// An answer that never reached its decision: it closed first, or Web
/// refused it. A written reply can go to the orchestrator as a new note
/// when [sendNote] is set; otherwise the row only says it was not delivered.
class FleetUndeliveredRow extends StatefulWidget {
  const FleetUndeliveredRow({
    required this.answer,
    required this.orchestrator,
    required this.onDismiss,
    this.sendNote,
    super.key,
  });

  final FleetPendingAnswer answer;
  final String orchestrator;
  final VoidCallback onDismiss;
  final FleetNoteSender? sendNote;

  @override
  State<FleetUndeliveredRow> createState() => _FleetUndeliveredRowState();
}

class _FleetUndeliveredRowState extends State<FleetUndeliveredRow> {
  bool _sending = false;
  bool _failed = false;

  Future<void> _send(FleetNoteSender send, String text) async {
    final l10n = context.l10n;
    setState(() {
      _sending = true;
      _failed = false;
    });
    final title = widget.answer.title;
    final result = await send(
      title == null ? text : l10n.mastermindFleetIrisNote(title, text),
      // The answer's own key: a second tap is the same note.
      idempotencyKey: widget.answer.idempotencyKey,
    );
    if (!mounted) return;
    if (result is IrisOk) {
      widget.onDismiss();
      return;
    }
    setState(() {
      _sending = false;
      _failed = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final answer = widget.answer;
    final status = answer.status == FleetSendStatus.closed
        ? l10n.mastermindFleetAnswerClosedBeforeSent
        : l10n.mastermindFleetAnswerRejected(
            fleetRejectionLabel(l10n, answer.reason),
          );
    final text = answer.text;
    final send = widget.sendNote;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppRichRow(
              title: answer.title ?? l10n.mastermindFleetUndeliveredTitle,
              subtitle: _failed
                  ? l10n.mastermindFleetIrisSendFailed(widget.orchestrator)
                  : status,
              leading: const AppIconTile(
                icon: LucideIcons.circleX,
                tone: AppTone.warning,
              ),
            ),
            if (text != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: AppTokens.of(context).typography.small,
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                if (send != null && text != null)
                  AppButton.outline(
                    onPressed: _sending ? null : () => _send(send, text),
                    child: Text(
                      l10n.mastermindFleetSendToIris(widget.orchestrator),
                    ),
                  ),
                AppButton.ghost(
                  onPressed: _sending ? null : widget.onDismiss,
                  child: Text(l10n.mastermindFleetDismiss),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
