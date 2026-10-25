import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Static first-load placeholder shaped like the CMS overview: the summary
/// hero followed by queue rows.
class CmsLoadingSkeleton extends StatelessWidget {
  const CmsLoadingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.tokens.colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return ExcludeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 188,
            decoration: BoxDecoration(
              color: colors.muted.withValues(alpha: solid ? 1 : 0.6),
              borderRadius: BorderRadius.circular(AppRadius.card),
            ),
          ),
          const SizedBox(height: AppLayout.sectionGap),
          const AppGroupedCard(children: [AppSkeletonRows(count: 3)]),
        ],
      ),
    );
  }
}
