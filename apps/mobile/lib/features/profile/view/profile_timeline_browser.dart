import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_date_strip.dart';
import 'package:mobile/features/profile/view/profile_timeline_days.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

typedef TimelineDateConverter = DateTime Function(DateTime instant);

DateTime profileTimelineDay(DateTime instant, TimelineDateConverter convert) {
  final local = convert(instant);
  return DateTime(local.year, local.month, local.day);
}

enum ProfileTimelineAvailability { complete, partial, unavailable }

class ProfileTimelineBrowser extends StatefulWidget {
  const ProfileTimelineBrowser({
    required this.items,
    required this.onOpen,
    this.loading = false,
    this.status,
    this.contentTopPadding = 0,
    this.fullSurface = false,
    this.datesOpen,
    this.onDatesChanged,
    this.refreshing = false,
    this.availability = ProfileTimelineAvailability.complete,
    this.statusReportedByParent = false,
    this.now,
    this.convertDate,
    this.pageSize = 5,
    this.onLoadMore,
    this.loadingMore = false,
    super.key,
  }) : assert(pageSize > 0, 'A page must contain at least one activity day');

  final List<ProfileTimelineItem> items;
  final ValueChanged<ProfileTimelineItem> onOpen;
  final bool loading;
  final Widget? status;
  final double contentTopPadding;
  final bool fullSurface;
  final bool? datesOpen;
  final ValueChanged<bool>? onDatesChanged;
  final bool refreshing;
  final ProfileTimelineAvailability availability;
  final bool statusReportedByParent;
  final DateTime? now;
  final TimelineDateConverter? convertDate;
  final int pageSize;
  final VoidCallback? onLoadMore;
  final bool loadingMore;

  @override
  State<ProfileTimelineBrowser> createState() => _ProfileTimelineBrowserState();
}

