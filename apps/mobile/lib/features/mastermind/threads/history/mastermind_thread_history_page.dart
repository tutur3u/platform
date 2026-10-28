import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_cubit.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_source_factory.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_states.dart';
import 'package:mobile/features/mastermind/threads/history/thread_message_tile.dart';
import 'package:mobile/features/mastermind/view/mastermind_states.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/secure_screen/secure_screen_scope.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// The pushed history location for [threadRef].
String threadHistoryLocation(String threadRef) =>
    '/mastermind/threads/$threadRef';

/// `/mastermind/threads/:threadRef` (P1b): one thread's redacted history,
/// read-only, behind `MASTERMIND_THREAD_HISTORY` (D §1.3).
///
/// History lives in memory for this screen only. It is dropped when the app
/// lock comes up, when the account or workspace changes and when the screen
/// closes, and the screen is kept out of screenshots and app-switcher
/// previews while open.
class MastermindThreadHistoryPage extends StatelessWidget {
  const MastermindThreadHistoryPage({
    required this.threadRef,
    this.sourceFactory = createThreadHistorySource,
    super.key,
  });

  final String threadRef;
  final ThreadHistorySource Function() sourceFactory;

  @override
  Widget build(BuildContext context) {
    final (visible, wsId) = context
        .select<MastermindAccessCubit, (bool, String?)>(
          (cubit) => (cubit.state.visible, cubit.state.wsId),
        );
    final locked = context.select<AppLockCubit, bool>(
      (cubit) => cubit.state.enabled && cubit.state.locked,
    );
    return SecureScreenScope(
      child: visible
          ? _HistorySession(
              // A workspace or account change starts from nothing.
              key: ValueKey('$wsId:$threadRef'),
              threadRef: threadRef,
              locked: locked,
              sourceFactory: sourceFactory,
            )
          : const ThreadHistoryProblem(problem: ThreadsProblem.accessLost),
    );
  }
}

class _HistorySession extends StatefulWidget {
  const _HistorySession({
    required this.threadRef,
    required this.locked,
    required this.sourceFactory,
    super.key,
  });

  final String threadRef;
  final bool locked;
  final ThreadHistorySource Function() sourceFactory;

  @override
  State<_HistorySession> createState() => _HistorySessionState();
}

class _HistorySessionState extends State<_HistorySession> {
  late final ThreadHistorySource _source = widget.sourceFactory();
  late final ThreadHistoryCubit _cubit = ThreadHistoryCubit(
    source: _source,
    threadRef: widget.threadRef,
  );
  final _scroll = ScrollController();

  /// Distance from the bottom to keep when older messages are prepended.
  double? _keepFromBottom;

  @override
  void initState() {
    super.initState();
    widget.locked ? _cubit.hide() : unawaited(_cubit.open());
  }

  @override
  void didUpdateWidget(_HistorySession old) {
    super.didUpdateWidget(old);
    if (old.locked == widget.locked) return;
    widget.locked ? _cubit.hide() : unawaited(_cubit.open());
  }

  @override
  void dispose() {
    unawaited(_cubit.close());
    _source.close();
    _scroll.dispose();
    super.dispose();
  }

  void _onState(BuildContext context, ThreadHistoryState state) {
    if (state.loadingEarlier) {
      if (_scroll.hasClients) {
        _keepFromBottom =
            _scroll.position.maxScrollExtent - _scroll.position.pixels;
      }
      return;
    }
    if (state.phase != ThreadHistoryPhase.ready) {
      // A reload (410, unlock) opens on the newest messages again.
      _keepFromBottom = null;
      return;
    }
    final keep = _keepFromBottom ?? 0;
    _keepFromBottom = null;
    // Newest at the bottom: open there, and keep the reading position when
    // older messages arrive above it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final position = _scroll.position;
      position.jumpTo(
        (position.maxScrollExtent - keep).clamp(0, position.maxScrollExtent),
      );
    });
  }

  @override
  Widget build(BuildContext context) =>
      BlocConsumer<ThreadHistoryCubit, ThreadHistoryState>(
        bloc: _cubit,
        listenWhen: (a, b) =>
            a.messages != b.messages || a.loadingEarlier != b.loadingEarlier,
        listener: _onState,
        builder: (context, state) {
          final title = state.thread?.title;
          return Column(
            children: [
              if (title != null && title.isNotEmpty)
                ShellTitleOverride(
                  ownerId: 'mastermind-thread-history',
                  locations: {threadHistoryLocation(widget.threadRef)},
                  title: title,
                  showLeadingBrand: false,
                ),
              Expanded(
                child: switch (state.phase) {
                  ThreadHistoryPhase.loading => const MastermindSkeleton(),
                  ThreadHistoryPhase.hidden => const ThreadHistoryLocked(),
                  ThreadHistoryPhase.failed => ThreadHistoryProblem(
                    problem: state.problem ?? ThreadsProblem.unavailable,
                    retryAt: state.retryAt,
                    onRetry: _cubit.open,
                  ),
                  ThreadHistoryPhase.ready => _History(
                    state: state,
                    controller: _scroll,
                    onEarlier: _cubit.loadEarlier,
                  ),
                },
              ),
            ],
          );
        },
      );
}

class _History extends StatelessWidget {
  const _History({
    required this.state,
    required this.controller,
    required this.onEarlier,
  });

  final ThreadHistoryState state;
  final ScrollController controller;
  final Future<void> Function() onEarlier;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final role = state.thread?.role ?? '';
    final earlierProblem = state.problem;
    return AppPageScrollView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppGroupedSection.spaced(
                children: [
                  if (state.updated)
                    AppGroupedRow(
                      leading: const AppIconTile(
                        icon: AppIcons.info,
                        tone: AppTone.warning,
                      ),
                      title: Text(l10n.mastermindThreadHistoryUpdated),
                    ),
                  AppGroupedRow(
                    leading: const AppIconTile(icon: LucideIcons.shieldOff),
                    title: Text(l10n.mastermindThreadHistoryRedactionNote),
                  ),
                ],
              ),
              if (state.hasEarlier || earlierProblem != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: Column(
                    children: [
                      if (earlierProblem != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: Text(
                            threadEarlierProblemText(
                              l10n,
                              earlierProblem,
                              state.retryAt,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      if (state.hasEarlier)
                        AppButton.outline(
                          onPressed: state.loadingEarlier
                              ? null
                              : () => unawaited(onEarlier()),
                          child: Text(l10n.mastermindThreadHistoryEarlier),
                        ),
                    ],
                  ),
                ),
              if (state.messages.isEmpty)
                AppStateMessage(
                  icon: LucideIcons.messagesSquare,
                  title: l10n.mastermindThreadHistoryEmpty,
                )
              else
                AppGroupedSection.spaced(
                  children: [
                    for (final message in state.messages)
                      ThreadMessageTile(
                        key: ValueKey(message.ref),
                        message: message,
                        fallbackAuthor: role,
                      ),
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }
}
