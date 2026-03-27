import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/habit_tracker_presentation.dart';
import 'package:mobile/features/habits/view/habits_activity_section.dart';
import 'package:mobile/features/habits/view/habits_overview_section.dart';
import 'package:mobile/features/habits/view/habits_page_chrome.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_entry_sheet.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_form_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum HabitsSection { overview, activity }

class HabitsPage extends StatelessWidget {
  const HabitsPage({
    super.key,
    this.repository,
    this.initialSection = HabitsSection.overview,
  });

  final IHabitTrackerRepository? repository;
  final HabitsSection initialSection;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
        final wsId = workspace?.id;
        final cubit = HabitsCubit(
          repository: repository ?? HabitTrackerRepository(),
          initialState: wsId != null && wsId.isNotEmpty
              ? HabitsCubit.seedStateForWorkspace(
                  wsId,
                  initialScope: workspace?.personal ?? false
                      ? HabitTrackerScope.self
                      : HabitTrackerScope.self,
                )
              : null,
        );
        if (wsId != null && wsId.isNotEmpty) {
          unawaited(
            _loadWorkspaceForSection(
              cubit,
              wsId,
              initialSection,
              scopeOverride: workspace?.personal ?? false
                  ? HabitTrackerScope.self
                  : null,
            ),
          );
        }
        return cubit;
      },
      child: _HabitsView(initialSection: initialSection),
    );
  }
}

class _HabitsView extends StatefulWidget {
  const _HabitsView({required this.initialSection});

  final HabitsSection initialSection;

  @override
  State<_HabitsView> createState() => _HabitsViewState();
}

class _HabitsViewState extends State<_HabitsView> {
  late final TextEditingController _searchController;
  var _isSearchVisible = false;

