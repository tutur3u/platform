import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/l10n/l10n.dart';

/// The bottom of the Inbox list while the next page is on its way.
class InboxLoadingMoreRow extends StatelessWidget {
  const InboxLoadingMoreRow({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    label: context.l10n.mastermindInboxLoadingMore,
    child: const Padding(
      padding: EdgeInsets.all(AppSpacing.md),
      child: Center(
        child: SizedBox.square(
          dimension: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    ),
  );
}

/// The next page failed: say so in place and offer Retry. No toast.
class InboxLoadErrorRow extends StatelessWidget {
  const InboxLoadErrorRow({required this.onRetry, super.key});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: AppStateMessage.inline(
        icon: AppIcons.close,
        tone: AppTone.warning,
        title: l10n.mastermindInboxLoadMoreFailed,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
    );
  }
}

/// Every ask is on screen.
class InboxEndMarker extends StatelessWidget {
  const InboxEndMarker({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Text(
        context.l10n.mastermindInboxEndOfList,
        textAlign: TextAlign.center,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
