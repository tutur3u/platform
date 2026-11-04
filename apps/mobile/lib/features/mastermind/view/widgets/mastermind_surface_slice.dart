import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';

/// A lazy row's share of the shared borderless Mastermind surface.
class MastermindSurfaceSlice extends StatelessWidget {
  const MastermindSurfaceSlice({
    required this.child,
    required this.first,
    required this.last,
    super.key,
  });

  final Widget child;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final radius = tokens.interface.borderRadius(AppRadius.card).topLeft;
    return ClipRRect(
      borderRadius: BorderRadius.vertical(
        top: first ? radius : Radius.zero,
        bottom: last ? radius : Radius.zero,
      ),
      child: ColoredBox(
        color: MastermindSurface.tint(context),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!first)
                Divider(
                  height: 1,
                  thickness: 0.5,
                  indent: AppLayout.rowDividerInset,
                  color: tokens.colorScheme.border.withValues(alpha: 0.5),
                ),
              Semantics(explicitChildNodes: true, child: child),
            ],
          ),
        ),
      ),
    );
  }
}
