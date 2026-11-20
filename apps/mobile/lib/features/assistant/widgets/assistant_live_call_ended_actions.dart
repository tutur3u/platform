import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:permission_handler/permission_handler.dart';

/// Actions after a call ends or fails: call again (or retry) and close.
class AssistantLiveCallEndedActions extends StatelessWidget {
  const AssistantLiveCallEndedActions({
    required this.failed,
    required this.onCallAgain,
    required this.onClose,
    this.error,
    this.openSettings = openAppSettings,
    super.key,
  });

  final bool failed;
  final Future<void> Function() onCallAgain;
  final Future<void> Function() onClose;

  /// Failure token; permission failures offer Settings instead of Retry.
  final String? error;
  final Future<bool> Function() openSettings;

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
        if (failed && AssistantLiveFailure.needsSettings(error))
          AssistantLiveCallButton(
            key: const ValueKey('assistant-live-call-settings'),
            icon: LucideIcons.settings,
            label: l10n.assistantLiveOpenSettings,
            toggled: true,
            diameter: 72,
            onPressed: () async {
              await openSettings();
            },
          )
        else
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
