import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show appFlavor;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/threads/threads_cubit.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';
import 'package:mobile/features/mastermind/threads/threads_repository.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// Access and user changes dispose all memory-only thread content.
class ThreadsView extends StatelessWidget {
  const ThreadsView({required this.fallback, this.threadRef, super.key});
  final String? threadRef;
  final Widget fallback;
  @override
  Widget build(BuildContext context) {
    return StreamBuilder(
      stream: maybeSupabase?.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final access = context.watch<MastermindAccessCubit>().state;
        final user = maybeSupabase?.auth.currentUser?.id;
        if (!access.visible || user == null) return fallback;
        return _ThreadsSession(
          key: ValueKey('$user:${access.wsId}'),
          fallback: fallback,
          threadRef: threadRef,
        );
      },
    );
  }
}

class _ThreadsSession extends StatefulWidget {
  const _ThreadsSession({required this.fallback, this.threadRef, super.key});
  final String? threadRef;
  final Widget fallback;
  @override
  State<_ThreadsSession> createState() => _ThreadsSessionState();
}

class _ThreadsSessionState extends State<_ThreadsSession> {
  late final repository = ThreadsRepository(
    // The native flavor is a compile-time value.
    // ignore: avoid_redundant_argument_values
    base: MastermindHubConfig.resolve(flavor: appFlavor),
    tokens: const SupabaseAccessTokenProvider(),
  );
  late final cubit = ThreadsCubit(repository);
  String query = '';
  String? filter;
  ThreadEntry? selected;
  final messages = <ThreadMessage>[];
  ThreadPage? page;
  ThreadsFailure? failure;
  bool busy = false;
  bool opened = false;
  @override
  void initState() {
    super.initState();
    unawaited(cubit.refresh());
    final uri = GoRouter.of(context).routeInformationProvider.value.uri;
    query = uri.queryParameters['q'] ?? '';
    filter = uri.queryParameters['state'];
  }

  void updateFilters() {
    context.go(
      Uri(
        path: '/mastermind/threads',
        queryParameters: {
          if (query.isNotEmpty) 'q': query,
          if (filter != null) 'state': filter,
        },
      ).toString(),
    );
  }

  @override
  void dispose() {
    unawaited(cubit.close());
    repository.close();
    super.dispose();
  }

