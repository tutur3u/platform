import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// A Mastermind section title: muted, semibold and announced as a heading.
/// Spacing and type carry the hierarchy, so it never sits in a box.
class MastermindSectionHeader extends StatelessWidget {
  const MastermindSectionHeader(this.title, {this.trailing, super.key});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.sectionCaptionInset,
      ),
      child: Semantics(
        header: true,
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}

/// The one surface level Mastermind screens use: a subtle tint from the theme,
/// rounded, with no border. Rows inside are split by hairlines only, so a
/// group never reads as a box inside a box.
class MastermindSurface extends StatelessWidget {
  const MastermindSurface({
    required this.children,
    this.dividerInset = AppLayout.rowHorizontalPadding,
    this.showDividers = true,
    super.key,
  });

  final List<Widget> children;
  final double dividerInset;
  final bool showDividers;

  /// The surface tint, also used by tests and by rows that must match it.
  static Color tint(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return c.muted.withValues(alpha: solid ? 1 : (c.isDark ? 0.45 : 0.6));
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final radius = tokens.interface.borderRadius(AppRadius.card);
    return DecoratedBox(
      decoration: BoxDecoration(color: tint(context), borderRadius: radius),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (index, child) in children.indexed) ...[
                if (index > 0 && showDividers)
                  Divider(
                    height: 1,
                    thickness: 0.5,
                    indent: dividerInset,
                    color: tokens.colorScheme.border.withValues(alpha: 0.5),
                  ),
                child,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Header, one [MastermindSurface] and an optional muted footer, followed by
/// the section gap. The shared replacement for bordered grouped sections on
/// Inbox, Decision, Work and Ship.
class MastermindGroup extends StatelessWidget {
  const MastermindGroup({
    required this.children,
    this.caption,
    this.captionTrailing,
    this.footer,
    this.dividerInset = AppLayout.rowDividerInset,
    super.key,
  });

  final List<Widget> children;
  final String? caption;
  final Widget? captionTrailing;
  final String? footer;
  final double dividerInset;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (caption case final caption?) ...[
            MastermindSectionHeader(caption, trailing: captionTrailing),
            const SizedBox(height: AppLayout.sectionCaptionGap),
          ],
          MastermindSurface(dividerInset: dividerInset, children: children),
          if (footer case final footer?) ...[
            const SizedBox(height: AppLayout.sectionCaptionGap),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppLayout.sectionCaptionInset,
              ),
              child: Text(
                footer,
                style: tokens.typography.xSmall.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
