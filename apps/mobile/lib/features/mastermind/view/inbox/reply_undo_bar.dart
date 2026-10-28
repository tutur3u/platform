import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Sending · Undo": shown for the few seconds between tapping an option and
/// the reply being queued. Announced when it appears, with a 44 pt Undo.
class ReplyUndoBar extends StatelessWidget {
  const ReplyUndoBar({required this.option, required this.onUndo, super.key});

  final String option;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedSection.spaced(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.hourglass),
          title: Semantics(
            liveRegion: true,
            child: Text(l10n.mastermindReplySendingOption(option)),
          ),
          trailing: onUndo == null
              ? null
              : TextButton(
                  style: TextButton.styleFrom(
                    minimumSize: const Size(
                      AppInterfaceTokens.minTouchTarget,
                      AppInterfaceTokens.minTouchTarget,
                    ),
                  ),
                  onPressed: onUndo,
                  child: Text(l10n.mastermindReplyUndo),
                ),
        ),
      ],
    );
  }
}