  bool get _supportsSearch => widget.initialSection == HabitsSection.overview;

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
            _loadWorkspaceForSection(
              context.read<HabitsCubit>(),
              wsId,
              widget.initialSection,
              refresh: true,
              scopeOverride: workspace?.personal ?? false
                  ? HabitTrackerScope.self
                  : null,
            ),
          );
        }
      },
      child: shad.Scaffold(
        child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
          builder: (context, workspaceState) {
            final workspace = workspaceState.currentWorkspace;
            if (workspace == null) {
              return Center(child: Text(context.l10n.assistantSelectWorkspace));
            }
            final isActivitySection =
                widget.initialSection == HabitsSection.activity;
            final shellOwnerId = isActivitySection
                ? 'habits-activity'
                : 'habits-overview';
            final shellLocation = isActivitySection
                ? Routes.habitsActivity
                : Routes.habits;

            final shellActionRegistration =
                BlocBuilder<HabitsCubit, HabitsState>(
                  builder: (context, state) {
                    final shellActions = <ShellActionSpec>[
                      if (_supportsSearch)
                        ShellActionSpec(
                          id: 'habits-search',
                          icon: _isSearchVisible
                              ? Icons.close_rounded
                              : Icons.search_rounded,
                          tooltip: _isSearchVisible
                              ? context.l10n.financeActivityClearSearch
                              : context.l10n.habitsSearchHint,
                          highlighted:
                              _isSearchVisible || state.searchQuery.isNotEmpty,
                          onPressed: _toggleSearch,
                        ),
                      ShellActionSpec(
                        id: 'habits-create',
                        icon: Icons.add,
                        tooltip: context.l10n.habitsCreateTrackerAction,
                        onPressed: () => unawaited(_openCreateTracker()),
                      ),
                    ];

                    return ShellChromeActions(
                      ownerId: shellOwnerId,
                      locations: {shellLocation},
                      actions: shellActions,
                    );
                  },
                );

            return Stack(
              children: [
                shellActionRegistration,
                Positioned.fill(
                  child: BlocBuilder<HabitsCubit, HabitsState>(
                    builder: (context, state) {
                      if (state.status == HabitsStatus.loading &&
                          state.trackers.isEmpty) {
                        return const Center(child: CircularProgressIndicator());
                      }
                      if (state.status == HabitsStatus.error &&
                          state.trackers.isEmpty) {
                        return HabitsErrorView(error: state.error);
                      }

                      final visibleTrackers =
                          widget.initialSection == HabitsSection.overview
                          ? state.filteredTrackers
                          : state.trackers;
                      final summary = buildHabitSummaryMetrics(
                        visibleTrackers,
                        state.selectedScope,
                      );
                      final isPersonalWorkspace = workspace.personal;

                      return ResponsiveWrapper(
                        maxWidth: ResponsivePadding.maxContentWidth(
                          context.deviceClass,
                        ),
                        child: RefreshIndicator(
                          onRefresh: _refreshCurrentSection,
                          child: ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: EdgeInsets.fromLTRB(
                              ResponsivePadding.horizontal(
                                context.deviceClass,
                              ),
                              12,
                              ResponsivePadding.horizontal(
                                context.deviceClass,
                              ),
                              24 + MediaQuery.paddingOf(context).bottom,
                            ),
                            children: [
                              HabitsSummaryHeader(
                                summary: summary,
                                title:
                                    widget.initialSection ==
                                        HabitsSection.activity
                                    ? context.l10n.habitsActivityTitle
                                    : context.l10n.habitsTitle,
                                subtitle:
                                    widget.initialSection ==
                                        HabitsSection.activity
                                    ? context.l10n.habitsActivitySubtitle
                                    : context.l10n.habitsSummarySubtitle,
                                leadingIcon:
                                    widget.initialSection ==
                                        HabitsSection.activity
                                    ? null
                                    : Icons.auto_graph_rounded,
                              ),
                              if (!isPersonalWorkspace) ...[
                                const SizedBox(height: 16),
                                HabitsScopeControls(
                                  selectedScope: state.selectedScope,
                                  onScopeSelected: (scope) async {
                                    final cubit = context.read<HabitsCubit>();
                                    await cubit.setScope(scope);
                                    if (!context.mounted) {
                                      return;
                                    }
                                    if (widget.initialSection ==
                                        HabitsSection.activity) {
                                      await cubit.loadActivity();
                                    }
                                  },
                                ),
                              ],
                              if (!isPersonalWorkspace &&
                                  state.selectedScope ==
                                      HabitTrackerScope.member) ...[
                                const SizedBox(height: 12),
                                HabitsMemberPicker(
                                  members: state.members,
                                  selectedMemberId: state.selectedMemberId,
                                  onChanged: (value) async {
                                    final cubit = context.read<HabitsCubit>();
                                    await cubit.setSelectedMember(value);
                                    if (!context.mounted) {
                                      return;
                                    }
                                    if (widget.initialSection ==
                                        HabitsSection.activity) {
                                      await cubit.loadActivity();
                                    }
                                  },
                                ),
                              ],
                              if (_supportsSearch) ...[
                                const SizedBox(height: 12),
                                HabitsSearchField(
                                  controller: _searchController,
                                  isVisible: _isSearchVisible,
                                  onChanged: (value) => context
                                      .read<HabitsCubit>()
                                      .setSearchQuery(value),
                                ),
                              ] else
                                const SizedBox(height: 16),
                              const SizedBox(height: 16),
                              if (widget.initialSection ==
                                  HabitsSection.activity)
                                HabitsActivitySection(
                                  state: state,
                                  onOpenTracker: _openTrackerDetail,
                                )
                              else
                                HabitsOverviewSection(
                                  filteredTrackers: state.filteredTrackers,
                                  state: state,
                                  onCreateTracker: _openCreateTracker,
                                  onEditTracker: _openEditTracker,
                                  onOpenTracker: _openTrackerDetail,
                                  onQuickLog: _quickLogTracker,
                                  onQuickValueChanged: (trackerId, value) =>
                                      context
                                          .read<HabitsCubit>()
                                          .setQuickLogDraft(trackerId, value),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _refreshCurrentSection() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    await _loadWorkspaceForSection(
      context.read<HabitsCubit>(),
      wsId,
      widget.initialSection,
      refresh: true,
      scopeOverride: workspace?.personal ?? false
          ? HabitTrackerScope.self
          : null,
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

    unawaited(
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
                onRetry: () =>
                    cubit.loadTrackerDetail(trackerId, refresh: true),
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
                onDeleteEntry: (entryId) =>
                    cubit.deleteEntry(trackerId, entryId),
                onApplyStreakAction: (input) =>
                    cubit.createStreakAction(trackerId, input),
                onArchiveTracker: () => cubit.archiveTracker(trackerId),
              );
            },
          ),
        ),
      ),
    );
  }
}

Future<void> _loadWorkspaceForSection(
  HabitsCubit cubit,
  String wsId,
  HabitsSection section, {
  bool refresh = false,
  HabitTrackerScope? scopeOverride,
}) async {
  await cubit.loadWorkspace(
    wsId,
    refresh: refresh,
    scopeOverride: scopeOverride,
  );
  if (section == HabitsSection.activity) {
    await cubit.loadActivity(refresh: refresh);
  }
}

extension on String {
  String slice(int start, [int? end]) => substring(start, end);
}
