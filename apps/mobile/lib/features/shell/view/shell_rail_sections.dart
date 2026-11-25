import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_tooltip.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';

/// A collapsible section heading among a page's sidebar destinations, such
/// as Mail's Folders and Labels. The icon rail shows a compact chevron with
/// the label as its tooltip.
class ShellRailSectionHeading extends StatelessWidget {
  const ShellRailSectionHeading({
    required this.label,
    required this.expanded,
    required this.extended,
    required this.onTap,
    this.count,
    super.key,
  });

  final String label;
  final bool expanded;
  final bool extended;
  final VoidCallback? onTap;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final tokens = AppTokens.of(context);
    final muted = style.mutedForeground;
    final chevron = Icon(
      expanded ? LucideIcons.chevronDown : LucideIcons.chevronRight,
      size: 14,
      color: muted,
    );
    final count = this.count;
    final heading = Semantics(
      button: true,
      expanded: expanded,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(style.rowRadius),
        child: SizedBox(
          height: extended ? 32 : 24,
          width: extended ? double.infinity : 44,
          child: ExcludeSemantics(
            child: extended
                ? Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.xSmall.copyWith(
                              color: muted,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        if (count != null && count > 0)
                          Padding(
                            padding: const EdgeInsetsDirectional.only(end: 6),
                            child: Text(
                              '$count',
                              style: tokens.typography.xSmall.copyWith(
                                color: muted,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ),
                        chevron,
                      ],
                    ),
                  )
                : Center(child: chevron),
          ),
        ),
      ),
    );
    if (extended) return heading;
    return AppTooltip(
      message: label,
      excludeFromSemantics: true,
      preferBelow: false,
      child: heading,
    );
  }
}

/// A rounded count pill after a sidebar destination's label.
class ShellRailCount extends StatelessWidget {
  const ShellRailCount({required this.count, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.foreground,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          '$count',
          style: tokens.typography.xSmall.copyWith(
            color: colors.background,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }
}
