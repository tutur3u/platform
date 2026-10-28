import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/l10n/l10n.dart';

/// The one reply waiting to send, if exactly one is: it has a single place to
/// go, where several do not.
OutboxEntry? _onlyPending(MastermindRepliesState state) =>
    state.pendingCount == 1
    ? state.outbox.firstWhere((entry) => entry.status == OutboxStatus.pending)
    : null;

/// "N replies waiting to send": queued on the device, not yet accepted.
/// Shown under Needs-you on Home and at the top of the Inbox. Needs a
/// [MastermindRepliesWatcher] above it to send what is queued.
class PendingRepliesSection extends StatelessWidget {
  const PendingRepliesSection({super.key});

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      buildWhen: (a, b) =>
          a.pendingCount != b.pendingCount ||
          _onlyPending(a)?.idempotencyKey != _onlyPending(b)?.idempotencyKey,
      builder: (context, state) {
        if (state.pendingCount == 0) return const SizedBox.shrink();
        final only = _onlyPending(state);
        return AppGroupedSection.spaced(
          children: [
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.send),
              title: Text(
                context.l10n.mastermindRepliesWaiting(state.pendingCount),
              ),
              showChevron: only != null,
              onTap: only == null
                  ? null
                  : () => context.push(
                      Routes.mastermindInboxItemPath(only.itemId),
                    ),
            ),
          ],
        );
      },
    );
  }
}
