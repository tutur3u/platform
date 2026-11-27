import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whether the visible list matches the server.
enum MailSyncState { synced, syncing, failed }

/// Web Mail's list header: the folder and its mailbox address, Mark folder
/// read for Inbox and Archive, and a compact sync status that refreshes.
class MailListHeader extends StatelessWidget {
  const MailListHeader({
    required this.title,
    required this.syncState,
    required this.onRefresh,
    this.address,
    this.markReadTooltip,
    this.onMarkRead,
    super.key,
  });

  final String? title;
  final String? address;
  final MailSyncState syncState;
  final VoidCallback onRefresh;

  /// Shown with [onMarkRead] for folders that can be marked read at once.
  final String? markReadTooltip;
  final VoidCallback? onMarkRead;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final address = this.address;
    final title = this.title;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Semantics(
                    header: true,
                    child: Text(
                      title,
                      key: const ValueKey('mail-list-title'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.ui.copyWith(
                        fontSize: 16,
                        height: 1.5,
                        fontWeight: FontWeight.w600,
                        color: colors.foreground,
                      ),
                    ),
                  ),
                if (address != null && address.isNotEmpty)
                  Text(
                    address,
                    key: const ValueKey('mail-list-address'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.xSmall.copyWith(
                      color: colors.mutedForeground,
                    ),
                  ),
              ],
            ),
          ),
          if (markReadTooltip case final tooltip?)
            AppIconButton(
              key: const ValueKey('mail-mark-folder-read'),
              tooltip: tooltip,
              onPressed: onMarkRead,
              icon: const Icon(LucideIcons.checkCheck, size: 16),
            ),
          MailSyncStatus(state: syncState, onRefresh: onRefresh),
        ],
      ),
    );
  }
}

/// A refresh button whose icon and tooltip report the sync state.
class MailSyncStatus extends StatelessWidget {
  const MailSyncStatus({
    required this.state,
    required this.onRefresh,
    super.key,
  });

  final MailSyncState state;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final busy = state == MailSyncState.syncing;
    final failed = state == MailSyncState.failed;
    final label = switch (state) {
      MailSyncState.synced => l10n.mailSynced,
      MailSyncState.syncing => l10n.mailSyncing,
      MailSyncState.failed => l10n.mailSyncFailed,
    };
    return Semantics(
      liveRegion: true,
      child: AppIconButton(
        key: ValueKey('mail-sync-${state.name}'),
        tooltip: '${l10n.commonRefresh}: $label',
        onPressed: busy ? null : onRefresh,
        // A dimmed glyph rather than a spinner: refreshes are frequent and
        // the list stays usable while they run.
        icon: Opacity(
          opacity: busy ? 0.5 : 1,
          child: Icon(
            failed ? LucideIcons.cloudAlert : LucideIcons.refreshCw,
            size: 16,
            color: failed ? colors.destructive : null,
          ),
        ),
      ),
    );
  }
}
