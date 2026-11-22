import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// One compact row per message: avatar, sender, relative time, and below it
/// either the recipients toggle ("to me ▾") or, for a folded earlier
/// message, its one-line snippet. The message menu sits at the end.
class MailMessageHeader extends StatelessWidget {
  const MailMessageHeader({
    required this.address,
    required this.recipients,
    this.name,
    this.profile,
    this.date,
    this.snippet,
    this.detailsOpen = false,
    this.onTap,
    this.onToggleDetails,
    this.onMore,
    super.key,
  });

  final String address;
  final String? name;
  final Map<String, dynamic>? profile;
  final DateTime? date;

  /// "to me", "to Name +2": opens the delivery details inline.
  final String recipients;

  /// Replaces the recipients line while the message is folded.
  final String? snippet;
  final bool detailsOpen;

  /// Folds or unfolds the message (threads with several messages).
  final VoidCallback? onTap;
  final VoidCallback? onToggleDetails;

  /// Reply, Reply all and Forward for this one message.
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final muted = AppTokens.of(context).colorScheme.mutedForeground;
    final small = theme.textTheme.bodySmall?.copyWith(color: muted);
    final label = MailReaderIdentity.visibleName(
      address,
      name,
      profile,
      l10n.mailMember,
    );
    final date = this.date;
    final snippet = this.snippet;
    final secondLine = snippet != null
        ? Text(
            snippet,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(color: muted),
          )
        : Semantics(
            container: true,
            button: onToggleDetails != null,
            expanded: detailsOpen,
            label: recipients,
            hint: onToggleDetails != null ? l10n.mailMessageDetails : null,
            onTap: onToggleDetails,
            excludeSemantics: true,
            child: InkWell(
              key: const ValueKey('mail-recipients-toggle'),
              borderRadius: AppTokens.of(context).borderRadiusSm,
              onTap: onToggleDetails,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 48, minHeight: 32),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          recipients,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: small,
                        ),
                      ),
                      if (onToggleDetails != null)
                        AnimatedRotation(
                          turns: detailsOpen ? 0.5 : 0,
                          duration: const Duration(milliseconds: 160),
                          child: Icon(
                            Icons.expand_more,
                            size: 16,
                            color: muted,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          );
    final row = Row(
      key: const ValueKey('mail-sender-row'),
      children: [
        MailReaderAvatar(label: label, profile: profile),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (date != null) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Tooltip(
                      message: formatMailMessageDate(context, date),
                      child: Text(
                        formatMailRelativeDate(context, date),
                        key: const ValueKey('mail-sender-date'),
                        maxLines: 1,
                        softWrap: false,
                        style: small,
                      ),
                    ),
                  ],
                ],
              ),
              secondLine,
            ],
          ),
        ),
        if (onMore != null)
          IconButton(
            tooltip: l10n.mailMessageActions,
            visualDensity: VisualDensity.compact,
            onPressed: onMore,
            icon: const Icon(Icons.more_horiz, size: 20),
          ),
      ],
    );
    final onTap = this.onTap;
    if (onTap == null) return row;
    return Semantics(
      explicitChildNodes: true,
      button: true,
      expanded: snippet == null,
      child: InkWell(
        borderRadius: AppTokens.of(context).borderRadiusMd,
        onTap: onTap,
        child: row,
      ),
    );
  }
}
