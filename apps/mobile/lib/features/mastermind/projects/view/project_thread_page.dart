import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_live.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/thread_badges.dart';
import 'package:mobile/features/mastermind/projects/view/thread_bubbles.dart';
import 'package:mobile/features/mastermind/projects/view/thread_composer.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

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
  late final ThreadCubit _cubit = ThreadCubit(
    repository: widget.repository ?? sharedProjectsRepository(),
    machine: widget.machine,
    threadId: widget.threadId,
  );
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
    if (frame.kind == FleetOwnerFrameKind.receipt) {
      unawaited(_cubit.refreshReceipts());
    } else if (isThreadsPoke(frame, widget.machine.machineId)) {
      unawaited(_cubit.load());
      unawaited(_cubit.refreshReceipts());
    }
  }

  @override
  void dispose() {
    unawaited(_frames?.cancel());
    if (widget.live) ProjectsLive.shared.release(this);
    unawaited(_cubit.close());
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
    return BlocBuilder<ThreadCubit, ThreadState>(
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
            child: _Transcript(
              state: state,
              cubit: _cubit,
              machine: widget.machine,
              bottomGap: composerBottom + 64,
            ),
          ),
          Positioned(
            left: AppSpacing.md,
            right: AppSpacing.md,
            bottom: composerBottom,
            child: ThreadComposer(onSend: _cubit.send),
          ),
        ],
      ),
    );
  }
}

class _Transcript extends StatelessWidget {
  const _Transcript({
    required this.state,
    required this.cubit,
    required this.machine,
    required this.bottomGap,
  });

  final ThreadState state;
  final ThreadCubit cubit;
  final ProjectsMachine machine;
  final double bottomGap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failure = state.failure;
    if (state.status == ThreadStatus.failed && failure != null) {
      return Center(
        child: AppStateMessage.inline(
          icon: LucideIcons.cloudOff,
          tone: AppTone.warning,
          title: failure.message(l10n),
          actionLabel: l10n.commonRetry,
          onAction: () => unawaited(cubit.load()),
        ),
      );
    }
    final thread = state.thread;
    // Newest at the bottom: the list is reversed so it opens there.
    final items = <Widget>[
      if (thread != null) ThreadBadges(thread: thread, machine: machine),
      if (state.hasEarlier)
        Center(
          child: AppButton(
            key: const ValueKey('projects-load-earlier'),
            variant: AppButtonVariant.ghost,
            size: AppButtonSize.small,
            loading: state.loadingEarlier,
            onPressed: () => unawaited(cubit.loadEarlier()),
            child: Text(l10n.mastermindProjectsLoadEarlier),
          ),
        ),
      for (final message in state.messages)
        ThreadMessageBubble(
          key: ValueKey('projects-message-${message.position}'),
          message: message,
        ),
      for (final reply in state.replies)
        PostedReplyBubble(
          key: ValueKey('projects-reply-${reply.localId}'),
          reply: reply,
          onRetry: () => unawaited(cubit.retry(reply.localId)),
          onSignIn: () =>
              unawaited(context.read<AuthCubit?>()?.refreshAccountAssurance()),
        ),
      if (failure != null && thread != null)
        Text(
          failure.message(l10n),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
    ].reversed.toList();
    return LayoutBuilder(
      builder: (context, constraints) {
        final insets = AppPageInsets.of(
          context,
          width: constraints.maxWidth,
          consumeBottomClearance: false,
        );
        return ListView(
          reverse: true,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: insets.copyWith(bottom: bottomGap),
          children: items,
        );
      },
    );
  }
}
