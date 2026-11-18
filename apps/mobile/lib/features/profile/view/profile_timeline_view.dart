import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_chips.dart';
import 'package:mobile/features/profile/view/profile_timeline_day_header.dart';
import 'package:mobile/features/profile/view/profile_timeline_filter.dart';
import 'package:mobile/features/profile/view/profile_timeline_grouping.dart';
import 'package:mobile/features/profile/view/profile_timeline_row.dart';
import 'package:mobile/features/profile/view/profile_timeline_states.dart';

export 'package:mobile/features/profile/view/profile_timeline_grouping.dart'
    show ProfileTimelineAvailability, TimelineDateConverter;

/// Loaded activity as a vertical timeline: source chips, then one group per
/// day, newest first, under a sticky day header. Reaching the end asks for
/// the next page through [onLoadMore]. While a filter is active, pages load
/// only when the user taps Load more, so a narrow filter never walks the
/// whole history on its own.
class ProfileTimelineView extends StatefulWidget {
  const ProfileTimelineView({
    required this.items,
    required this.onOpen,
    this.filter = const ProfileTimelineFilter(),
    this.onFilterChanged,
    this.loading = false,
    this.availability = ProfileTimelineAvailability.complete,
    this.loadingMore = false,
    this.hasMore = false,
    this.onLoadMore,
    this.onRetry,
    this.contentTopPadding = 0,
    this.horizontalPadding = EdgeInsets.zero,
    this.now,
    this.convertDate,
    super.key,
  });

  final List<ProfileTimelineItem> items;
  final ValueChanged<ProfileTimelineItem> onOpen;
  final ProfileTimelineFilter filter;
  final ValueChanged<ProfileTimelineFilter>? onFilterChanged;
  final bool loading;
  final ProfileTimelineAvailability availability;

  final bool loadingMore;
  final bool hasMore;
  final VoidCallback? onLoadMore;
  final VoidCallback? onRetry;
  final double contentTopPadding;

  /// Page gutters, applied inside the scroll view so it stays full width.
  final EdgeInsets horizontalPadding;
  final DateTime? now;
  final TimelineDateConverter? convertDate;

  @override
  State<ProfileTimelineView> createState() => _ProfileTimelineViewState();
}

class _ProfileTimelineViewState extends State<ProfileTimelineView> {
  final _scroll = ScrollController();
  late Map<DateTime, List<ProfileTimelineItem>> _days = _group();

  DateTime _convert(DateTime instant) =>
      widget.convertDate?.call(instant) ?? instant.toLocal();
  DateTime get _today =>
      profileTimelineDay(widget.now ?? DateTime.now(), _convert);

