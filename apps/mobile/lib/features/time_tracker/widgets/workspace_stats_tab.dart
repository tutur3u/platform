import 'dart:async';

import 'package:flutter/material.dart' hide Card, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum _ManagementPeriod { day, week, month }

class WorkspaceStatsTab extends StatefulWidget {
  const WorkspaceStatsTab({super.key, this.repository});

  final ITimeTrackerRepository? repository;

  @override
  State<WorkspaceStatsTab> createState() => _WorkspaceStatsTabState();
}

class _WorkspaceStatsTabState extends State<WorkspaceStatsTab> {
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'time-tracker:management-sessions';

  late final ITimeTrackerRepository _repo;
  final _searchCtrl = TextEditingController();

  _ManagementPeriod _period = _ManagementPeriod.week;
  List<TimeTrackingSession> _sessions = const [];
  bool _loading = true;
  bool _isRefreshing = false;
  String? _error;

  static CacheKey _cacheKey(
    String wsId,
    String? search,
    _ManagementPeriod period,
    DateTime dateFrom,
    DateTime dateTo,
  ) {
    return CacheKey(
      namespace: 'time_tracker.management_sessions',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {
        'search': search ?? '',
        'period': period.name,
        'dateFrom': dateFrom.toIso8601String(),
        'dateTo': dateTo.toIso8601String(),
      },
    );
  }

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException(
        'Invalid time tracker management sessions cache payload.',
      );
    }

    return Map<String, dynamic>.from(json);
  }

  @override
  void initState() {
    super.initState();
    _repo = widget.repository ?? TimeTrackerRepository();
    unawaited(_load());
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final hasActiveSearch = _searchCtrl.text.trim().isNotEmpty;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, _) => unawaited(_load(forceRefresh: true)),
      child: Stack(
        children: [
          ShellChromeActions(
            ownerId: 'time-tracker-stats-workspace-search',
            locations: const {Routes.timerStats, Routes.timerManagement},
            actions: [
              ShellActionSpec(
                id: 'time-tracker-stats-workspace-search',
                icon: Icons.search,
                tooltip: l10n.timerSearchSessions,
                callbackToken: _searchCtrl.text.trim(),
                highlighted: hasActiveSearch,
                onPressed: _showSearchSheet,
              ),
            ],
          ),
          if (_loading && _sessions.isEmpty)
            const Center(child: NovaLoadingIndicator())
          else if (_error != null && _sessions.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: theme.typography.p.copyWith(
                        color: theme.colorScheme.destructive,
                      ),
                    ),
                    const shad.Gap(12),
                    shad.SecondaryButton(
                      onPressed: () => unawaited(_load(forceRefresh: true)),
                      child: Text(l10n.commonRetry),
                    ),
                  ],
                ),
              ),
            )
          else
            RefreshIndicator(
              onRefresh: () => _load(forceRefresh: true),
              child: ListView(
                padding: const EdgeInsets.only(top: 16, bottom: 96),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _ManagementPeriodSelector(
                      period: _period,
                      onChanged: (period) {
                        if (_period == period) {
                          return;
                        }
                        setState(() => _period = period);
                        unawaited(_load(forceRefresh: true));
                      },
                    ),
                  ),
                  const shad.Gap(12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _RangeHeroCard(
                      title: _periodLabel(l10n, _period),
                      rangeLabel: _rangeLabel(),
                      sessionCount: _sessions.length,
                      searchQuery: hasActiveSearch
                          ? _searchCtrl.text.trim()
                          : null,
                    ),
                  ),
                  const shad.Gap(12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _MetricCard(
                          label: l10n.timerTotalSessions,
                          value: '${_sessions.length}',
                          icon: shad.LucideIcons.timer,
                          color: theme.colorScheme.primary,
                        ),
                        _MetricCard(
                          label: l10n.timerActiveUsers,
                          value: '${_uniqueUsers()}',
                          icon: shad.LucideIcons.users,
                          color: const Color(0xFF22C55E),
                        ),
                        _MetricCard(
                          label: l10n.timerHistoryTotalTime,
                          value: _formatDuration(_totalTrackedDuration),
                          icon: shad.LucideIcons.clock3,
                          color: const Color(0xFFF59E0B),
                        ),
                        _MetricCard(
                          label: l10n.timerRunning,
                          value: '$_runningSessions',
                          icon: shad.LucideIcons.play,
                          color: const Color(0xFF8B5CF6),
                        ),
                      ],
                    ),
                  ),
                  if (_isRefreshing) ...[
                    const shad.Gap(12),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: LinearProgressIndicator(minHeight: 2),
                    ),
                  ],
                  const shad.Gap(16),
                  if (_sessions.isEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
                      child: Column(
                        children: [
                          Icon(
                            shad.LucideIcons.clock3,
                            size: 40,
                            color: theme.colorScheme.mutedForeground,
                          ),
                          const shad.Gap(12),
                          Text(
                            l10n.timerHistoryNoSessionsForPeriod,
                            style: theme.typography.textMuted,
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    )
                  else
                    ..._buildGroupedSessionSections(context),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _showSearchSheet() async {
    final appliedQuery = await showAdaptiveSheet<String>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => _WorkspaceSearchSheet(
        initialQuery: _searchCtrl.text.trim(),
      ),
    );
    if (appliedQuery == null || !mounted) {
      return;
    }

    final nextQuery = appliedQuery.trim();
    if (_searchCtrl.text.trim() == nextQuery) {
      return;
    }

    _searchCtrl.text = nextQuery;
    setState(() {});
    unawaited(_load(forceRefresh: true));
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final search = _searchCtrl.text.trim().isEmpty
        ? null
        : _searchCtrl.text.trim();
    final range = _currentRange();
    final cacheKey = _cacheKey(
      wsId,
      search,
      _period,
      range.start,
      range.end,
    );

    final cached = wsId.isEmpty
        ? null
        : await CacheStore.instance.read<Map<String, dynamic>>(
            key: cacheKey,
            decode: _decodeCacheJson,
          );

    if (cached != null && cached.hasValue && cached.data != null) {
      if (!mounted) {
        return;
      }
      setState(() {
        _sessions =
            ((cached.data!['sessions'] as List<dynamic>?) ?? const <dynamic>[])
                .whereType<Map<String, dynamic>>()
                .map(TimeTrackingSession.fromJson)
                .toList(growable: false);
        _loading = false;
        _isRefreshing = !cached.isFresh;
        _error = null;
      });
      if (!forceRefresh && cached.isFresh) {
        return;
      }
    } else {
      setState(() {
        _loading = true;
        _isRefreshing = false;
        _error = null;
      });
    }

    try {
      final sessions = await _repo.getManagementSessions(
        wsId,
        search: search,
        dateFrom: range.start,
        dateTo: range.end,
      );
      if (!mounted) return;
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: {
          'sessions': sessions
              .map((session) => session.toJson())
              .toList(growable: false),
        },
        tags: [
          _cacheTag,
          'workspace:$wsId',
          'module:timer',
          'period:${_period.name}',
        ],
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _sessions = sessions;
        _loading = false;
        _isRefreshing = false;
        _error = null;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = cached == null || !cached.hasValue;
        _isRefreshing = false;
      });
    }
  }

  DateTimeRange _currentRange() {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);

    switch (_period) {
      case _ManagementPeriod.day:
        return DateTimeRange(
          start: startOfToday,
          end: DateTime(now.year, now.month, now.day, 23, 59, 59, 999),
        );
      case _ManagementPeriod.week:
        final weekStart = startOfToday.subtract(
          Duration(days: startOfToday.weekday - DateTime.monday),
        );
        final weekEnd = DateTime(
          weekStart.year,
          weekStart.month,
          weekStart.day + 6,
          23,
          59,
          59,
          999,
        );
        return DateTimeRange(start: weekStart, end: weekEnd);
      case _ManagementPeriod.month:
        final monthStart = DateTime(now.year, now.month);
        final monthEnd = DateTime(now.year, now.month + 1, 0, 23, 59, 59, 999);
        return DateTimeRange(start: monthStart, end: monthEnd);
    }
  }

  String _periodLabel(AppLocalizations l10n, _ManagementPeriod period) {
    switch (period) {
      case _ManagementPeriod.day:
        return l10n.calendarDayView;
      case _ManagementPeriod.week:
        return l10n.calendarWeekView;
      case _ManagementPeriod.month:
        return l10n.calendarMonthView;
    }
  }

  String _rangeLabel() {
    final range = _currentRange();
    final sameYear = range.start.year == range.end.year;
    final startFormat = sameYear ? DateFormat.MMMd() : DateFormat.yMMMd();
    final endFormat = DateFormat.yMMMd();

    if (_period == _ManagementPeriod.day) {
      return endFormat.format(range.start);
    }

    return '${startFormat.format(range.start)}'
        ' - ${endFormat.format(range.end)}';
  }

  Duration get _totalTrackedDuration {
    return _sessions.fold<Duration>(
      Duration.zero,
      (sum, session) => sum + session.duration,
    );
  }

  int get _runningSessions =>
      _sessions.where((session) => session.isRunning).length;

  int _uniqueUsers() => _sessions
      .map((session) => session.userId)
      .whereType<String>()
      .where((value) => value.isNotEmpty)
      .toSet()
      .length;

  String _formatDuration(Duration duration) {
    final hours = duration.inHours;
    final minutes = duration.inMinutes % 60;
    final seconds = duration.inSeconds % 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    if (minutes > 0) {
      return '${minutes}m ${seconds}s';
    }
    return '${seconds}s';
  }

  List<Widget> _buildGroupedSessionSections(BuildContext context) {
    final theme = shad.Theme.of(context);
    final grouped = <DateTime, List<TimeTrackingSession>>{};
    for (final session in _sessions) {
      final start = session.startTime?.toLocal() ?? DateTime.now();
      final key = DateTime(start.year, start.month, start.day);
      grouped.putIfAbsent(key, () => <TimeTrackingSession>[]).add(session);
    }

    final sortedKeys = grouped.keys.toList(growable: false)
      ..sort((a, b) => b.compareTo(a));
    final widgets = <Widget>[];
    final headerFormat = DateFormat('EEEE, MMMM d, y');

    for (final key in sortedKeys) {
      final daySessions = grouped[key]!
        ..sort((a, b) {
          final aStart = a.startTime ?? DateTime.fromMillisecondsSinceEpoch(0);
          final bStart = b.startTime ?? DateTime.fromMillisecondsSinceEpoch(0);
          return bStart.compareTo(aStart);
        });

      widgets
        ..add(
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              headerFormat.format(key),
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        )
        ..add(
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              children: [
                for (var index = 0; index < daySessions.length; index++) ...[
                  _ManagementSessionTile(
                    session: daySessions[index],
                    durationLabel: _formatDuration(daySessions[index].duration),
                  ),
                  if (index < daySessions.length - 1) const shad.Gap(8),
                ],
              ],
            ),
          ),
        );
    }

    return widgets;
  }
}

