import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/edit_session_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/history_period_controls.dart';
import 'package:mobile/features/time_tracker/widgets/history_stats_accordion.dart';
import 'package:mobile/features/time_tracker/widgets/session_detail_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/session_tile.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key});

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (!mounted || !context.mounted) return;
    if (!_scrollController.hasClients) return;
    final threshold = _scrollController.position.maxScrollExtent - 220;
    if (_scrollController.position.pixels < threshold) return;

    final firstDayOfWeek = _firstDayOfWeek(context);
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = _currentUserId();
    unawaited(
      context.read<TimeTrackerCubit>().loadHistoryMore(
        wsId,
        userId,
        firstDayOfWeek: firstDayOfWeek,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final l10n = context.l10n;
        final sessions = state.historySessions;
        final theme = shad.Theme.of(context);
        final cubit = context.read<TimeTrackerCubit>();
        final wsId =
            context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
        final anchorDate = state.historyAnchorDate ?? DateTime.now();
        final categoryColorById = {
          for (final category in state.categories) category.id: category.color,
        };

        final grouped = _groupByDay(sessions, l10n);
        final firstDayOfWeek = _firstDayOfWeek(context);

        return RefreshIndicator(
          onRefresh: () async {
            await cubit.refreshHistory(
              wsId,
              _currentUserId(),
              firstDayOfWeek: firstDayOfWeek,
            );
          },
          child: CustomScrollView(
            controller: _scrollController,
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: HistoryPeriodControls(
                    viewMode: state.historyViewMode,
                    anchorDate: anchorDate,
                    onViewModeChanged: (mode) {
                      unawaited(
                        cubit.setHistoryViewMode(
                          wsId,
                          _currentUserId(),
                          mode,
                          firstDayOfWeek: firstDayOfWeek,
                        ),
                      );
                    },
                    onPrevious: () {
                      unawaited(
                        cubit.goToPreviousPeriod(
                          wsId,
                          _currentUserId(),
                          firstDayOfWeek: firstDayOfWeek,
                        ),
                      );
                    },
                    onNext: () {
                      unawaited(
                        cubit.goToNextPeriod(
                          wsId,
                          _currentUserId(),
                          firstDayOfWeek: firstDayOfWeek,
                        ),
                      );
                    },
                    onGoToCurrent: () {
                      unawaited(
                        cubit.goToCurrentPeriod(
                          wsId,
                          _currentUserId(),
                          firstDayOfWeek: firstDayOfWeek,
                        ),
                      );
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: HistoryStatsAccordion(
                    isOpen: state.isHistoryStatsAccordionOpen,
                    onToggle: () {
                      unawaited(cubit.toggleHistoryStatsAccordion());
                    },
                    stats: state.historyPeriodStats,
                    isLoading: state.isHistoryLoading,
                  ),
                ),
              ),
              if (state.isHistoryLoading && sessions.isEmpty)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 24, 16, 16),
                    child: Center(child: NovaLoadingIndicator()),
                  ),
                )
              else ...[
                if (state.isHistoryLoading)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: LinearProgressIndicator(minHeight: 2),
                    ),
                  ),
                if (sessions.isEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
                      child: Column(
                        children: [
                          Icon(
                            Icons.history,
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
                    ),
                  ),
                for (final entry in grouped) ...[
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                      child: Text(
                        entry.label,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  SliverList.builder(
                    itemCount: entry.sessions.length,
                    itemBuilder: (context, index) {
                      final session = entry.sessions[index];
                      return SessionTile(
                        session: session,
                        categoryColor: categoryColorById[session.categoryId],
                        onTap: () => _showDetailSheet(context, session),
                        onEdit: () => _showEditDialog(context, session),
                        onDelete: () => _deleteSession(context, session.id),
                      );
                    },
                  ),
                ],
                if (state.isHistoryLoadingMore)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(child: NovaLoadingIndicator()),
                    ),
                  ),
                if (state.historyHasMore && !state.isHistoryLoadingMore)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: shad.OutlineButton(
                        onPressed: () {
                          unawaited(
                            cubit.loadHistoryMore(
                              wsId,
                              _currentUserId(),
                              firstDayOfWeek: firstDayOfWeek,
                            ),
                          );
                        },
                        child: Text(l10n.timerHistoryLoadMore),
                      ),
                    ),
                  ),
                if (!state.historyHasMore && sessions.length > 10)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Text(
                        l10n.timerHistoryEndOfList,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
              const SliverToBoxAdapter(
                child: SizedBox(height: 96),
              ),
            ],
          ),
        );
      },
    );
  }

  List<_DayGroup> _groupByDay(
    List<TimeTrackingSession> sessions,
    AppLocalizations l10n,
  ) {
    final dateFmt = DateFormat.yMMMEd();
    final groups = <String, List<TimeTrackingSession>>{};

    for (final session in sessions) {
      final startTime = session.startTime;
      if (startTime == null) {
        groups.putIfAbsent('unknown', () => []).add(session);
        continue;
      }

      final date = startTime.toLocal();
      final key = '${date.year}-${date.month}-${date.day}';
      groups.putIfAbsent(key, () => []).add(session);
    }

    return groups.entries.map((entry) {
      if (entry.key == 'unknown') {
        return _DayGroup(
          label: l10n.timerUnknownDate,
          sessions: entry.value,
        );
      }

      final firstSession = entry.value.first;
      final firstStartTime = firstSession.startTime;
      final label = firstStartTime == null
          ? l10n.timerUnknownDate
          : dateFmt.format(firstStartTime.toLocal());
      return _DayGroup(
        label: label,
        sessions: entry.value,
      );
    }).toList();
  }

  void _showDetailSheet(BuildContext context, TimeTrackingSession session) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    unawaited(
      showAdaptiveSheet<void>(
        context: context,
        builder: (_) => SessionDetailSheet(
          session: session,
          categories: cubit.state.categories,
          thresholdDays: cubit.state.thresholdDays,
          onDelete: () => _deleteSession(
            context,
            session.id,
            throwOnError: true,
          ),
          onSave:
              ({
                title,
                description,
                categoryId,
                startTime,
                endTime,
              }) async {
                await cubit.editSession(
                  session.id,
                  wsId,
                  userId: supabase.auth.currentUser?.id,
                  title: title,
                  description: description,
                  categoryId: categoryId,
                  startTime: startTime,
                  endTime: endTime,
                  throwOnError: true,
                );
              },
        ),
      ),
    );
  }

  void _showEditDialog(BuildContext context, TimeTrackingSession session) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    unawaited(
      showAdaptiveSheet<void>(
        context: context,
        builder: (_) => EditSessionDialog(
          session: session,
          categories: cubit.state.categories,
          thresholdDays: cubit.state.thresholdDays,
          onSave:
              ({
                title,
                description,
                categoryId,
                startTime,
                endTime,
              }) async {
                await cubit.editSession(
                  session.id,
                  wsId,
                  userId: supabase.auth.currentUser?.id,
                  title: title,
                  description: description,
                  categoryId: categoryId,
                  startTime: startTime,
                  endTime: endTime,
                  throwOnError: true,
                );
              },
        ),
      ),
    );
  }

  Future<void> _deleteSession(
    BuildContext context,
    String sessionId, {
    bool throwOnError = false,
  }) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = _currentUserId();
    return cubit.deleteSession(
      sessionId,
      wsId,
      userId,
      throwOnError: throwOnError,
    );
  }

  String _currentUserId() {
    return supabase.auth.currentUser?.id ?? '';
  }

  int _firstDayOfWeek(BuildContext context) {
    const weekdayByIndex = [
      DateTime.sunday,
      DateTime.monday,
      DateTime.tuesday,
      DateTime.wednesday,
      DateTime.thursday,
      DateTime.friday,
      DateTime.saturday,
    ];
    final firstDayOfWeekIndex = MaterialLocalizations.of(
      context,
    ).firstDayOfWeekIndex;
    return weekdayByIndex[firstDayOfWeekIndex % 7];
  }
}

class _DayGroup {
  const _DayGroup({required this.label, required this.sessions});
  final String label;
  final List<TimeTrackingSession> sessions;
}
