import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_days.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ProfileTimelineSection extends StatefulWidget {
  const ProfileTimelineSection({
    required this.replayToken,
    this.repository,
    super.key,
  });

  final int replayToken;
  final ProfileTimelineRepository? repository;

  @override
  State<ProfileTimelineSection> createState() => _ProfileTimelineSectionState();
}

class _ProfileTimelineSectionState extends State<ProfileTimelineSection> {
  late final ProfileTimelineRepository _repository =
      widget.repository ?? ProfileTimelineRepository();
  List<ProfileTimelineItem>? _items;
  String? _scope;
  int _request = 0;
  bool _failed = false;
  bool _partial = false;
  bool _limited = false;
  bool _refreshing = false;

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
    _limited = false;
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
    setState(() => _refreshing = true);
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
          _limited = fresh.limited;
          _failed = false;
        });
      }
    } on Exception {
      if (mounted && request == _request) setState(() => _failed = true);
    } finally {
      if (mounted && request == _request) setState(() => _refreshing = false);
    }
  }

  void _retry() {
    final userId = context.read<AuthCubit>().state.user?.id;
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (userId == null || workspaceId == null || _refreshing) return;
    setState(() => _failed = false);
    unawaited(_load(workspaceId, userId));
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
    final theme = shad.Theme.of(context);
    return SettingsPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.profileTimelineDescription,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(16),
          if (items == null && !_failed)
            Semantics(
              label: l10n.profileLoading,
              liveRegion: true,
              child: const FinanceSkeletonBlock(height: 112, radius: 20),
            )
          else if (items?.isEmpty == true && !_partial)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  Icon(
                    Icons.history_rounded,
                    size: 32,
                    color: theme.colorScheme.mutedForeground,
                  ),
                  const shad.Gap(12),
                  Text(l10n.profileTimelineEmpty, textAlign: TextAlign.center),
                ],
              ),
            )
          else if (items != null)
            ProfileTimelineDays(items: items, onOpen: _open),
          if (_limited) ...[
            const shad.Gap(12),
            Text(
              l10n.profileTimelineLimited,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          if (_failed || _partial) ...[
            const shad.Gap(12),
            Semantics(
              liveRegion: true,
              child: Text(
                _partial
                    ? l10n.profileTimelinePartial
                    : l10n.profileTimelineUnavailable,
              ),
            ),
            const shad.Gap(8),
            shad.OutlineButton(
              onPressed: _refreshing ? null : _retry,
              leading: const Icon(Icons.refresh_rounded, size: 18),
              child: Text(l10n.commonRetry),
            ),
          ],
        ],
      ),
    );
  }
}
