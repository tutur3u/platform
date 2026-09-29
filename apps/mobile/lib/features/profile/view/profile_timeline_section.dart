import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class ProfileTimelineSection extends StatefulWidget {
  const ProfileTimelineSection({required this.replayToken, super.key});

  final int replayToken;

  @override
  State<ProfileTimelineSection> createState() => _ProfileTimelineSectionState();
}

class _ProfileTimelineSectionState extends State<ProfileTimelineSection> {
  final _repository = ProfileTimelineRepository();
  List<ProfileTimelineItem>? _items;
  String? _scope;
  int _request = 0;
  bool _failed = false;
  bool _partial = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspaceId = context
        .watch<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final scope = userId == null || workspaceId == null
        ? null
        : '$userId:$workspaceId';
    if (scope == _scope) return;
    _scope = scope;
    _items = null;
    _failed = false;
    _partial = false;
    _request++;
    if (userId != null && workspaceId != null) {
      unawaited(_load(workspaceId, userId));
    }
  }

  @override
  void didUpdateWidget(covariant ProfileTimelineSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken == oldWidget.replayToken) return;
    final userId = context.read<AuthCubit>().state.user?.id;
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (userId != null && workspaceId != null) {
      unawaited(_load(workspaceId, userId));
    }
  }

  Future<void> _load(String workspaceId, String userId) async {
    final request = ++_request;
    try {
      List<ProfileTimelineItem>? cached;
      try {
        cached = await _repository.cached(workspaceId, userId);
      } on Object {
        // A stale or unreadable local snapshot must not block revalidation.
      }
      if (mounted && request == _request && cached != null) {
        setState(() => _items = cached);
      }
      final fresh = await _repository.refresh(workspaceId, userId);
      if (mounted && request == _request) {
        setState(() {
          _items = fresh.items;
          _partial = fresh.partial;
          _failed = false;
        });
      }
    } on Exception {
      if (mounted && request == _request) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _request++;
    _repository.dispose();
    super.dispose();
  }

  void _open(ProfileTimelineItem item) {
    final path = switch (item.type) {
      'task' =>
        item.boardId == null
            ? Routes.taskBoards
            : Routes.taskBoardTaskDetailPath(item.boardId!, item.id),
      'transaction' => Uri(
        path: Routes.transactions,
        queryParameters: {'transactionId': item.id},
      ).toString(),
      'note' => Routes.noteDetailPath(item.id),
      'calendar' => Routes.calendarEventDetailPath(item.id),
      _ => Routes.profileRoot,
    };
    unawaited(context.push<void>(path));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (_scope == null) return const SizedBox.shrink();
    final items = _items;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 18),
        Text(
          l10n.profileTimelineTitle,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        if (items == null && !_failed)
          const FinanceSkeletonBlock(height: 112, radius: 20)
        else if (items == null)
          TextButton.icon(
            onPressed: () {
              final userId = context.read<AuthCubit>().state.user?.id;
              final workspaceId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              if (userId != null && workspaceId != null) {
                setState(() => _failed = false);
                unawaited(_load(workspaceId, userId));
              }
            },
            icon: const Icon(Icons.refresh_rounded),
            label: Text(l10n.commonRetry),
          )
        else if (items.isEmpty && !_partial)
          Text(l10n.profileTimelineEmpty)
        else
          ..._buildDays(context, items),
        if (_partial)
          TextButton.icon(
            onPressed: () {
              final userId = context.read<AuthCubit>().state.user?.id;
              final workspaceId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              if (userId != null && workspaceId != null) {
                unawaited(_load(workspaceId, userId));
              }
            },
            icon: const Icon(Icons.refresh_rounded),
            label: Text(l10n.profileTimelinePartial),
          ),
      ],
    );
  }

  List<Widget> _buildDays(
    BuildContext context,
    List<ProfileTimelineItem> items,
  ) {
    final groups = <DateTime, List<ProfileTimelineItem>>{};
    for (final item in items) {
      final date = item.createdAt;
      final day = DateTime(date.year, date.month, date.day);
      groups.putIfAbsent(day, () => []).add(item);
    }
    final days = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return [
      for (final day in days)
        Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ExpansionTile(
            initiallyExpanded: day == today,
            title: Text(
              day == today
                  ? context.l10n.profileTimelineToday
                  : day == today.subtract(const Duration(days: 1))
                  ? context.l10n.profileTimelineYesterday
                  : DateFormat.yMMMd(
                      Localizations.localeOf(context).toString(),
                    ).format(day),
            ),
            subtitle: Text(_summary(context, groups[day]!)),
            children: [
              for (final item in groups[day]!)
                ListTile(
                  dense: true,
                  leading: Icon(_icon(item.type)),
                  title: Text(
                    item.title?.isNotEmpty == true
                        ? item.title!
                        : _typeLabel(context, item.type),
                  ),
                  subtitle: Text(
                    DateFormat.jm(
                      Localizations.localeOf(context).toString(),
                    ).format(item.createdAt),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _open(item),
                ),
            ],
          ),
        ),
    ];
  }

  String _summary(BuildContext context, List<ProfileTimelineItem> items) {
    final counts = <String, int>{};
    for (final item in items) {
      counts.update(item.type, (count) => count + 1, ifAbsent: () => 1);
    }
    final l10n = context.l10n;
    return [
      if (counts['task'] case final count?) l10n.profileTimelineTasks(count),
      if (counts['transaction'] case final count?)
        l10n.profileTimelineTransactions(count),
      if (counts['note'] case final count?) l10n.profileTimelineNotes(count),
      if (counts['calendar'] case final count?)
        l10n.profileTimelineWorkspaceEvents(count),
    ].join(' · ');
  }

  String _typeLabel(BuildContext context, String type) => switch (type) {
    'task' => context.l10n.taskBoardsTasksCount(1),
    'transaction' => context.l10n.financeActivityLabel,
    'note' => context.l10n.notesTitle,
    'calendar' => context.l10n.calendarTitle,
    _ => context.l10n.profileTimelineTitle,
  };

  IconData _icon(String type) => switch (type) {
    'task' => Icons.task_alt_rounded,
    'transaction' => Icons.account_balance_wallet_outlined,
    'note' => Icons.edit_note_rounded,
    'calendar' => Icons.event_rounded,
    _ => Icons.history_rounded,
  };
}
