import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// One count: glyph, value and label, opening the lane list on that state.
class MastermindCountTile extends StatelessWidget {
  const MastermindCountTile({
    required this.state,
    required this.count,
    required this.label,
    required this.icon,
    this.caption,
    this.tone = AppTone.neutral,
    super.key,
  });

  final LaneState state;
  final int count;
  final String label;
  final IconData icon;
  final String? caption;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final semantics = ['$label, $count', ?caption].join('. ');
    return Semantics(
      container: true,
      button: true,
      label: semantics,
      hint: context.l10n.mastermindOpensLanes,
      excludeSemantics: true,
      child: Material(
        color: c.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          side: BorderSide(color: c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.go(workLocation(state: state)),
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: 72,
              minWidth: AppInterfaceTokens.minTouchTarget,
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '$count',
                          style: type.xLarge
                              .merge(type.semiBold)
                              .copyWith(
                                color: c.foreground,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                        ),
                      ),
                      Icon(icon, size: 14, color: tone.foreground(c)),
                    ],
                  ),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.small.copyWith(color: c.mutedForeground),
                  ),
                  if (caption case final caption?)
                    Text(
                      caption,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.label.copyWith(color: c.foreground),
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
