import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/l10n.dart';

/// One action in the existing shell slot throughout the call lifecycle.
class AssistantLivePrimaryAction extends StatelessWidget {
  const AssistantLivePrimaryAction({
    required this.state,
    required this.assistantName,
    required this.onCall,
    required this.onCancel,
    required this.onNavigation,
    super.key,
  });
  final AssistantLiveState state;
  final String assistantName;
  final Future<void> Function() onCall;
  final Future<void> Function() onCancel;
  final VoidCallback onNavigation;
  @override
  Widget build(BuildContext context) {
    final connected = state.status == AssistantLiveConnectionStatus.connected;
    final calling = state.isBusy;
    return ShellDockActionButton(
      action: ShellActionSpec(
        id: connected
            ? 'assistant-navigation'
            : calling
            ? 'assistant-cancel-call'
            : 'assistant-call',
        icon: connected
            ? Icons.menu_rounded
            : calling
            ? Icons.call_end_rounded
            : Icons.call_rounded,
        tooltip: connected
            ? context.l10n.assistantExpandNavigation
            : calling
            ? context.l10n.assistantLiveCancelCall
            : context.l10n.assistantLiveCallAssistant(assistantName),
        onPressed: connected
            ? onNavigation
            : calling
            ? onCancel
            : onCall,
      ),
    );
  }
}
