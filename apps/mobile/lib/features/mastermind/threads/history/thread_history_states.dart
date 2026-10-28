import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';
import 'package:mobile/l10n/l10n.dart';

/// Why "Load earlier" brought nothing; the messages shown stay.
String threadEarlierProblemText(
  AppLocalizations l10n,
  ThreadsProblem problem,
  DateTime? retryAt,
) => problem == ThreadsProblem.rateLimited
    ? [
        l10n.mastermindThreadHistoryLimitTitle,
        threadRetryText(l10n, retryAt),
      ].join('. ')
    : l10n.mastermindThreadHistoryEarlierFailed;

String threadRetryText(AppLocalizations l10n, DateTime? retryAt) =>
    retryAt == null
    ? l10n.mastermindThreadHistoryLimitLater
    : l10n.mastermindThreadHistoryLimitRetryAt(
        Gmt7.time(retryAt, l10n.localeName),
      );

/// The app lock is up: nothing read is kept.
class ThreadHistoryLocked extends StatelessWidget {
  const ThreadHistoryLocked({super.key});

  @override
  Widget build(BuildContext context) => AppStateMessage(
    icon: LucideIcons.lock,
    title: context.l10n.mastermindThreadHistoryLocked,
  );
}

/// Why the history shows nothing, with the way forward when there is one.
class ThreadHistoryProblem extends StatelessWidget {
  const ThreadHistoryProblem({
    required this.problem,
    this.retryAt,
    this.onRetry,
    super.key,
  });

  final ThreadsProblem problem;
  final DateTime? retryAt;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final retry = onRetry;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: switch (problem) {
          ThreadsProblem.notAvailable => AppStateMessage(
            icon: LucideIcons.laptop,
            title: l10n.mastermindThreadHistoryNotAvailableTitle,
            message: l10n.mastermindThreadHistoryNotAvailableMessage,
          ),
          ThreadsProblem.gone => AppStateMessage(
            icon: LucideIcons.searchX,
            title: l10n.mastermindThreadHistoryGoneTitle,
            actionLabel: l10n.mastermindBackToThreads,
            onAction: () => context.go('/mastermind/threads'),
          ),
          ThreadsProblem.rateLimited => AppStateMessage(
            icon: LucideIcons.hourglass,
            title: l10n.mastermindThreadHistoryLimitTitle,
            message: threadRetryText(l10n, retryAt),
            tone: AppTone.warning,
            actionLabel: retry == null ? null : l10n.commonRetry,
            onAction: retry,
          ),
          ThreadsProblem.accessLost => AppStateMessage(
            icon: LucideIcons.keyRound,
            title: l10n.mastermindThreadHistoryAccessTitle,
            message: l10n.mastermindThreadHistoryAccessMessage,
            tone: AppTone.warning,
          ),
          ThreadsProblem.digestGone ||
          ThreadsProblem.unavailable => AppStateMessage(
            icon: LucideIcons.cloudOff,
            title: l10n.mastermindThreadHistoryErrorTitle,
            message: l10n.mastermindThreadHistoryErrorMessage,
            tone: AppTone.warning,
            actionLabel: retry == null ? null : l10n.commonRetry,
            onAction: retry,
          ),
        },
      ),
    );
  }
}
