import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// The end of a thread list: a loading row while a page is read (linked
/// machines take seconds), the failure with a retry, or "Load 50 more".
class ProjectsListFooter extends StatelessWidget {
  const ProjectsListFooter({
    required this.slice,
    required this.onLoadMore,
    required this.onRetry,
    this.linkedMachine,
    super.key,
  });

  final ThreadListSlice slice;

  /// A linked machine's label: its reads take seconds, so the loading row
  /// says whose list is being read.
  final String? linkedMachine;
  final VoidCallback onLoadMore;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    final muted = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: colors.mutedForeground);
    if (slice.loading) {
      return _FooterRow(
        child: Row(
          children: [
            const SizedBox.square(
              dimension: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(switch (linkedMachine) {
                final machine? => l10n.mastermindProjectsReadingMachine(
                  machine,
                ),
                null => l10n.mastermindProjectsLoadingThreads,
              }, style: muted),
            ),
          ],
        ),
      );
    }
    if (slice.failure case final failure?) {
      return _FooterRow(
        child: Row(
          children: [
            Expanded(child: Text(failure.message(l10n), style: muted)),
            AppButton(
              variant: AppButtonVariant.ghost,
              density: AppButtonDensity.compact,
              onPressed: onRetry,
              child: Text(l10n.commonRetry),
            ),
          ],
        ),
      );
    }
    if (slice.hasMore) {
      return InkWell(
        onTap: onLoadMore,
        child: _FooterRow(
          child: Text(
            l10n.mastermindProjectsLoadMore,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }
    if (slice.threads.isEmpty) {
      return _FooterRow(
        child: Text(l10n.mastermindProjectsEmpty, style: muted),
      );
    }
    return const SizedBox.shrink();
  }
}

class _FooterRow extends StatelessWidget {
  const _FooterRow({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(minHeight: 44),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(38, 8, 16, 8),
      child: Align(alignment: Alignment.centerLeft, child: child),
    ),
  );
}
