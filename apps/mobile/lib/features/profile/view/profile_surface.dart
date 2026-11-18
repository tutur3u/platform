import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// The card surface of Profile and Timeline: separated by shadow in Sorbet
/// and outlined in classic or under high contrast, like `AppCard`.
BoxDecoration profileCardDecoration(BuildContext context) {
  final tokens = AppTokens.of(context);
  final c = tokens.colorScheme;
  final solid = MediaQuery.highContrastOf(context);
  final outlined = tokens.depth.outlined || solid;
  return BoxDecoration(
    color: c.card,
    borderRadius: BorderRadius.circular(tokens.shapes.card),
    border: outlined
        ? Border.all(color: c.border.withValues(alpha: solid ? 1 : 0.8))
        : null,
    boxShadow: tokens.depth.card,
  );
}

/// Rows on one card, separated by inset hairlines.
class ProfileCard extends StatelessWidget {
  const ProfileCard({
    required this.children,
    this.dividerInset = AppLayout.rowDividerInset,
    super.key,
  });

  final List<Widget> children;

  /// Leading inset of the hairlines, aligned with the row text.
  final double dividerInset;

  @override
  Widget build(BuildContext context) {
    final decoration = profileCardDecoration(context);
    final hairline = AppTokens.of(context).colorScheme.border;
    return DecoratedBox(
      decoration: decoration,
      child: ClipRRect(
        borderRadius: decoration.borderRadius!,
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (index, child) in children.indexed) ...[
                if (index > 0)
                  Divider(
                    height: 1,
                    thickness: 1,
                    indent: dividerInset,
                    color: hairline,
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

/// Muted overline above a card group, in the label type role.
class ProfileGroupLabel extends StatelessWidget {
  const ProfileGroupLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppLayout.sectionCaptionInset,
        bottom: AppLayout.sectionCaptionGap,
      ),
      child: Semantics(
        header: true,
        child: Text(
          text.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: tokens.typography.overline.copyWith(
            color: tokens.colorScheme.mutedForeground,
          ),
        ),
      ),
    );
  }
}
