import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_reader_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// One row per message card: avatar, sender and below it either the
/// recipients toggle ("to me ▾") or, for a folded message, a two-line
/// snippet. Labels, the date, the message menu and the fold chevron follow.
/// A wide card shows the full date in mono at the end; a narrow one keeps
/// the relative time beside the sender.
class MailMessageHeader extends StatelessWidget {
  const MailMessageHeader({
    required this.address,
    required this.recipients,
    this.name,
    this.profile,
    this.date,
    this.snippet,
    this.labels = const [],
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

  /// Label names shown as badges before the date.
  final List<String> labels;
  final bool detailsOpen;

  /// Folds or unfolds the message (threads with several messages).
  final VoidCallback? onTap;
  final VoidCallback? onToggleDetails;

  /// Reply, Reply all and Forward for this one message.
  final VoidCallback? onMore;

  /// Card width from which the date moves to its own mono column.
  static const double wideDateMinWidth = 480;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => _build(
      context,
      wide:
          constraints.maxWidth >=
          MediaQuery.textScalerOf(context).scale(wideDateMinWidth),
    ),
  );

  Widget _build(BuildContext context, {required bool wide}) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
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
            key: const ValueKey('mail-message-snippet'),
            maxLines: 2,
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
                  if (date != null && !wide) ...[
                    const SizedBox(width: AppSpacing.sm),
                    AppTooltip(
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
        if (labels.isNotEmpty) ...[
          const SizedBox(width: AppSpacing.sm),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: wide ? 200 : 96),
            child: Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              alignment: WrapAlignment.end,
              children: [
                for (final label in labels)
                  AppBadge.outline(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (date != null && wide) ...[
          const SizedBox(width: AppSpacing.sm),
          AppTooltip(
            message: formatMailMessageDate(context, date),
            child: Text(
              formatMailMessageDate(context, date),
              key: const ValueKey('mail-sender-date'),
              maxLines: 1,
              softWrap: false,
              style: small?.copyWith(
                fontFamily: tokens.typography.monoFamily ?? 'monospace',
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
        if (onMore != null)
          AppIconButton(
            tooltip: l10n.mailMessageActions,
            size: AppButtonSize.small,
            onPressed: onMore,
            icon: const Icon(Icons.more_horiz),
          ),
        if (this.onTap != null)
          ExcludeSemantics(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xs),
              child: AnimatedRotation(
                key: const ValueKey('mail-message-chevron'),
                turns: snippet == null ? 0.5 : 0,
                duration: const Duration(milliseconds: 180),
                child: Icon(Icons.expand_more, size: 20, color: muted),
              ),
            ),
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
