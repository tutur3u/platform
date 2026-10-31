import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_choice.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_composer.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_status_panel.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// The reply half of the detail page. What it shows follows the hub:
///
/// * a reply already queued or sent for this question: its status;
/// * replies on: the composer (option tiles and free text);
/// * replies off, or not known: the options read-only and "Reply on your Mac".
class ItemReplySection extends StatelessWidget {
  const ItemReplySection({required this.item, required this.choice, super.key});

  final NeedsYou item;

  /// The selection and words the sticky action bar sends.
  final ReplyChoice choice;

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      builder: (context, state) {
        final entry = state.entryFor(item.id, item.versionHash);
        final pending = state.pendingOptionFor(item.id, item.versionHash);
        if (entry != null && pending == null) {
          return ReplyEntryPanel(
            entry: entry,
            status: state.statusFor(item.id),
            replies: replies,
          );
        }
        if (state.canReply) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ReplyIssueBanner(issue: state.statusFor(item.id).issue),
              ReplyComposer(item: item, replies: replies, choice: choice),
            ],
          );
        }
        return _ReadOnlyOptions(
          item: item,
          capability: state.capability,
          onRetry: () => replies.loadCapabilities(force: true),
        );
      },
    );
  }
}

class _ReadOnlyOptions extends StatelessWidget {
  const _ReadOnlyOptions({
    required this.item,
    required this.capability,
    required this.onRetry,
  });

  final NeedsYou item;
  final ReplyCapability capability;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final options = selectableOptions(item);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (options.isNotEmpty)
          MastermindGroup(
            caption: l10n.mastermindReplyOptionsTitle,
            dividerInset: AppLayout.rowHorizontalPadding,
            children: [
              for (final (index, option) in options)
                MastermindListRow(
                  title: option,
                  subtitle: item.optionRecommended(index)
                      ? l10n.mastermindRecommended
                      : null,
                ),
            ],
          ),
        MastermindGroup(
          children: [
            switch (capability) {
              ReplyCapability.unknown ||
              ReplyCapability.checking => AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.hourglass),
                title: Text(l10n.mastermindReplyChecking),
              ),
              ReplyCapability.unavailable => AppGroupedRow(
                leading: const AppIconTile(
                  icon: LucideIcons.cloudOff,
                  tone: AppTone.warning,
                ),
                title: Text(l10n.mastermindReplyCheckFailed),
                trailing: TextButton(
                  onPressed: onRetry,
                  child: Text(l10n.commonRetry),
                ),
              ),
              _ => AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.monitor),
                title: Text(l10n.mastermindReplyOnMac),
                subtitle: Text(l10n.mastermindNeedsYouHint),
              ),
            },
          ],
        ),
      ],
    );
  }
}
