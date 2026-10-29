import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// A full-width row on a `MastermindSurface`: title, optional muted subtitle
/// and leading or trailing pieces, with no box of its own.
class MastermindListRow extends StatelessWidget {
  const MastermindListRow({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppGroupedRow(
    leading: leading,
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!),
    trailing: trailing,
    onTap: onTap,
    showChevron: onTap != null,
  );
}

/// One choice of an ask, as a full-width tappable row: a radio glyph, the
/// plain-language label and, for the recommended choice, a star and the word
/// "Recommended" in the accent colour (never a border, never colour alone).
/// Announced as a radio button: checked or unchecked, in one exclusive group.
class MastermindOptionRow extends StatelessWidget {
  const MastermindOptionRow({
    required this.label,
    required this.recommended,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool recommended;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final enabled = onTap != null;
    final mark = selected ? c.primary : c.mutedForeground;
    // A radio: checked or unchecked within one mutually exclusive group.
    return Semantics(
      checked: selected,
      inMutuallyExclusiveGroup: true,
      enabled: enabled,
      label: recommended ? l10n.mastermindOptionRecommended(label) : label,
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          color: selected
              ? c.primary.withValues(alpha: c.isDark ? 0.14 : 0.08)
              : null,
          constraints: const BoxConstraints(minHeight: AppLayout.rowMinHeight),
          padding: const EdgeInsets.symmetric(
            horizontal: AppLayout.rowHorizontalPadding,
            vertical: AppSpacing.md,
          ),
          child: Opacity(
            opacity: enabled || selected ? 1 : 0.5,
            child: Row(
              children: [
                Icon(
                  selected ? LucideIcons.circleCheck : LucideIcons.circle,
                  size: 22,
                  color: mark,
                ),
                const SizedBox(width: AppLayout.rowLeadingGap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: tokens.typography.base.copyWith(
                          color: c.foreground,
                          fontWeight: selected
                              ? FontWeight.w600
                              : FontWeight.w500,
                          height: 1.3,
                        ),
                      ),
                      if (recommended) ...[
                        const SizedBox(height: AppSpacing.xxs),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(LucideIcons.star, size: 12, color: c.primary),
                            const SizedBox(width: AppSpacing.xs),
                            Flexible(
                              child: Text(
                                l10n.mastermindRecommended,
                                style: tokens.typography.label.copyWith(
                                  color: c.primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
