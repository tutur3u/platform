import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';
import 'package:mobile/features/mastermind/projects/view/thread_badges.dart';
import 'package:mobile/features/mastermind/projects/view/thread_bubbles.dart';
import 'package:mobile/l10n/l10n.dart';

/// The transcript, newest at the bottom, with this screen's replies last.
class ProjectThreadTranscript extends StatelessWidget {
  const ProjectThreadTranscript({
    required this.state,
    required this.cubit,
    required this.machine,
    required this.bottomGap,
    required this.replies,
    super.key,
  });

  final ThreadState state;
  final ThreadCubit cubit;
  final ProjectsMachine machine;
  final double bottomGap;
  final List<Widget> replies;

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
      ...replies,
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
