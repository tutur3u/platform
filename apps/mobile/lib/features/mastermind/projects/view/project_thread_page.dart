import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_live.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/posted_reply_bubble.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_transcript.dart';
import 'package:mobile/features/mastermind/projects/view/thread_composer.dart';
import 'package:mobile/features/mastermind/projects/view/thread_replies.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';

/// `/mastermind/work/thread/:threadId`: one thread's recent messages and a
/// steered composer above the dock. The dock's Back returns to Projects.
class ProjectThreadPage extends StatefulWidget {
  const ProjectThreadPage({
    required this.machine,
    required this.threadId,
    this.repository,
    this.live = true,
    super.key,
  });

  final ProjectsMachine machine;
  final String threadId;
  final ProjectsRepository? repository;
  final bool live;

  @override
  State<ProjectThreadPage> createState() => _ProjectThreadPageState();
}

class _ProjectThreadPageState extends State<ProjectThreadPage> {
  late final ProjectsRepository _repository =
      widget.repository ??
      sharedProjectsRepository(
        cache: context.read<MastermindRuntime?>()?.threadCache,
        userId: context.read<MastermindRuntime?>()?.userId,
      );
  late final ThreadCubit _cubit = ThreadCubit(
    repository: _repository,
    machine: widget.machine,
    threadId: widget.threadId,
  );
  late final ThreadReplies _replies = ThreadReplies(
    create: () => FleetThreadReplyCubit(
      source: _repository.replySource,
      machineId: widget.machine.machineId,
      threadId: widget.threadId,
      environmentId: widget.machine.environmentId,
    ),
    onPhase: _onReply,
  );
  final _draft = TextEditingController();
  StreamSubscription<FleetOwnerFrame>? _frames;

  @override
  void initState() {
    super.initState();
    unawaited(_cubit.load());
    if (widget.live) {
      _frames = ProjectsLive.shared.frames.listen(_onFrame);
      ProjectsLive.shared.hold(this);
    }
  }

  void _onFrame(FleetOwnerFrame frame) {
    final threads = isThreadsPoke(frame, widget.machine.machineId);
    if (threads) unawaited(_cubit.load());
    if (threads || frame.kind == FleetOwnerFrameKind.receipt) {
      _replies.checkHeld();
    }
  }

  /// The composer's reply, held or taken, clears the field; one that failed
  /// keeps its text, so Send resends it under the same key.
  void _onReply(FleetReplyStatus status, {required bool current}) {
    if (current &&
        (status.phase == FleetReplyPhase.sent ||
            status.phase == FleetReplyPhase.delivered)) {
      _draft.clear();
    }
    if (status.phase == FleetReplyPhase.delivered) unawaited(_cubit.load());
  }

  @override
  void dispose() {
    unawaited(_frames?.cancel());
    if (widget.live) ProjectsLive.shared.release(this);
    unawaited(_cubit.close());
    _replies.dispose();
    _draft.dispose();
    super.dispose();
  }

  Future<void> _back() async {
    final router = GoRouter.of(context);
    if (router.canPop()) {
      router.pop();
    } else {
      router.go(Routes.mastermindWork);
    }
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final padding = MediaQuery.paddingOf(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final composerBottom =
        (keyboard > padding.bottom ? keyboard : padding.bottom) + AppSpacing.sm;
    return ListenableBuilder(
      listenable: _replies,
      builder: (context, _) => BlocBuilder<ThreadCubit, ThreadState>(
        bloc: _cubit,
        builder: (context, state) => Stack(
          children: [
            ShellChromeActions(
              ownerId: 'mastermind-project-thread',
              locations: {location},
              onBack: _back,
            ),
            if (state.thread case final thread?)
              ShellTitleOverride(
                ownerId: 'mastermind-project-thread',
                locations: {location},
                title: thread.title,
                showLeadingBrand: false,
              ),
            MediaQuery.removePadding(
              context: context,
              removeBottom: true,
              child: ProjectThreadTranscript(
                state: state,
                cubit: _cubit,
                machine: widget.machine,
                bottomGap: composerBottom + 64,
                replies: [
                  for (final reply in _replies.replies)
                    BlocBuilder<FleetThreadReplyCubit, FleetReplyStatus>(
                      bloc: reply,
                      builder: (context, status) => PostedReplyBubble(
                        status: status,
                        onRetry: () => unawaited(reply.retry()),
                        onSignIn: () => unawaited(
                          context.read<AuthCubit?>()?.refreshAccountAssurance(),
                        ),
                        onWriteAnother: _replies.isCurrent(reply)
                            ? _replies.writeAnother
                            : null,
                      ),
                    ),
                ],
              ),
            ),
            Positioned(
              left: AppSpacing.md,
              right: AppSpacing.md,
              bottom: composerBottom,
              child: ThreadComposer(
                controller: _draft,
                enabled: _replies.composerEnabled,
                onSend: _replies.send,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
