import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

/// Non-blocking notice for a held first-message creation. Dismissal hides it
/// for this app session only; the durable hold is never touched here.
class AssistantCreationHoldBanner extends StatelessWidget {
  const AssistantCreationHoldBanner({
    required this.onCheckHistory,
    required this.onStartNewChat,
    required this.onDismiss,
    super.key,
  });

  static final _dismissed = <String>{};

  static bool isDismissed(String scope) => _dismissed.contains(scope);

  static void dismiss(String scope) => _dismissed.add(scope);

  @visibleForTesting
  static void resetDismissals() => _dismissed.clear();

  final VoidCallback onCheckHistory;
  final VoidCallback onStartNewChat;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return Material(
      key: const ValueKey('assistant-creation-hold-banner'),
      color: scheme.secondaryContainer,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Icon(
                    Icons.info_outline,
                    size: 18,
                    color: scheme.onSecondaryContainer,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      l10n.assistantCreationHoldBannerMessage,
                      style: TextStyle(color: scheme.onSecondaryContainer),
                    ),
                  ),
                ),
                IconButton(
                  key: const ValueKey('assistant-creation-hold-dismiss'),
                  tooltip: l10n.assistantCreationHoldDismiss,
                  onPressed: onDismiss,
                  icon: const Icon(Icons.close, size: 18),
                ),
              ],
            ),
            Wrap(
              children: [
                TextButton(
                  key: const ValueKey('assistant-creation-hold-history'),
                  onPressed: onCheckHistory,
                  child: Text(l10n.assistantNewChatInspectHistory),
                ),
                TextButton(
                  key: const ValueKey('assistant-creation-hold-new'),
                  onPressed: onStartNewChat,
                  child: Text(l10n.assistantNewChatConfirmCreation),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
