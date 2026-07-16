import 'package:flutter/material.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';

class CmsLoadingSkeleton extends StatelessWidget {
  const CmsLoadingSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        children: [
          Expanded(child: FinanceSkeletonBlock(height: 112, radius: 22)),
          SizedBox(width: 12),
          Expanded(child: FinanceSkeletonBlock(height: 112, radius: 22)),
        ],
      ),
      SizedBox(height: 12),
      Row(
        children: [
          Expanded(child: FinanceSkeletonBlock(height: 112, radius: 22)),
          SizedBox(width: 12),
          Expanded(child: FinanceSkeletonBlock(height: 112, radius: 22)),
        ],
      ),
      SizedBox(height: 16),
      FinanceSkeletonBlock(height: 180, radius: 24),
      SizedBox(height: 12),
      FinanceSkeletonBlock(height: 132, radius: 24),
    ],
  );
}
