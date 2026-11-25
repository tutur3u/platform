import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/view/mail_row_parts.dart';
import 'package:mobile/l10n/l10n.dart';

/// A collapsible sidebar section heading, as web Mail's Folders and Labels.
class MailSidebarHeading extends StatelessWidget {
  const MailSidebarHeading({
    required this.label,
    required this.expanded,
    required this.onToggle,
    this.count,
    super.key,
  });

  final String label;
  final bool expanded;
  final VoidCallback onToggle;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    final style = tokens.typography.xSmall.copyWith(
      color: muted,
      fontWeight: FontWeight.w500,
    );
    final count = this.count;
    return Semantics(
      button: true,
      expanded: expanded,
      label: label,
      child: InkWell(
        onTap: onToggle,
        borderRadius: const BorderRadius.all(Radius.circular(8)),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: style,
                  ),
                ),
                if (count != null && count > 0) ...[
                  Text(
                    '$count',
                    style: style.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                Icon(
                  expanded ? LucideIcons.chevronDown : LucideIcons.chevronRight,
                  size: 14,
                  color: muted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A sidebar destination: a folder with its icon or a label with its colour
/// dot. The current one takes the accent fill and semibold text.
class MailSidebarRow extends StatelessWidget {
  const MailSidebarRow({
    required this.label,
    required this.onTap,
    this.icon,
    this.dotColor,
    this.count,
    this.selected = false,
    super.key,
  });

  final String label;
  final IconData? icon;
  final Color? dotColor;
  final int? count;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final count = this.count;
    final foreground = selected ? colors.accentForeground : colors.foreground;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? colors.accent : colors.accent.withValues(alpha: 0),
        borderRadius: const BorderRadius.all(Radius.circular(8)),
        child: InkWell(
          onTap: onTap,
          borderRadius: const BorderRadius.all(Radius.circular(8)),
          hoverColor: colors.accent,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  SizedBox.square(
                    dimension: 18,
                    child: Center(
                      child: dotColor != null
                          ? MailDot(color: dotColor!, size: 10)
                          : Icon(icon, size: 16, color: foreground),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.ui.copyWith(
                        fontSize: 14,
                        color: foreground,
                        fontWeight: selected
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                  ),
                  if (count != null && count > 0)
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.foreground,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        child: Text(
                          '$count',
                          semanticsLabel: context.l10n.mailUnreadCount(count),
                          style: tokens.typography.xSmall.copyWith(
                            color: colors.background,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
