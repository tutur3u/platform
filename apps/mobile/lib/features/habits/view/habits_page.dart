import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_card.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_entry_sheet.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_form_sheet.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HabitsPage extends StatelessWidget {
  const HabitsPage({super.key, this.repository});

  final IHabitTrackerRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = HabitsCubit(
          repository: repository ?? HabitTrackerRepository(),
        );
        final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
        final wsId = workspace?.id;
        if (wsId != null && wsId.isNotEmpty) {
          unawaited(
            cubit.loadWorkspace(
              wsId,
              scopeOverride: workspace?.personal ?? false
                  ? HabitTrackerScope.self
                  : null,
            ),
          );
        }
        return cubit;
      },
      child: const _HabitsView(),
    );
  }
}

class _HabitsView extends StatefulWidget {
  const _HabitsView();

  @override
  State<_HabitsView> createState() => _HabitsViewState();
}

class _HabitsViewState extends State<_HabitsView> {
  late final TextEditingController _searchController;
  bool _isSearchVisible = false;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) {
        final workspace = state.currentWorkspace;
        final wsId = workspace?.id;
        if (wsId != null && wsId.isNotEmpty) {
          unawaited(
            context.read<HabitsCubit>().loadWorkspace(
              wsId,
              refresh: true,
              scopeOverride: workspace?.personal ?? false
                  ? HabitTrackerScope.self
                  : null,
            ),
          );
        }
      },
      child: shad.Scaffold(
        headers: [
          MobileSectionAppBar(
            title: context.l10n.habitsTitle,
            actions: [
              shad.IconButton.ghost(
                icon: Icon(
                  _isSearchVisible ? Icons.close_rounded : Icons.search_rounded,
                ),
                onPressed: _toggleSearch,
              ),
              shad.IconButton.ghost(
                icon: const Icon(Icons.add),
                onPressed: _openCreateTracker,
              ),
            ],
          ),
        ],
        child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
          builder: (context, workspaceState) {
            if (workspaceState.currentWorkspace == null) {
              return Center(child: Text(context.l10n.assistantSelectWorkspace));
            }

            return BlocBuilder<HabitsCubit, HabitsState>(
              builder: (context, state) {
                if (state.status == HabitsStatus.loading &&
                    state.trackers.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (state.status == HabitsStatus.error &&
                    state.trackers.isEmpty) {
                  return _ErrorView(error: state.error);
                }

                final filteredTrackers = state.filteredTrackers;
                final summary = buildHabitSummaryMetrics(
                  filteredTrackers,
                  state.selectedScope,
                );
                final isPersonalWorkspace =
                    workspaceState.currentWorkspace?.personal ?? false;

                return ResponsiveWrapper(
                  maxWidth: ResponsivePadding.maxContentWidth(
                    context.deviceClass,
                  ),
                  child: RefreshIndicator(
                    onRefresh: () async {
                      final wsId = context
                          .read<WorkspaceCubit>()
                          .state
                          .currentWorkspace
                          ?.id;
                      if (wsId != null && wsId.isNotEmpty) {
                        await context.read<HabitsCubit>().loadWorkspace(
                          wsId,
                          refresh: true,
                          scopeOverride: isPersonalWorkspace
                              ? HabitTrackerScope.self
                              : null,
                        );
                      }
                    },
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        ResponsivePadding.horizontal(context.deviceClass),
                        12,
                        ResponsivePadding.horizontal(context.deviceClass),
                        24 + MediaQuery.paddingOf(context).bottom,
                      ),
                      children: [
                        _SummaryHeader(summary: summary),
                        if (!isPersonalWorkspace) ...[
                          const SizedBox(height: 16),
                          SegmentedButton<HabitTrackerScope>(
                            segments: [
                              ButtonSegment(
                                value: HabitTrackerScope.self,
                                label: Text(context.l10n.habitsScopeSelf),
                              ),
                              ButtonSegment(
                                value: HabitTrackerScope.team,
                                label: Text(context.l10n.habitsScopeTeam),
                              ),
                              ButtonSegment(
                                value: HabitTrackerScope.member,
                                label: Text(context.l10n.habitsScopeMember),
                              ),
                            ],
                            selected: {state.selectedScope},
                            onSelectionChanged: (selection) {
                              final value = selection.firstOrNull;
                              if (value != null) {
                                unawaited(
                                  context.read<HabitsCubit>().setScope(value),
                                );
                              }
                            },
                          ),
                        ],
                        if (!isPersonalWorkspace &&
                            state.selectedScope ==
                                HabitTrackerScope.member) ...[
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            initialValue: state.selectedMemberId,
                            items: state.members
                                .map(
                                  (member) => DropdownMenuItem<String>(
                                    value: member.userId,
                                    child: Text(member.label),
                                  ),
                                )
                                .toList(growable: false),
                            onChanged: (value) {
                              unawaited(
                                context.read<HabitsCubit>().setSelectedMember(
                                  value,
                                ),
                              );
                            },
                            decoration: InputDecoration(
                              labelText: context.l10n.habitsMemberPickerLabel,
                            ),
                          ),
                        ],
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 180),
                          switchInCurve: Curves.easeOutCubic,
                          switchOutCurve: Curves.easeInCubic,
                          child: _isSearchVisible
                              ? Padding(
                                  key: const ValueKey('habits-search-visible'),
                                  padding: const EdgeInsets.only(top: 12),
                                  child: shad.TextField(
                                    controller: _searchController,
                                    hintText: context.l10n.habitsSearchHint,
                                    onChanged: (value) => context
                                        .read<HabitsCubit>()
                                        .setSearchQuery(value),
                                  ),
                                )
                              : const SizedBox(
                                  key: ValueKey('habits-search-hidden'),
                                  height: 12,
                                ),
                        ),
                        const SizedBox(height: 16),
                        if (filteredTrackers.isEmpty)
                          _EmptyView(onCreateTracker: _openCreateTracker)
                        else
                          ...filteredTrackers.map(
                            (tracker) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: HabitTrackerCard(
                                summary: tracker,
                                scope: state.selectedScope,
                                quickValue: state.quickDraftFor(
                                  tracker.tracker.id,
                                ),
                                selected:
                                    tracker.tracker.id ==
                                    state.selectedTrackerId,
                                onQuickValueChanged: (value) => context
                                    .read<HabitsCubit>()
                                    .setQuickLogDraft(
                                      tracker.tracker.id,
                                      value,
                                    ),
                                onQuickLog: () => _quickLogTracker(tracker),
                                onSelect: () =>
                                    _openTrackerDetail(tracker.tracker.id),
                                onEdit: () => _openEditTracker(tracker.tracker),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _quickLogTracker(HabitTrackerCardSummary tracker) async {
    final cubit = context.read<HabitsCubit>();
    final primaryField = primaryFieldForTracker(tracker.tracker);
    if (primaryField == null) {
      return;
    }
    Object? value;
    if (primaryField.type == HabitTrackerFieldType.boolean) {
      value = true;
    } else {
      final raw = cubit.state.quickDraftFor(tracker.tracker.id).trim();
      if (raw.isEmpty) {
        final toastContext = Navigator.of(context, rootNavigator: true).context;
        shad.showToast(
          context: toastContext,
          builder: (toastContext, overlay) => shad.Alert.destructive(
            content: Text(context.l10n.habitsQuickLogValueRequired),
          ),
        );
        return;
      }
      value = double.tryParse(raw);
      if (value == null) {
        final toastContext = Navigator.of(context, rootNavigator: true).context;
        shad.showToast(
          context: toastContext,
          builder: (toastContext, overlay) => shad.Alert.destructive(
            content: Text(context.l10n.habitsFormInvalidNumber),
          ),
        );
        return;
      }
    }

    await cubit.createEntry(
      tracker.tracker.id,
      HabitTrackerEntryInput(
        entryDate: DateTime.now().toIso8601String().slice(0, 10),
        values: {tracker.tracker.primaryMetricKey: value},
      ),
    );
  }

  void _toggleSearch() {
    setState(() {
      final nextVisible = !_isSearchVisible;
      _isSearchVisible = nextVisible;
      if (!nextVisible) {
        _searchController.clear();
        context.read<HabitsCubit>().setSearchQuery('');
      }
    });
  }

  Future<void> _openCreateTracker() async {
    await showAdaptiveSheet<void>(
      context: context,
      maxDialogWidth: 900,
      builder: (sheetContext) => HabitTrackerFormSheet(
        onSubmit: (input) => context.read<HabitsCubit>().createTracker(input),
      ),
    );
  }

  Future<void> _openEditTracker(HabitTracker tracker) async {
    await showAdaptiveSheet<void>(
      context: context,
      maxDialogWidth: 900,
      builder: (sheetContext) => HabitTrackerFormSheet(
        tracker: tracker,
        onSubmit: (input) =>
            context.read<HabitsCubit>().updateTracker(tracker.id, input),
      ),
    );
  }

  Future<void> _openTrackerDetail(String trackerId) async {
    final cubit = context.read<HabitsCubit>();
    final isPersonalWorkspace =
        context.read<WorkspaceCubit>().state.currentWorkspace?.personal ??
        false;
    await cubit.selectTracker(trackerId);

    if (!mounted) {
      return;
    }

    showAdaptiveDrawer(
      context: context,
      maxDialogWidth: 920,
      builder: (sheetContext) => BlocProvider.value(
        value: cubit,
        child: BlocBuilder<HabitsCubit, HabitsState>(
          builder: (context, state) {
            return HabitTrackerDetailSheet(
              detail: state.detail?.tracker.id == trackerId
                  ? state.detail
                  : null,
              detailStatus: state.detailStatus,
              detailError: state.detailError,
              isSubmittingEntry: state.isSubmittingEntry,
              isSubmittingStreakAction: state.isSubmittingStreakAction,
              isArchivingTracker: state.isArchivingTracker,
              showLeaderboard: !isPersonalWorkspace,
              onRetry: () => cubit.loadTrackerDetail(trackerId, refresh: true),
              onLogEntry: () async {
                final detail = state.detail;
                if (detail == null) {
                  return;
                }
                await showAdaptiveSheet<void>(
                  context: context,
                  maxDialogWidth: 760,
                  builder: (sheetContext) => HabitTrackerEntrySheet(
                    detail: detail,
                    onSubmit: (input) => cubit.createEntry(trackerId, input),
                  ),
                );
              },
              onEditTracker: () async {
                final tracker = state.detail?.tracker;
                if (tracker != null) {
                  await _openEditTracker(tracker);
                }
              },
              onDeleteEntry: (entryId) => cubit.deleteEntry(trackerId, entryId),
              onApplyStreakAction: (input) =>
                  cubit.createStreakAction(trackerId, input),
              onArchiveTracker: () => cubit.archiveTracker(trackerId),
            );
          },
        ),
      ),
    );
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.summary});

  final HabitTrackerSummaryMetrics summary;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gradient = isDark
        ? const [
            Color(0xFF182332),
            Color(0xFF171B29),
            Color(0xFF143130),
          ]
        : [
            const Color(0xFFFFF2DF),
            colorScheme.surface,
            const Color(0xFFE6F4FF),
          ];
    final titleColor = isDark ? colorScheme.onSurface : colorScheme.primary;
    final bodyColor = isDark
        ? colorScheme.onSurfaceVariant
        : colorScheme.onSurface.withValues(alpha: 0.76);
    final borderColor = isDark
        ? colorScheme.outline.withValues(alpha: 0.4)
        : colorScheme.outline.withValues(alpha: 0.18);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.habitsTitle,
            style:
                Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: titleColor,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            context.l10n.habitsSummarySubtitle,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: bodyColor),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _SummaryMetric(
                  label: context.l10n.habitsSummaryVolume,
                  value: formatCompactNumber(summary.currentVolume),
                  highlighted: isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryMetric(
                  label: context.l10n.habitsSummaryTargetsMet,
                  value: '${summary.metTarget}',
                  highlighted: isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryMetric(
                  label: context.l10n.habitsSummaryTopStreak,
                  value: '${summary.topStreak}',
                  highlighted: isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryMetric(
                  label: context.l10n.habitsSummaryTrackers,
                  value: '${summary.totalTrackers}',
                  highlighted: isDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    this.highlighted = false,
  });

  final String label;
  final String value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: highlighted
            ? colorScheme.surface.withValues(alpha: 0.24)
            : Colors.white.withValues(alpha: 0.82),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: highlighted
                  ? colorScheme.onSurfaceVariant
                  : colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style:
                Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: highlighted ? colorScheme.onSurface : null,
                ),
          ),
        ],
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onCreateTracker});

  final Future<void> Function() onCreateTracker;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        children: [
          const Icon(Icons.repeat_rounded, size: 44),
          const SizedBox(height: 12),
          Text(
            context.l10n.habitsEmptyTitle,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            context.l10n.habitsEmptyDescription,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          shad.PrimaryButton(
            onPressed: onCreateTracker,
            child: Text(context.l10n.habitsCreateTrackerAction),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48),
          const SizedBox(height: 12),
          Text(error ?? context.l10n.habitsLoadError),
        ],
      ),
    );
  }
}

extension on String {
  String slice(int start, [int? end]) => substring(start, end);
}