  Future<void> load(ThreadEntry entry, {bool earlier = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      failure = null;
      selected = entry;
    });
    try {
      final result = await repository.history(
        entry,
        before: earlier ? page?.before : null,
      );
      if (!mounted) return;
      setState(() {
        if (!earlier) messages.clear();
        final refs = messages.map((m) => m.ref).toSet();
        messages.insertAll(
          0,
          result.messages.where((m) => !refs.contains(m.ref)),
        );
        page = result;
      });
    } on Object catch (e) {
      if (!mounted) return;
      final problem = e is ThreadsFailure ? e : const ThreadsFailure(503);
      if (problem.status == 401 || problem.status == 403) {
        messages.clear();
        page = null;
      }
      if (problem.status == 410) {
        messages.clear();
        page = null;
        selected = null;
        await cubit.refresh();
        selected = cubit.state.entries
            .where((t) => t.ref == entry.ref)
            .firstOrNull;
      }
      if (mounted) setState(() => failure = problem);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String reason(BuildContext context, ThreadsFailure e) {
    final l = context.l10n;
    return switch (e.status) {
      404 => l.mastermindThreadsUnavailable,
      410 => l.mastermindThreadsUpdated,
      429 => [
        l.mastermindThreadsLimit,
        if (e.retryAt != null) e.retryAt!.toLocal().toString(),
      ].join(' · '),
      401 || 403 => l.mastermindThreadsAccess,
      _ => l.mastermindThreadsError,
    };
  }

  @override
  Widget build(BuildContext context) => BlocBuilder<ThreadsCubit, ThreadsState>(
    bloc: cubit,
    builder: (context, state) {
      if (state.status == ThreadsStatus.fallback) return widget.fallback;
      final l = context.l10n;
      if (widget.threadRef != null &&
          !opened &&
          state.status == ThreadsStatus.ready) {
        opened = true;
        final found = state.entries
            .where((t) => t.ref == widget.threadRef)
            .firstOrNull;
        if (found == null) {
          failure = const ThreadsFailure(404);
        } else {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) unawaited(load(found));
          });
        }
      }
      final entry = selected;
      final problem = failure ?? state.failure;
      final entries =
          state.entries.where((t) => t.matches(query, filter)).toList()..sort(
            (a, b) => ['waiting', 'failed', 'running', 'idle']
                .indexOf(a.group)
                .compareTo(
                  ['waiting', 'failed', 'running', 'idle'].indexOf(b.group),
                ),
          );
      return ListView(
        shrinkWrap: widget.threadRef == null,
        physics: widget.threadRef == null
            ? const NeverScrollableScrollPhysics()
            : null,
        padding: EdgeInsets.fromLTRB(
          16,
          8,
          16,
          MediaQuery.paddingOf(context).bottom + 24,
        ),
        children: [
          if (problem != null) Text(reason(context, problem)),
          if (busy || state.status == ThreadsStatus.loading)
            const LinearProgressIndicator(),
          if (widget.threadRef == null) ...[
            TextField(
              decoration: InputDecoration(
                labelText: l.mastermindThreadsSearch,
                hintText: l.mastermindThreadsSearch,
              ),
              onChanged: (v) {
                setState(() => query = v);
                updateFilters();
              },
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final value in <String?>[
                    null,
                    'running',
                    'waiting',
                    'idle',
                    if (state.entries.any((t) => t.group == 'failed')) 'failed',
                  ])
                    Padding(
                      padding: const EdgeInsets.all(4),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: 44,
                          minWidth: 44,
                        ),
                        child: FilterChip(
                          selected: filter == value,
                          label: Text(switch (value) {
                            'running' => l.mastermindThreadsRunning,
                            'waiting' => l.mastermindThreadsWaiting,
                            'idle' => l.mastermindThreadsIdle,
                            'failed' => l.mastermindThreadsFailed,
                            _ => l.mastermindThreadsAll,
                          }),
                          onSelected: (_) {
                            setState(() => filter = value);
                            updateFilters();
                          },
                        ),
                      ),
                    ),
                ],
              ),
            ),
            TextButton(
              onPressed: cubit.refresh,
              child: Text(l.mastermindThreadsRefresh),
            ),
            if (entries.isEmpty && state.status != ThreadsStatus.loading)
              Text(l.mastermindThreadsEmpty),
            for (final thread in entries)
              ListTile(
                title: Text(thread.title.isEmpty ? thread.role : thread.title),
                subtitle: Text(
                  '${thread.group} · ${thread.product}\n'
                  '${thread.history == 'redacted' ? thread.preview : ''}',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(
                  '/mastermind/threads/${Uri.encodeComponent(thread.ref)}',
                ),
              ),
          ] else if (entry != null) ...[
            ShellTitleOverride(
              ownerId: 'mastermind-thread',
              locations: {
                '/mastermind/threads/${Uri.encodeComponent(entry.ref)}',
              },
              title: entry.title,
            ),
            Text(l.mastermindThreadsRedactions),
            if (page?.more == true)
              TextButton(
                onPressed: busy ? null : () => load(entry, earlier: true),
                child: Text(l.mastermindThreadsEarlier),
              ),
            if (messages.isEmpty && !busy && problem == null)
              Text(l.mastermindThreadsNoMessages),
            for (final message in messages)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      message.author,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    Text(
                      message.withheld
                          ? l.mastermindThreadsWithheld
                          : message.text,
                    ),
                    if (message.truncated) Text(l.mastermindThreadsRest),
                  ],
                ),
              ),
            if (failure != null)
              TextButton(
                onPressed: busy ? null : () => load(entry),
                child: Text(l.mastermindThreadsRefresh),
              ),
          ],
        ],
      );
    },
  );
}
