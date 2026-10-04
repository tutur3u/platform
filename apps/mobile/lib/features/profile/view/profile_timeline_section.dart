import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mobile/features/profile/view/profile_timeline_browser.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ProfileTimelineSection extends StatefulWidget {
  const ProfileTimelineSection({
    required this.replayToken,
    this.repository,
    this.cacheUserId,
    this.contentTopPadding = 0,
    this.fullSurface = false,
    this.datesOpen,
    this.onDatesChanged,
    super.key,
  });

  final int replayToken;
  final String? Function()? cacheUserId;
  final bool fullSurface;
  final double contentTopPadding;
  final bool? datesOpen;
  final ValueChanged<bool>? onDatesChanged;
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
  bool _failureReported = false;
  bool _loadingMore = false;
  bool _pagingPaused = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit>().state.user?.id;
    final workspaceId = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.watch<WorkspaceCubit>(),
    )?.id;
    final scope = userId == null || workspaceId == null
        ? null
        : '$userId:$workspaceId';
    if (scope == _scope) return;
    _scope = scope;
    _items = null;
    _failed = false;
    _partial = false;
    _limited = false;
    _refreshing = false;
    _request++;
    _failureReported = false;
    _loadingMore = false;
    _pagingPaused = false;
    if (userId != null && workspaceId != null) {
      unawaited(_load(workspaceId, userId));
    }
  }

  @override
  void didUpdateWidget(covariant ProfileTimelineSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.replayToken == oldWidget.replayToken) return;
    final userId = context.read<AuthCubit>().state.user?.id;
    final workspaceId = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.read<WorkspaceCubit>(),
    )?.id;
    if (userId != null && workspaceId != null) {
      unawaited(_load(workspaceId, userId));
    }
  }

  Future<void> _load(String workspaceId, String userId) async {
    if (_refreshing) return;
    final request = ++_request;
    setState(() {
      _refreshing = true;
      _loadingMore = false;
      _pagingPaused = false;
    });
    try {
      ProfileTimelineSnapshot? cached;
      try {
        cached = await _repository.cached(workspaceId, userId);
      } on Object {
        // A stale or unreadable local snapshot must not block revalidation.
      }
      if (mounted && request == _request && cached != null) {
        setState(() {
          _items = cached!.items;
          _partial = cached.partial;
          _limited = cached.limited;
        });
      }
      if (!mounted || request != _request) return;
      final fresh = await _repository.refresh(workspaceId, userId);
      if (mounted && request == _request) {
        setState(() {
          _items = fresh.partial
              ? {
                  for (final item in [...?_items, ...fresh.items])
                    '${item.type}:${item.id}': item,
                }.values.toList()
              : fresh.items;
          _partial = fresh.partial;
          _limited = fresh.limited;
          _failed = false;
        });
        if (fresh.partial) {
          _reportFailure(request);
        } else {
          _failureReported = false;
        }
      }
    } on Exception {
      if (mounted && request == _request) {
        setState(() => _failed = true);
        _reportFailure(request);
      }
    } finally {
      if (mounted && request == _request) setState(() => _refreshing = false);
    }
  }

  Future<void> _loadMore() async {
    if (_refreshing || _loadingMore || _pagingPaused) return;
    final userId = context.read<AuthCubit>().state.user?.id;
    final ws = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: context.read<WorkspaceCubit>(),
    )?.id;
    if (userId == null || ws == null || _scope != '$userId:$ws') return;
    final page = _repository.nextPage(ws, userId);
    if (page == null) return;
    final request = _request;
    setState(() => _loadingMore = true);
    try {
      final fresh = await _repository.loadMore(ws, userId, page);
      if (!mounted || request != _request) return;
      setState(() {
        _items = {
          for (final item in [...?_items, ...fresh.items])
            '${item.type}:${item.id}': item,
        }.values.toList();
        _limited = fresh.limited;
      });
    } on Exception {
      if (mounted && request == _request) {
        setState(() => _pagingPaused = true);
        _reportFailure(request);
      }
    } finally {
      if (mounted && request == _request) setState(() => _loadingMore = false);
    }
  }

  void _reportFailure(int request) {
    if (_failureReported) return;
    _failureReported = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || request != _request) return;
      shad.showToast(
        context: context,
        builder: (context, _) =>
            shad.Alert(content: Text(context.l10n.profileTimelinePartial)),
      );
    });
  }

  @override
  void dispose() {
    _request++;
    _repository.dispose();
    super.dispose();
  }

  void _open(ProfileTimelineItem item) => unawaited(_openPersonal(item));

  Future<void> _openPersonal(ProfileTimelineItem item) async {
    final userId = context.read<AuthCubit>().state.user?.id;
    final workspaces = context.read<WorkspaceCubit>();
    final workspace = verifiedPersonalProfileWorkspace(
      userId: userId,
      cacheUserId: (widget.cacheUserId ?? currentPersonalProfileUserId)(),
      workspaces: workspaces,
    );
    if (workspace == null || _scope != '$userId:${workspace.id}') return;
    if (workspaces.state.currentWorkspace?.id != workspace.id) {
      await workspaces.selectWorkspace(workspace);
    }
    if (!mounted ||
        _scope != '$userId:${workspace.id}' ||
        context.read<AuthCubit>().state.user?.id != userId ||
        (widget.cacheUserId ?? currentPersonalProfileUserId)() != userId ||
        verifiedPersonalProfileWorkspace(
              userId: userId,
              cacheUserId:
                  (widget.cacheUserId ?? currentPersonalProfileUserId)(),
              workspaces: workspaces,
            )?.id !=
            workspace.id) {
      return;
    }
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
    if (_scope == null) {
      return Padding(
        padding: EdgeInsets.only(top: widget.contentTopPadding),
        child: Text(l10n.profileTimelineUnavailable),
      );
    }
    final items = _items;
    final browser = _browser(items);
    return widget.fullSurface ? SizedBox.expand(child: browser) : browser;
  }

  Widget _browser(List<ProfileTimelineItem>? items, {Widget? status}) =>
      ProfileTimelineBrowser(
        key: ValueKey(_scope),
        fullSurface: widget.fullSurface,
        contentTopPadding: widget.contentTopPadding,
        status: status,
        datesOpen: widget.datesOpen,
        onDatesChanged: widget.onDatesChanged,
        items: items ?? const [],
        loading: items == null && !_failed,
        refreshing: _refreshing,
        loadingMore: _loadingMore,
        onLoadMore: _pagingPaused || _partial
            ? null
            : () => unawaited(_loadMore()),
        statusReportedByParent: _failed || _partial || _limited,
        availability: _failed || items == null
            ? ProfileTimelineAvailability.unavailable
            : _partial || _limited
            ? ProfileTimelineAvailability.partial
            : ProfileTimelineAvailability.complete,
        onOpen: _open,
      );
}
