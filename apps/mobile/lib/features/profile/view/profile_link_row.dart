import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';

/// A Profile card row: a leading tile, the label with an optional supporting
/// line, and an optional trailing value and chevron. Destructive rows tint
/// the label.
class ProfileLinkRow extends StatelessWidget {
  const ProfileLinkRow({
    required this.title,
    required this.onTap,
    this.icon,
    this.tone = AppTone.neutral,
    this.leading,
    this.subtitle,
    this.trailing,
    this.showChevron = true,
    this.destructive = false,
    super.key,
  });

  static const double tileSize = 40;
  static const double padding = AppSpacing.md;

  /// Where row hairlines start: past the tile, under the label.
  static const double dividerInset = padding + tileSize + AppSpacing.md;

  final String title;
  final VoidCallback? onTap;
  final IconData? icon;
  final AppTone tone;

  /// Replaces the icon tile, for example with account avatars.
  final Widget? leading;
  final String? subtitle;
  final Widget? trailing;
  final bool showChevron;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final lead =
        leading ??
        AppIconTile(
          icon: icon ?? LucideIcons.circle,
          tone: destructive ? AppTone.destructive : tone,
          size: tileSize,
        );
    return Semantics(
      button: onTap != null,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 60),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: padding,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                lead,
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.ui.copyWith(
                          color: destructive ? c.destructive : c.foreground,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (subtitle case final subtitle?)
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySm.copyWith(color: c.mutedForeground),
                        ),
                    ],
                  ),
                ),
                if (trailing case final trailing?) ...[
                  const SizedBox(width: AppSpacing.sm),
                  IconTheme.merge(
                    data: IconThemeData(color: c.mutedForeground, size: 18),
                    child: DefaultTextStyle.merge(
                      style: type.bodySm.copyWith(color: c.mutedForeground),
                      child: trailing,
                    ),
                  ),
                ],
                if (showChevron) ...[
                  const SizedBox(width: AppSpacing.xs),
                  Icon(AppIcons.forward, size: 18, color: c.mutedForeground),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
