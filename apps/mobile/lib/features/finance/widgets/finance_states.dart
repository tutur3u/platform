import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// Static placeholder block for finance loading layouts.
class FinanceSkeleton extends StatelessWidget {
  const FinanceSkeleton({required this.height, this.width, super.key});

  final double height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return ExcludeSemantics(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: tokens.colorScheme.muted,
          borderRadius: tokens.borderRadiusLg,
        ),
      ),
    );
  }
}

/// Loading layout of a finance list page: a summary block and rows.
class FinanceListSkeleton extends StatelessWidget {
  const FinanceListSkeleton({this.summaryHeight = 120, super.key});

  final double summaryHeight;

  @override
  Widget build(BuildContext context) => Semantics(
    label: context.l10n.commonLoading,
    child: AppPageListView(
      children: [
        FinanceSkeleton(height: summaryHeight),
        const SizedBox(height: AppLayout.sectionGap),
        const AppSkeletonRows(count: 4),
      ],
    ),
  );
}

/// Why a finance page has nothing to show.
enum FinanceProblem { error, offline, forbidden }

/// Full-page message for a failed, offline or forbidden finance read, with
/// Retry where retrying can help.
class FinanceProblemView extends StatelessWidget {
  const FinanceProblemView({
    required this.problem,
    this.onRetry,
    this.message,
    super.key,
  });

  final FinanceProblem problem;
  final VoidCallback? onRetry;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, title, body, tone) = switch (problem) {
      FinanceProblem.error => (
        Icons.error_outline_rounded,
        l10n.commonSomethingWentWrong,
        message,
        AppTone.destructive,
      ),
      FinanceProblem.offline => (
        Icons.cloud_off_rounded,
        l10n.financeOfflineTitle,
        l10n.financeOfflineBody,
        AppTone.neutral,
      ),
      FinanceProblem.forbidden => (
        Icons.lock_outline_rounded,
        l10n.financeNoAccessTitle,
        l10n.financeNoAccessBody,
        AppTone.warning,
      ),
    };
    return AppPageListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: AppSpacing.xxxl),
        AppStateMessage(
          icon: icon,
          title: title,
          message: body,
          tone: tone,
          actionLabel: problem == FinanceProblem.forbidden || onRetry == null
              ? null
              : l10n.commonRetry,
          onAction: problem == FinanceProblem.forbidden ? null : onRetry,
        ),
      ],
    );
  }
}
