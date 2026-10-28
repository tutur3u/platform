import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/snapshot_source_factory.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';
import 'package:mobile/features/mastermind/threads/v1_threads.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';
import 'package:mobile/features/mastermind/view/work/work_segment_bar.dart';
import 'package:mobile/l10n/l10n.dart';

/// P1a reads only the v1 snapshot. It never probes the future history API.
class V1ThreadsPage extends StatelessWidget {
  const V1ThreadsPage({super.key});
  @override
  Widget build(BuildContext context) => StreamBuilder(
    stream: maybeSupabase?.auth.onAuthStateChange,
    builder: (context, auth) {
      final access = context.watch<MastermindAccessCubit>().state;
      final user = maybeSupabase?.auth.currentUser?.id;
      if (!access.visible || user == null) {
        return Text(context.l10n.mastermindThreadsAccess);
      }
      return V1ThreadsList(key: ValueKey('$user:${access.wsId}'));
    },
  );
}

class V1ThreadsList extends StatefulWidget {
  const V1ThreadsList({this.source, super.key});
  final MastermindSnapshotSource? source;
  @override
  State<V1ThreadsList> createState() => _ListSessionState();
}

class _ListSessionState extends State<V1ThreadsList> {
  late final MastermindSnapshotSource source =
      widget.source ?? createMastermindSnapshotSource();
  V1Threads? data;
  bool busy = false;
  bool failed = false;
  final search = TextEditingController();
  String query = '';
  String? filter;
  @override
  void initState() {
    super.initState();
    final uri = GoRouter.of(context).routeInformationProvider.value.uri;
    query = uri.queryParameters['q'] ?? '';
    filter = uri.queryParameters['state'];
    search.text = query;
    unawaited(refresh());
  }

  @override
  void dispose() {
    search.dispose();
    if (source case final HubHttpSnapshotSource live) live.close();
    super.dispose();
  }

  Future<void> refresh() async {
    if (busy) return;
    setState(() {
      busy = true;
      failed = false;
    });
    try {
      final result = await source.fetchSnapshot();
      if (!mounted) return;
      if (result is SnapshotFetchOk) {
        data = V1Threads(object(jsonDecode(utf8.decode(result.bytes))));
      } else {
        failed = true;
        if (result is SnapshotFetchUnavailable && result.kind.isAccessLost) {
          data = null;
        }
      }
    } on Object {
      if (mounted) failed = true;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void updateQuery() => context.go(
    Uri(
      path: '/mastermind/threads',
      queryParameters: {
        if (query.isNotEmpty) 'q': query,
        if (filter != null) 'state': filter,
      },
    ).toString(),
  );
  void selection(WorkSelection s) => context.go(
    Uri.parse(
      workLocation(
        segment: s.segment,
        state: s.state,
        product: s.product,
        area: s.area,
      ),
    ).replace(path: '/mastermind/threads').toString(),
  );
  @override
  Widget build(BuildContext context) {
    final uri = GoRouterState.of(context).uri;
    final segment = workSegmentFromQuery(uri.queryParameters['segment']);
    if (segment != WorkSegment.lanes) {
      return MastermindWorkPage(
        initialSegment: segment,
        onSelection: selection,
      );
    }
    final l = context.l10n;
    final lanes =
        data?.lanes.where((t) => t.matches(query, filter)).toList() ?? [];
    String label(String? state) => switch (state) {
      'running' => l.mastermindThreadsRunning,
      'waiting' => l.mastermindThreadsWaiting,
      'idle' => l.mastermindThreadsIdle,
      'failed' => l.mastermindThreadsFailed,
      _ => l.mastermindThreadsAll,
    };
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      children: [
        WorkSegmentBar(
          selected: segment,
          onChanged: (s) =>
              selection((segment: s, state: null, product: null, area: null)),
        ),
        if (busy) const LinearProgressIndicator(),
        if (failed) Text(l.mastermindThreadsError),
        TextField(
          controller: search,
          decoration: InputDecoration(hintText: l.mastermindThreadsSearch),
          onChanged: (v) {
            setState(() => query = v);
            updateQuery();
          },
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final state in <String?>[
                null,
                'running',
                'waiting',
                'idle',
                if (data?.lanes.any((t) => t.state == 'failed') ?? false)
                  'failed',
              ])
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: 44,
                    minHeight: 44,
                  ),
                  child: FilterChip(
                    label: Text(
                      [
                        label(state),
                        if (state != null) '${data?.counts[state] ?? 0}',
                      ].join(' '),
                    ),
                    selected: filter == state,
                    onSelected: (_) {
                      setState(() => filter = state);
                      updateQuery();
                    },
                  ),
                ),
            ],
          ),
        ),
        TextButton(onPressed: refresh, child: Text(l.mastermindThreadsRefresh)),
        if (lanes.isEmpty && !busy) Text(l.mastermindThreadsEmpty),
        for (final lane in lanes)
          ListTile(
            key: ValueKey(lane.id),
            title: Text(lane.title),
            subtitle: Text(lane.role),
            trailing: Text(label(lane.state)),
          ),
      ],
    );
  }
}
