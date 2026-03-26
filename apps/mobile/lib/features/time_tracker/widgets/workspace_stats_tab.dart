import 'dart:async';

import 'package:flutter/material.dart' hide Card, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
  List<TimeTrackingSession> _sessions = [];
  bool _loading = true;
  bool _isRefreshing = false;
  String? _error;

  static CacheKey _cacheKey(String wsId, String? search) {
    return CacheKey(
      namespace: 'time_tracker.management_sessions',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'search': search ?? ''},
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

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, _) => unawaited(_load()),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: shad.TextField(
              controller: _searchCtrl,
              hintText: l10n.timerSearchSessions,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => unawaited(_load()),
              features: [
                const shad.InputFeature.leading(
                  Icon(shad.LucideIcons.search, size: 20),
                ),
                if (_searchCtrl.text.isNotEmpty)
                  shad.InputFeature.trailing(
                    shad.IconButton.ghost(
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() {});
                        unawaited(_load());
                      },
                      icon: const Icon(shad.LucideIcons.x, size: 16),
                    ),
                  ),
              ],
            ),
          ),
          const shad.Gap(12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _OverviewCard(
                  label: l10n.timerTotalSessions,
                  value: '${_sessions.length}',
                  icon: shad.LucideIcons.timer,
                ),
                const shad.Gap(8),
                _OverviewCard(
                  label: l10n.timerActiveUsers,
                  value: '${_uniqueUsers()}',
                  icon: shad.LucideIcons.users,
                ),
              ],
            ),
          ),
          const shad.Gap(8),
          if (_isRefreshing)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          if (_isRefreshing) const shad.Gap(8),
          Expanded(
            child: _loading
                ? const Center(child: shad.CircularProgressIndicator())
                : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          style: theme.typography.p.copyWith(
                            color: theme.colorScheme.destructive,
                          ),
                        ),
                        const shad.Gap(8),
                        shad.SecondaryButton(
                          onPressed: () => unawaited(_load(forceRefresh: true)),
                          child: Text(l10n.commonRetry),
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: () => _load(forceRefresh: true),
                    child: ListView.builder(
                      itemCount: _sessions.length,
                      padding: const EdgeInsets.only(bottom: 96),
                      itemBuilder: (context, index) {
                        final session = _sessions[index];
                        return _ManagementSessionTile(session: session);
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _load({bool forceRefresh = false}) async {
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final search = _searchCtrl.text.isEmpty ? null : _searchCtrl.text;
    final cacheKey = _cacheKey(wsId, search);
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
        tags: [_cacheTag, 'workspace:$wsId', 'module:timer'],
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _sessions = sessions;
        _loading = false;
        _isRefreshing = false;
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

  int _uniqueUsers() =>
      _sessions.map((session) => session.userId).toSet().length;
}

class _ManagementSessionTile extends StatelessWidget {
  const _ManagementSessionTile({required this.session});

  final TimeTrackingSession session;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final dateFmt = DateFormat.yMMMd();

    return shad.GhostButton(
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                shad.LucideIcons.user,
                color: theme.colorScheme.primary,
                size: 20,
              ),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.title ?? 'Session',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  if (session.startTime != null)
                    Text(
                      dateFmt.format(session.startTime!.toLocal()),
                      style: theme.typography.textSmall,
                    ),
                ],
              ),
            ),
            Text(
              _formatDuration(session.duration),
              style: theme.typography.p.copyWith(fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDuration(Duration duration) {
    final hours = duration.inHours;
    final minutes = duration.inMinutes % 60;
    if (hours > 0) return '${hours}h ${minutes}m';
    return '${minutes}m';
  }
}

class _OverviewCard extends StatelessWidget {
  const _OverviewCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Expanded(
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 24, color: theme.colorScheme.primary),
              const shad.Gap(12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    label,
                    style: theme.typography.textSmall,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
