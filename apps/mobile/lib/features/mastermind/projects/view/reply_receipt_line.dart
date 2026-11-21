import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Sending", "Sent", then how the machine took it: a two-step track and a
/// tinted label.
class ReplyReceiptLine extends StatelessWidget {
  const ReplyReceiptLine({required this.phase, super.key});

  final ReplyPhase phase;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final tone = phase.tone.foreground(colors);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 2; i++) ...[
          Container(
            width: 14,
            height: 2,
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(
              color: i < phase.steps ? tone : colors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
        Flexible(
          child: Text(
            phase.label(context.l10n),
            style: TextStyle(
              color: tone,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
