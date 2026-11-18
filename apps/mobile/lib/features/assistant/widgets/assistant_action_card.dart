import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_step_tile.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_steps.dart';
import 'package:mobile/l10n/l10n.dart';

Iterable<AssistantMessagePart> assistantCompletedActionParts(
  Iterable<AssistantMessagePart> parts,
) => assistantVisibleToolSteps(
  parts,
).where((part) => part.state == 'output-available');

/// Displays the settled result from the transcript's tool output.
class AssistantCompletedActionCard extends StatelessWidget {
  const AssistantCompletedActionCard({required this.part, super.key});

  final AssistantMessagePart part;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppPanel(
        padded: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppChip(
                avatar: const Icon(LucideIcons.check, size: 16),
                label: Text(context.l10n.assistantToolStepDone),
              ),
              AssistantToolStepTile(part: part),
            ],
          ),
        ),
      ),
    );
  }
}