  Map<DateTime, List<ProfileTimelineItem>> _group() {
    final today = _today;
    final days = groupProfileTimelineDays(
      {
        for (final item in widget.items) '${item.type}:${item.id}': item,
      }.values.toList(),
      convertDate: _convert,
    );
    return {
      for (final MapEntry(key: day, value: items) in days.entries)
        if (items.where((item) => widget.filter.accepts(item, day, today))
            case final kept when kept.isNotEmpty)
          day: kept.toList(),
    };
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_checkEnd);
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkEnd());
  }

  @override
  void didUpdateWidget(covariant ProfileTimelineView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.items, oldWidget.items) ||
        widget.filter != oldWidget.filter ||
        widget.convertDate != oldWidget.convertDate ||
        widget.now != oldWidget.now) {
      _days = _group();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkEnd());
  }

  /// Requests the next page once the end of the loaded days is near, also
  /// when the loaded days do not fill the viewport. Filtered views wait for
  /// Load more instead.
  void _checkEnd() {
    if (!mounted || !_scroll.hasClients) return;
    if (widget.loading || widget.loadingMore || !widget.hasMore) return;
    if (widget.filter.isActive) return;
    if (_scroll.position.extentAfter > 400) return;
    widget.onLoadMore?.call();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  String _clock(BuildContext context, DateTime instant) =>
      MaterialLocalizations.of(context).formatTimeOfDay(
        TimeOfDay.fromDateTime(_convert(instant)),
        alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
      );

  /// The widest time label at the current text scale.
  double _timeWidth(BuildContext context) {
    final style = AppTokens.of(context).typography.numeric.copyWith(
      fontWeight: FontWeight.w700,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    var width = 0.0;
    for (final sample in [DateTime(2000, 1, 1, 12, 58), DateTime(2000)]) {
      final painter = TextPainter(
        text: TextSpan(text: _clock(context, sample), style: style),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout();
      width = math.max(width, painter.width);
      painter.dispose();
    }
    return math.max(44, width.ceilToDouble() + 2);
  }

  @override
  Widget build(BuildContext context) {
    final gutters = widget.horizontalPadding;
    final rowPadding = EdgeInsets.only(
      left: gutters.left,
      right: gutters.right,
    );
    final today = _today;
    final timeWidth = _timeWidth(context);
    // The card keeps a readable width; below it the time moves into the card.
    final inlineTime =
        MediaQuery.sizeOf(context).width -
            gutters.horizontal -
            timeWidth -
            2 * ProfileTimelineRow.gap -
            ProfileTimelineRow.tileSize <
        160;
    final filter = widget.filter;
    final onFilterChanged = widget.onFilterChanged;
    final manualPaging =
        filter.isActive && (widget.hasMore || widget.loadingMore);
    final footer = ProfileTimelineFooter(
      loadingMore: widget.loadingMore,
      onLoadMore: filter.isActive && widget.hasMore ? widget.onLoadMore : null,
    );
    final status = profileTimelineStatus(
      loading: widget.loading,
      empty: _days.isEmpty,
      filtered: filter.isActive && widget.items.isNotEmpty,
      availability: widget.availability,
    );
    Widget stateBody(ProfileTimelineStatus status) => ProfileTimelineStateBody(
      status: status,
      onRetry: widget.onRetry,
      onClearFilters: onFilterChanged == null
          ? null
          : () => onFilterChanged(const ProfileTimelineFilter()),
    );
    return CustomScrollView(
      key: const ValueKey('profile-timeline'),
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        // Day headers stick below the shell's top bar.
        PinnedHeaderSliver(child: SizedBox(height: widget.contentTopPadding)),
        if (onFilterChanged != null)
          SliverPadding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            sliver: SliverToBoxAdapter(
              child: ProfileTimelineSourceChips(
                selected: filter.source,
                padding: gutters,
                onSelected: (source) =>
                    onFilterChanged(filter.copyWith(source: () => source)),
              ),
            ),
          ),
        if (status != null)
          if (manualPaging)
            // Load more stays in view below a filtered-out state.
            SliverToBoxAdapter(
              child: Padding(
                padding: rowPadding.copyWith(top: AppSpacing.xl),
                child: stateBody(status),
              ),
            )
          else
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(padding: rowPadding, child: stateBody(status)),
            )
        else
          for (final MapEntry(key: day, value: items) in _days.entries)
            SliverMainAxisGroup(
              key: ValueKey(('timeline-day', day)),
              slivers: [
                PinnedHeaderSliver(
                  child: Builder(
                    builder: (context) {
                      final label = profileTimelineDayLabel(
                        context,
                        day,
                        today,
                      );
                      return ProfileTimelineDayHeader(
                        title: label.title,
                        date: label.date,
                        padding: gutters,
                      );
                    },
                  ),
                ),
                SliverPadding(
                  padding: rowPadding.copyWith(bottom: AppSpacing.sm),
                  sliver: SliverList.builder(
                    itemCount: items.length,
                    itemBuilder: (context, index) => ProfileTimelineRow(
                      key: ValueKey(
                        'timeline-row-${items[index].type}:${items[index].id}',
                      ),
                      item: items[index],
                      time: _clock(context, items[index].createdAt),
                      timeWidth: timeWidth,
                      last: index == items.length - 1,
                      inlineTime: inlineTime,
                      onOpen: widget.onOpen,
                    ),
                  ),
                ),
              ],
            ),
        if (status == null || manualPaging) SliverToBoxAdapter(child: footer),
        SliverToBoxAdapter(
          child: SizedBox(
            height:
                AppPageInsets.contentBottomClearance(context) +
                AppLayout.scrollEndGap,
          ),
        ),
      ],
    );
  }
}
