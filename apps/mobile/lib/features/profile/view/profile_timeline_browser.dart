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

class ProfileTimelineBrowser extends StatefulWidget {
  const ProfileTimelineBrowser({
    required this.items,
    required this.onOpen,
    this.loading = false,
    this.refreshing = false,
    this.now,
    this.convertDate,
    this.pageSize = 5,
    super.key,
  }) : assert(pageSize > 0, 'A page must contain at least one activity day');

  final List<ProfileTimelineItem> items;
  final ValueChanged<ProfileTimelineItem> onOpen;
  final bool loading;
  final bool refreshing;
  final DateTime? now;
  final TimelineDateConverter? convertDate;
  final int pageSize;

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
  Map<DateTime, List<ProfileTimelineItem>> get _groups =>
      groupProfileTimelineDays(widget.items, convertDate: _convert);
  String _id(ProfileTimelineItem item) => '${item.type}:${item.id}';
  DateTime _monday(DateTime date) =>
      DateTime(date.year, date.month, date.day - date.weekday + 1);

  @override
  void initState() {
    super.initState();
    _selected = _groups.keys.firstOrNull ?? _today;
    _week = _monday(_selected);
    _shown = widget.pageSize;
  }

  @override
  void didUpdateWidget(covariant ProfileTimelineBrowser oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_selectedByUser &&
        oldWidget.items.isEmpty &&
        widget.items.isNotEmpty) {
      _selected = _groups.keys.first;
      _week = _monday(_selected);
    }
    final ids = widget.items.map(_id).toSet();
    _itemKeys.removeWhere((id, _) => !ids.contains(id));
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
      _selectedByUser = true;
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
    if (_scroll.hasClients) _scroll.jumpTo(0);
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
    final entries = _dates
        ? groups.entries.where((entry) => entry.key == _selected).toList()
        : groups.entries.take(_shown).toList();
    final header = 48 + ProfileTimelineDateStrip.slotHeight(context);
    final height = math.max(
      MediaQuery.sizeOf(context).height * .72,
      header + 200,
    );
    return SizedBox(
      key: const ValueKey('timeline-browser'),
      height: height,
      child: Column(
        children: [
          ProfileTimelineDateStrip(
            open: _dates,
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
          SizedBox(
            height: 24,
            child: widget.refreshing
                ? Semantics(
                    liveRegion: true,
                    child: Text(context.l10n.profileLoading),
                  )
                : null,
          ),
          Expanded(
            child: FadeTransition(
              opacity: _fade,
              child: SingleChildScrollView(
                key: _viewport,
                controller: _scroll,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.loading)
                      const FinanceSkeletonBlock(height: 112, radius: 20)
                    else if (entries.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            _dates
                                ? context.l10n.profileTimelineDayEmpty
                                : context.l10n.profileTimelineEmpty,
                          ),
                        ),
                      ),
                    for (final entry in entries)
                      ProfileTimelineDays(
                        key: ValueKey(('timeline-group', entry.key)),
                        items: entry.value,
                        convertDate: _convert,
                        now: widget.now,
                        onOpen: widget.onOpen,
                        itemKey: (item) =>
                            _itemKeys.putIfAbsent(_id(item), GlobalKey.new),
                      ),
                    if (!_dates && groups.length > _shown)
                      shad.OutlineButton(
                        key: const ValueKey('timeline-more-days'),
                        onPressed: () =>
                            setState(() => _shown += widget.pageSize),
                        child: Text(context.l10n.profileTimelineMoreDays),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
