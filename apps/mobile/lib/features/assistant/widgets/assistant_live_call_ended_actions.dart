import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// Actions after a call ends or fails: call again (or retry) and close.
class AssistantLiveCallEndedActions extends StatelessWidget {
  const AssistantLiveCallEndedActions({
    required this.failed,
    required this.onCallAgain,
    required this.onClose,
    super.key,
  });

  final bool failed;
  final Future<void> Function() onCallAgain;
  final Future<void> Function() onClose;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AssistantLiveCallButton(
          key: const ValueKey('assistant-live-call-close'),
          icon: LucideIcons.x,
          label: l10n.assistantLiveCallClose,
          onPressed: onClose,
        ),
        const SizedBox(width: AppSpacing.huge),
        AssistantLiveCallButton(
          key: const ValueKey('assistant-live-call-again'),
          icon: failed ? LucideIcons.rotateCcw : LucideIcons.phone,
          label: failed
              ? l10n.assistantLiveCallRetry
              : l10n.assistantLiveCallAgain,
          toggled: true,
          diameter: 72,
          onPressed: onCallAgain,
        ),
      ],
    );
  }
}
