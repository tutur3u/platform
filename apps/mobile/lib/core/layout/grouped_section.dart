import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Muted caption above a grouped card.
class AppSectionCaption extends StatelessWidget {
  const AppSectionCaption(this.text, {this.trailing, super.key});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = theme.textTheme.labelLarge?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.2,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.sectionCaptionInset,
      ),
      child: Semantics(
        header: true,
        child: Row(
          children: [
            Expanded(child: Text(text, style: style)),
            ?trailing,
          ],
        ),
      ),
    );
  }
}

/// Heavily rounded, translucent card that groups rows and separates them with
/// inset hairline dividers. It owns no row layout; pass any row widgets.
class AppGroupedCard extends StatelessWidget {
  const AppGroupedCard({
    required this.children,
    this.dividerInset = AppLayout.rowDividerInset,
    this.showDividers = true,
    this.padding = EdgeInsets.zero,
    super.key,
  });

  final List<Widget> children;

  /// Leading inset of the dividers. Use [AppLayout.rowHorizontalPadding] for
  /// rows without a leading icon tile.
  final double dividerInset;
  final bool showDividers;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    final radius = AppTokens.of(context).interface.borderRadius(AppRadius.card);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: solid ? 1 : 0.72),
        borderRadius: radius,
        border: Border.all(
          color: colors.outlineVariant.withValues(alpha: solid ? 1 : 0.4),
        ),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          type: MaterialType.transparency,
          child: Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final (index, child) in children.indexed) ...[
                  if (index > 0 && showDividers)
                    Divider(
                      key: ValueKey('app-grouped-card-divider-$index'),
                      height: 1,
                      thickness: 0.5,
                      indent: dividerInset,
                      color: colors.outlineVariant.withValues(alpha: 0.6),
                    ),
                  child,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Caption, grouped card and optional muted footer, spaced with the section
/// tokens. Stack sections with [AppLayout.sectionGap] between them, or use
/// [AppGroupedSection.spaced] in a list to add the gap automatically.
class AppGroupedSection extends StatelessWidget {
  const AppGroupedSection({
    required this.children,
    this.caption,
    this.captionTrailing,
    this.footer,
    this.dividerInset = AppLayout.rowDividerInset,
    this.bottomGap = 0,
    super.key,
  });

  /// A section followed by the standard [AppLayout.sectionGap].
  const AppGroupedSection.spaced({
    required this.children,
    this.caption,
    this.captionTrailing,
    this.footer,
    this.dividerInset = AppLayout.rowDividerInset,
    super.key,
  }) : bottomGap = AppLayout.sectionGap;

  final List<Widget> children;
  final String? caption;
  final Widget? captionTrailing;
  final String? footer;
  final double dividerInset;
  final double bottomGap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: bottomGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (caption case final caption?) ...[
            AppSectionCaption(caption, trailing: captionTrailing),
            const SizedBox(height: AppLayout.sectionCaptionGap),
          ],
          AppGroupedCard(dividerInset: dividerInset, children: children),
          if (footer case final footer?) ...[
            const SizedBox(height: AppLayout.sectionCaptionGap),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppLayout.sectionCaptionInset,
              ),
              child: Text(
                footer,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
