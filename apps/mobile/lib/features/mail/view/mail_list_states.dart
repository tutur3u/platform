import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// A quiet sync note above rows that stay on screen after a refresh failed,
/// in place of a destructive banner: the list is still usable.
class MailRefreshNotice extends StatelessWidget {
  const MailRefreshNotice({required this.onRetry, super.key});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: Row(
          children: [
            Icon(LucideIcons.cloudOff, size: 14, color: muted),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                context.l10n.mailRefreshFailed,
                style: tokens.typography.small.copyWith(color: muted),
              ),
            ),
            AppButton.ghost(
              size: AppButtonSize.small,
              onPressed: onRetry,
              child: Text(context.l10n.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Web Mail's centred list states: an empty folder, or a list that could not
/// load at all (with a timeout-specific explanation).
class MailListEmptyState extends StatelessWidget {
  const MailListEmptyState({
    required this.failed,
    this.timedOut = false,
    this.onRetry,
    super.key,
  });

  final bool failed;
  final bool timedOut;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (!failed) {
      return AppStateMessage(
        icon: LucideIcons.inbox,
        title: l10n.mailEmpty,
        message: l10n.mailEmptyFolderDescription,
      );
    }
    return AppStateMessage(
      icon: LucideIcons.cloudAlert,
      tone: AppTone.destructive,
      title: l10n.mailLoadFailed,
      message: timedOut
          ? l10n.mailReadTimeoutDescription
          : l10n.mailLoadFailedDescription,
      actionLabel: l10n.commonRetry,
      onAction: onRetry,
    );
  }
}
