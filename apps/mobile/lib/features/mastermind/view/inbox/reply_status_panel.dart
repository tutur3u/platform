import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// A one-line explanation of why the last attempt did not become a reply.
/// Nothing for no issue, and nothing for the issues a queued reply shows in
/// [ReplyEntryPanel] instead.
class ReplyIssueBanner extends StatelessWidget {
  const ReplyIssueBanner({required this.issue, super.key});

  final ReplyIssue? issue;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final message = switch (issue) {
      ReplyIssue.stale => l10n.mastermindReplyStale,
      ReplyIssue.conflict => l10n.mastermindReplyConflict,
      ReplyIssue.rejected => l10n.mastermindReplyRejected,
      ReplyIssue.unsafeText => l10n.mastermindReplyUnsafeText,
      ReplyIssue.tooLarge => l10n.mastermindReplyTooLarge,
      ReplyIssue.forbidden => l10n.mastermindReplyForbidden,
      ReplyIssue.notSaved => l10n.mastermindReplyNotSaved,
      _ => null,
    };
    if (message == null) return const SizedBox.shrink();
    return AppGroupedSection.spaced(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(
            icon: AppIcons.warning,
            tone: AppTone.warning,
          ),
          title: Text(message),
        ),
      ],
    );
  }
}

/// The state of a reply that is on the device or already accepted: sending,
/// queued (with retry and discard), rate limited, session trouble, or sent.
///
/// While a 429 is being waited out it counts down on its own and re-enables
/// "Try again" the moment [ReplyItemStatus.retryAt] passes, without needing
/// another state change.
class ReplyEntryPanel extends StatefulWidget {
  const ReplyEntryPanel({
    required this.entry,
    required this.status,
    required this.replies,
    super.key,
  });

  final OutboxEntry entry;
  final ReplyItemStatus status;
  final MastermindRepliesCubit replies;

  @override
  State<ReplyEntryPanel> createState() => _ReplyEntryPanelState();
}

class _ReplyEntryPanelState extends State<ReplyEntryPanel> {
  Timer? _tick;

  OutboxEntry get entry => widget.entry;
  ReplyItemStatus get status => widget.status;
  MastermindRepliesCubit get replies => widget.replies;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(covariant ReplyEntryPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    _schedule();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// Time left of the 429 wait, or null when there is none.
  Duration? get _remaining {
    final until = status.retryAt;
    if (status.issue != ReplyIssue.rateLimited || until == null) return null;
    final left = until.difference(replies.now());
    return left.isNegative || left == Duration.zero ? null : left;
  }

  /// One timer, set for the next moment the screen would read differently: the
  /// next whole-minute boundary of the countdown, or the end of the wait.
  void _schedule() {
    _tick?.cancel();
    _tick = null;
    final left = _remaining;
    if (left == null) return;
    const minute = Duration(minutes: 1);
    final minutesLeft = (left.inMicroseconds / minute.inMicroseconds).ceil();
    final untilChange = left - minute * (minutesLeft - 1);
    _tick = Timer(untilChange, () {
      if (!mounted) return;
      setState(_schedule);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reply = entry.optionLabel ?? entry.text ?? '';
    final sent = entry.status == OutboxStatus.sent;
    final (icon, tone, title) = _headline(context, sent);
    final large = mastermindLargeText(context);
    final queuedAt = l10n.mastermindReplyQueuedAt(
      Gmt7.time(entry.createdAt, Localizations.localeOf(context).toString()),
    );
    return AppGroupedSection.spaced(
      caption: l10n.mastermindReplyOptionsTitle,
      children: [
        AppGroupedRow(
          leading: AppIconTile(icon: icon, tone: tone),
          // A live region, so a screen reader announces sending, queued, rate
          // limited and sent as they change.
          title: Semantics(liveRegion: true, child: Text(title)),
          subtitle: large
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.mastermindReplyYourReply(reply)),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(queuedAt),
                  ],
                )
              : Text(l10n.mastermindReplyYourReply(reply)),
          // Creation records queue time, including after hub acceptance. At
          // large text sizes it moves under the reply instead of squeezing it.
          trailing: large
              ? null
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 120),
                  child: Text(
                    queuedAt,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
        ),
        if (!sent && !status.sending) _actions(context),
      ],
    );
  }

  (IconData, AppTone, String) _headline(BuildContext context, bool sent) {
    final l10n = context.l10n;
    if (sent) {
      return (AppIcons.check, AppTone.success, l10n.mastermindReplySent);
    }
    if (status.sending) {
      return (LucideIcons.send, AppTone.neutral, l10n.mastermindReplySending);
    }
    final left = _remaining;
    return switch (status.issue) {
      ReplyIssue.rateLimited when left != null => (
        AppIcons.warning,
        AppTone.warning,
        l10n.mastermindReplyRateLimited(_minutesLeft(left)),
      ),
      ReplyIssue.unauthorized => (
        AppIcons.warning,
        AppTone.warning,
        status.authFailures > 1
            ? l10n.mastermindReplyUnauthorizedAgain
            : l10n.mastermindReplyUnauthorized,
      ),
      _ => (LucideIcons.cloudOff, AppTone.warning, l10n.mastermindReplyQueued),
    };
  }

  static int _minutesLeft(Duration left) =>
      (left.inMicroseconds / Duration.microsecondsPerMinute).ceil();

  Widget _actions(BuildContext context) {
    final l10n = context.l10n;
    final waiting = _remaining != null;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          AppButton.primary(
            onPressed: waiting
                ? null
                : () =>
                      unawaited(replies.retry(entry.itemId, entry.versionHash)),
            child: Text(l10n.mastermindTryAgain),
          ),
          // Signing out is offered only once a plain retry has failed again.
          if (status.issue == ReplyIssue.unauthorized &&
              status.authFailures > 1)
            AppButton.outline(
              onPressed: () => unawaited(_signInAgain(context)),
              child: Text(l10n.mastermindSignOutAction),
            ),
          AppButton.ghost(
            onPressed: () =>
                unawaited(replies.discard(entry.itemId, entry.versionHash)),
            child: Text(l10n.mastermindReplyDiscard),
          ),
        ],
      ),
    );
  }

  Future<void> _signInAgain(BuildContext context) async {
    final l10n = context.l10n;
    final auth = context.read<AuthCubit>();
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: l10n.mastermindSignOutConfirmTitle,
      message: l10n.mastermindSignOutConfirmMessage,
      confirmLabel: l10n.mastermindSignOutConfirmAction,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (confirmed) await auth.signOut();
  }
}
