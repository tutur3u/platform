import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/profile/view/profile_timeline_grouping.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the timeline shows instead of days.
enum ProfileTimelineStatus { loading, empty, filteredEmpty, unavailable }

/// Null when there are days to show.
ProfileTimelineStatus? profileTimelineStatus({
  required bool loading,
  required bool empty,
  required bool filtered,
  required ProfileTimelineAvailability availability,
}) {
  if (loading) return ProfileTimelineStatus.loading;
  if (!empty) return null;
  if (filtered) return ProfileTimelineStatus.filteredEmpty;
  return availability == ProfileTimelineAvailability.complete
      ? ProfileTimelineStatus.empty
      : ProfileTimelineStatus.unavailable;
}

/// Loading, empty, filtered-out and unavailable states in the timeline body.
class ProfileTimelineStateBody extends StatelessWidget {
  const ProfileTimelineStateBody({
    required this.status,
    this.onRetry,
    this.onClearFilters,
    super.key,
  });

  final ProfileTimelineStatus status;
  final VoidCallback? onRetry;
  final VoidCallback? onClearFilters;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final body = switch (status) {
      ProfileTimelineStatus.loading => Semantics(
        key: const ValueKey('timeline-loading'),
        label: l10n.commonLoading,
        liveRegion: true,
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [AppSkeletonRows(count: 5, leadingSize: 36)],
        ),
      ),
      ProfileTimelineStatus.empty => AppStateMessage(
        key: const ValueKey('timeline-empty'),
        icon: LucideIcons.history,
        title: l10n.profileTimelineEmpty,
      ),
      ProfileTimelineStatus.filteredEmpty => AppStateMessage(
        key: const ValueKey('timeline-filtered-empty'),
        icon: LucideIcons.listFilter,
        title: l10n.profileTimelineFilteredEmpty,
        actionLabel: onClearFilters == null
            ? null
            : l10n.profileTimelineClearFilters,
        onAction: onClearFilters,
      ),
      ProfileTimelineStatus.unavailable => AppStateMessage(
        key: const ValueKey('timeline-unavailable'),
        icon: LucideIcons.cloudOff,
        tone: AppTone.destructive,
        title: l10n.profileTimelineUnavailable,
        actionLabel: onRetry == null ? null : l10n.commonRetry,
        onAction: onRetry,
      ),
    };
    return Semantics(
      liveRegion: status != ProfileTimelineStatus.loading,
      child: status == ProfileTimelineStatus.loading
          ? Align(alignment: Alignment.topCenter, child: body)
          : Center(child: body),
    );
  }
}

/// The end of the loaded days: a spinner while the next page loads, or
/// Load more when the next page waits for the user.
class ProfileTimelineFooter extends StatelessWidget {
  const ProfileTimelineFooter({
    required this.loadingMore,
    this.onLoadMore,
    super.key,
  });

  final bool loadingMore;

  /// Shown as Load more when set and nothing is loading.
  final VoidCallback? onLoadMore;

  @override
  Widget build(BuildContext context) {
    final onLoadMore = this.onLoadMore;
    if (!loadingMore && onLoadMore == null) {
      return const SizedBox(height: AppSpacing.lg);
    }
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Center(
        child: loadingMore
            ? AppLoadingIndicator(
                key: const ValueKey('timeline-loading-more'),
                semanticLabel: context.l10n.commonLoading,
              )
            : AppButton.outline(
                key: const ValueKey('timeline-load-more'),
                onPressed: onLoadMore,
                child: Text(context.l10n.commonLoadMore),
              ),
      ),
    );
  }
}