class _ProfileTimelineBrowserState extends State<ProfileTimelineBrowser>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fade = AnimationController(
    vsync: this,
    value: 1,
    duration: const Duration(milliseconds: 160),
  );
  final _scroll = ScrollController();
  final GlobalKey _viewport = GlobalKey();
  final _itemKeys = <String, GlobalKey>{};
  bool _dates = false;
  bool _appendScheduled = false;
  bool _selectedByUser = false;
  late DateTime _selected;
  late DateTime _week;
  late int _shown;
  int _transition = 0;
  double? _agendaOffset;

  DateTime _convert(DateTime date) =>
      widget.convertDate?.call(date) ?? date.toLocal();
  DateTime get _today =>
      profileTimelineDay(widget.now ?? DateTime.now(), _convert);
  late Map<DateTime, List<ProfileTimelineItem>> _cachedGroups = _groupItems();
  Map<DateTime, List<ProfileTimelineItem>> _groupItems() =>
      groupProfileTimelineDays(
        {for (final item in widget.items) _id(item): item}.values.toList(),
        convertDate: _convert,
      );
  Map<DateTime, List<ProfileTimelineItem>> get _groups => _cachedGroups;
  final GlobalKey _chromeKey = GlobalKey();
  double _rowExtent(BuildContext context) {
    double line(TextStyle style) => TextPainter(
      text: TextSpan(
        text: 'Mg',
        style: DefaultTextStyle.of(context).style.merge(style),
      ),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    ).preferredLineHeight;
    final material = Theme.of(context).textTheme;
    final typography = shad.Theme.of(context).typography;
    final tile =
        line(material.titleMedium!) * 2 + line(material.bodyMedium!) * 2 + 32;
    final heading =
        line(typography.base) * 2 + line(typography.textSmall) * 2 + 32;
    return math.max(88, math.max(tile, heading)).ceilToDouble();
  }

  List<({DateTime day, ProfileTimelineItem? item})> _nodes() => [
    for (final entry in _groups.entries.take(_shown)) ...[
      (day: entry.key, item: null),
      for (final item in entry.value) (day: entry.key, item: item),
    ],
  ];
  String _id(ProfileTimelineItem item) => '${item.type}:${item.id}';
  DateTime _monday(DateTime date) =>
      DateTime(date.year, date.month, date.day - date.weekday + 1);

  @override
  void initState() {
    super.initState();
    _dates = widget.datesOpen ?? false;
    _selected = _groups.keys.firstOrNull ?? _today;
    _week = _monday(_selected);
    _shown = widget.pageSize;
    _scroll.addListener(_nearBottom);
    _checkViewportAfterLayout();
  }

  @override
  void didUpdateWidget(covariant ProfileTimelineBrowser oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.items, oldWidget.items) ||
        widget.convertDate != oldWidget.convertDate) {
      _cachedGroups = _groupItems();
    }
    if (widget.datesOpen != null &&
        widget.datesOpen != oldWidget.datesOpen &&
        widget.datesOpen != _dates) {
      _toggle();
    }
    if (!_selectedByUser &&
        oldWidget.items.isEmpty &&
        widget.items.isNotEmpty) {
      _selected = _groups.keys.first;
      _week = _monday(_selected);
    }
    _checkViewportAfterLayout();
    final ids = widget.items.map(_id).toSet();
    _itemKeys.removeWhere((id, _) => !ids.contains(id));
  }

  void _checkViewportAfterLayout() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _nearBottom();
    });
  }

  void _nearBottom() {
    if (!_scroll.hasClients ||
        _scroll.position.extentAfter > 300 ||
        widget.loading ||
        _appendScheduled ||
        widget.loadingMore) {
      return;
    }
    if (_shown >= _groups.length) {
      widget.onLoadMore?.call();
      return;
    }
    _appendScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _appendScheduled = false;
      if (!mounted || widget.loading || _shown >= _groups.length) return;
      setState(() => _shown += widget.pageSize);
      _checkViewportAfterLayout();
    });
    // A post-layout append can be requested without any scroll animation.
    WidgetsBinding.instance.scheduleFrame();
  }

  Rect? _rect(GlobalKey key) {
    final box = key.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  ({String id, double top, DateTime day})? _anchor() {
    final viewport = _rect(_viewport);
    if (viewport == null) return null;
    for (final group in _groups.entries) {
      for (final item in group.value) {
        final key = _itemKeys[_id(item)];
        final rect = key == null ? null : _rect(key);
        if (rect != null &&
            rect.bottom > viewport.top &&
            rect.top < viewport.bottom) {
          return (id: _id(item), top: rect.top, day: group.key);
        }
      }
    }
    return null;
  }

  void _animate() {
    if (MediaQuery.disableAnimationsOf(context)) {
      _fade.value = 1;
    } else {
      _fade.forward(from: .75);
    }
  }

  void _toggle() {
    final anchor = _anchor();
    final generation = ++_transition;
    setState(() {
      if (!_dates &&
          anchor != null &&
          (_agendaOffset == null ||
              (_scroll.offset - _agendaOffset!).abs() > .5)) {
        _selected = anchor.day;
      }
      // Opening controls without activity is not an explicit date choice.
      // Let the first response reveal its newest day unless _select was used.
      if (anchor != null) _selectedByUser = true;
      _dates = !_dates;
      _week = _monday(_selected);
      final index = _groups.keys.toList().indexOf(_selected);
      if (index >= _shown) _shown = index + 1;
    });
    _animate();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || generation != _transition || !_scroll.hasClients) return;
      final key = anchor == null ? null : _itemKeys[anchor.id];
      final current = key == null ? null : _rect(key);
      if (current == null || anchor == null) {
        if (!_dates) _agendaOffset = _scroll.offset;
        return;
      }
      final target = (_scroll.offset + current.top - anchor.top).clamp(
        0.0,
        _scroll.position.maxScrollExtent,
      );
      _scroll.jumpTo(target);
      if (!_dates) _agendaOffset = _scroll.offset;
    });
  }

  void _select(DateTime day) {
    _transition++;
    setState(() {
      _selectedByUser = true;
      _selected = day;
      _week = _monday(day);
      _dates = true;
    });
    widget.onDatesChanged?.call(true);
    final index = _groups.keys.toList().indexOf(day);
    if (index >= _shown) setState(() => _shown = index + 1);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final index = _nodes().indexWhere((node) => node.day == day);
      if (index < 0) return;
      final chrome = _chromeKey.currentContext?.findRenderObject();
      final chromeHeight = chrome is RenderBox && chrome.hasSize
          ? chrome.size.height
          : 0.0;
      _scroll.jumpTo(
        (widget.contentTopPadding + chromeHeight + index * _rowExtent(context))
            .clamp(0.0, _scroll.position.maxScrollExtent),
      );
    });
    _animate();
  }

  @override
  void dispose() {
    _transition++;
    _fade.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groups;
    final entries = groups.entries.take(_shown).toList();
    final nodes = _nodes();
    final header = 48 + ProfileTimelineDateStrip.slotHeight(context);
    final height = math.max(
      MediaQuery.sizeOf(context).height * .72,
      header + 200,
    );
    return SizedBox(
      key: const ValueKey('timeline-browser'),
      height: widget.fullSurface ? null : height,
      child: FadeTransition(
        opacity: _fade,
        child: CustomScrollView(
          key: _viewport,
          controller: _scroll,
          slivers: [
            SliverToBoxAdapter(
              child: SizedBox(height: widget.contentTopPadding),
            ),
            SliverToBoxAdapter(
              child: Column(
                key: _chromeKey,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.status != null) widget.status!,
                  ProfileTimelineDateStrip(
                    open: _dates,
                    showToggle: widget.datesOpen == null,
                    selected: _selected,
                    week: _week,
                    activityDays: groups.keys.toSet(),
                    onToggle: _toggle,
                    onSelect: _select,
                    onWeek: (delta) => setState(
                      () => _week = DateTime(
                        _week.year,
                        _week.month,
                        _week.day + delta * 7,
                      ),
                    ),
                    onToday: () => _select(_today),
                  ),
                  if (widget.loading ||
                      (widget.refreshing && widget.items.isEmpty))
                    Semantics(
                      label: context.l10n.commonLoading,
                      liveRegion: true,
                      child: const FinanceSkeletonBlock(
                        height: 112,
                        radius: 20,
                      ),
                    )
                  else if (entries.isEmpty &&
                      !(widget.statusReportedByParent &&
                          widget.availability !=
                              ProfileTimelineAvailability.complete))
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(switch (widget.availability) {
                          ProfileTimelineAvailability.unavailable =>
                            context.l10n.profileTimelineUnavailable,
                          ProfileTimelineAvailability.partial =>
                            context.l10n.profileTimelinePartial,
                          ProfileTimelineAvailability.complete =>
                            _dates
                                ? context.l10n.profileTimelineDayEmpty
                                : context.l10n.profileTimelineEmpty,
                        }),
                      ),
                    ),
                  if (_dates &&
                      groups.isNotEmpty &&
                      !groups.containsKey(_selected) &&
                      !widget.loading &&
                      widget.availability ==
                          ProfileTimelineAvailability.complete)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(context.l10n.profileTimelineDayEmpty),
                    ),
                ],
              ),
            ),
            SliverFixedExtentList(
              itemExtent: _rowExtent(context),
              delegate: SliverChildBuilderDelegate((context, index) {
                final node = nodes[index];
                final item = node.item;
                return ProfileTimelineDays(
                  key: ValueKey(
                    item == null
                        ? ('timeline-group', node.day)
                        : ('timeline-row', _id(item)),
                  ),
                  items: item == null ? groups[node.day]! : [item],
                  showHeader: item == null,
                  showItems: item != null,
                  convertDate: _convert,
                  now: widget.now,
                  onOpen: widget.onOpen,
                  itemKey: (item) =>
                      _itemKeys.putIfAbsent(_id(item), GlobalKey.new),
                );
              }, childCount: nodes.length),
            ),
            SliverToBoxAdapter(
              child: Column(
                children: [
                  if (groups.length > _shown)
                    shad.OutlineButton(
                      key: const ValueKey('timeline-more-days'),
                      onPressed: () =>
                          setState(() => _shown += widget.pageSize),
                      child: Text(context.l10n.profileTimelineMoreDays),
                    ),
                ],
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 24 + MediaQuery.paddingOf(context).bottom,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