class _ManagementPeriodSelector extends StatelessWidget {
  const _ManagementPeriodSelector({
    required this.period,
    required this.onChanged,
  });

  final _ManagementPeriod period;
  final ValueChanged<_ManagementPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final accent = theme.colorScheme.primary;

    Widget buildButton(_ManagementPeriod value, String label) {
      final selected = period == value;
      return Expanded(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onChanged(value),
            borderRadius: BorderRadius.circular(14),
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                color: selected
                    ? accent.withValues(alpha: 0.14)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? accent
                        : theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Row(
        children: [
          buildButton(_ManagementPeriod.day, l10n.calendarDayView),
          const shad.Gap(4),
          buildButton(_ManagementPeriod.week, l10n.calendarWeekView),
          const shad.Gap(4),
          buildButton(_ManagementPeriod.month, l10n.calendarMonthView),
        ],
      ),
    );
  }
}

class _RangeHeroCard extends StatelessWidget {
  const _RangeHeroCard({
    required this.title,
    required this.rangeLabel,
    required this.sessionCount,
    this.searchQuery,
  });

  final String title;
  final String rangeLabel;
  final int sessionCount;
  final String? searchQuery;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: theme.colorScheme.primary.withValues(alpha: 0.18),
        ),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.12),
            theme.colorScheme.card,
          ],
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              shad.LucideIcons.chartColumn,
              size: 20,
              color: theme.colorScheme.primary,
            ),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  rangeLabel,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '$sessionCount',
              style: theme.typography.xSmall.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (searchQuery != null && searchQuery!.isNotEmpty) ...[
            const shad.Gap(8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                searchQuery!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WorkspaceSearchSheet extends StatefulWidget {
  const _WorkspaceSearchSheet({required this.initialQuery});

  final String initialQuery;

  @override
  State<_WorkspaceSearchSheet> createState() => _WorkspaceSearchSheetState();
}

class _WorkspaceSearchSheetState extends State<_WorkspaceSearchSheet> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    Navigator.of(context).pop(_controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.timerSearchSessions,
                  style: theme.typography.h4.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              shad.IconButton.ghost(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(shad.LucideIcons.x, size: 18),
              ),
            ],
          ),
          const shad.Gap(12),
          shad.TextField(
            controller: _controller,
            autofocus: true,
            hintText: l10n.timerSearchSessions,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _submit(),
            features: [
              const shad.InputFeature.leading(
                Icon(shad.LucideIcons.search, size: 18),
              ),
              if (_controller.text.isNotEmpty)
                shad.InputFeature.trailing(
                  shad.IconButton.ghost(
                    onPressed: () {
                      _controller.clear();
                      setState(() {});
                    },
                    icon: const Icon(shad.LucideIcons.x, size: 16),
                  ),
                ),
            ],
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: () => Navigator.of(context).pop(''),
                  child: Text(l10n.commonClearSearch),
                ),
              ),
              const shad.Gap(8),
              Expanded(
                child: shad.PrimaryButton(
                  onPressed: _submit,
                  child: const Icon(shad.LucideIcons.search, size: 18),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final availableWidth = MediaQuery.sizeOf(context).width - 40;
    final width = (availableWidth - 8) / 2;

    return SizedBox(
      width: width > 0 ? width : 160,
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 18, color: color),
              ),
              const shad.Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const shad.Gap(2),
                    Text(
                      label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.xSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ManagementSessionTile extends StatelessWidget {
  const _ManagementSessionTile({
    required this.session,
    required this.durationLabel,
  });

  final TimeTrackingSession session;
  final String durationLabel;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final timeFormat = DateFormat.jm();
    final start = session.startTime?.toLocal();
    final end = session.endTime?.toLocal();
    final subtitle = start != null && end != null
        ? '${timeFormat.format(start)} - ${timeFormat.format(end)}'
        : start != null
        ? '${timeFormat.format(start)} - ${context.l10n.timerRunning}'
        : context.l10n.commonSomethingWentWrong;

    return shad.Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                session.isRunning
                    ? shad.LucideIcons.play
                    : shad.LucideIcons.clock3,
                size: 18,
                color: theme.colorScheme.primary,
              ),
            ),
            const shad.Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (session.title?.trim().isNotEmpty ?? false)
                        ? session.title!.trim()
                        : context.l10n.timerRunningSessionNoTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.small.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(4),
                  Text(
                    subtitle,
                    style: theme.typography.xSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                  if (session.categoryName?.trim().isNotEmpty ?? false) ...[
                    const shad.Gap(8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(
                          alpha: 0.10,
                        ),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        session.categoryName!.trim(),
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const shad.Gap(12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  durationLabel,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (session.isRunning) ...[
                  const shad.Gap(6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF8B5CF6).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      context.l10n.timerRunning,
                      style: theme.typography.xSmall.copyWith(
                        color: const Color(0xFF8B5CF6),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
