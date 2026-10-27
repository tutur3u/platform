import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
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
class ReplyEntryPanel extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reply = entry.optionLabel ?? entry.text ?? '';
    final sent = entry.status == OutboxStatus.sent;
    final (icon, tone, title) = _headline(context, sent);
    return AppGroupedSection.spaced(
      caption: l10n.mastermindReplyOptionsTitle,
      children: [
        AppGroupedRow(
          leading: AppIconTile(icon: icon, tone: tone),
          title: Text(title),
          subtitle: Text(l10n.mastermindReplyYourReply(reply)),
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
    return switch (status.issue) {
      ReplyIssue.rateLimited => (
        AppIcons.warning,
        AppTone.warning,
        l10n.mastermindReplyRateLimited(_minutesLeft(context)),
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

  int _minutesLeft(BuildContext context) {
    final until = status.retryAt;
    if (until == null) return 1;
    final seconds = until.difference(replies.now()).inSeconds;
    return seconds <= 0 ? 1 : (seconds / 60).ceil();
  }

  Widget _actions(BuildContext context) {
    final l10n = context.l10n;
    final waiting = status.issue == ReplyIssue.rateLimited;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          AppButton.primary(
            onPressed: waiting
                ? null
                : () => unawaited(replies.retry(entry.itemId)),
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
            onPressed: () => unawaited(replies.discard(entry.itemId)),
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
