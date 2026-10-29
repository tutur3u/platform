import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/item_question_card.dart';
import 'package:mobile/features/mastermind/view/inbox/item_reply_section.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_choice.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_composer.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_action_bar.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox/item/:itemId`: one ask in full, with the reply composer
/// when the hub accepts replies, or its outcome once the hub resolved it.
///
/// The id is an opaque snapshot id used only to look the item up, first among
/// the open asks, then in the resolved history. If it is in neither the page
/// says so and offers the way back; it is never an error.
class MastermindItemPage extends StatefulWidget {
  const MastermindItemPage({required this.itemId, super.key});

  final String itemId;

  @override
  State<MastermindItemPage> createState() => _MastermindItemPageState();
}

class _MastermindItemPageState extends State<MastermindItemPage> {
  /// The `version_hash` first shown here, to notice a question that changed.
  String? _openedVersion;

  /// The chosen option or written words, shared by body and action bar.
  ReplyChoice? _choiceOrNull;
  ReplyChoice get _choice => _choiceOrNull ??= ReplyChoice(
    replies: MastermindRepliesWatcher.cubitOf(context),
    itemId: widget.itemId,
  );

  @override
  void dispose() {
    _choiceOrNull?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final snapshot = ready.snapshot;
      final item = openNeedsYouById(snapshot, widget.itemId);
      final resolved = item == null
          ? resolvedNeedsYouById(snapshot, widget.itemId)
          : null;
      if (item != null) {
        _openedVersion ??= item.versionHash;
        _choice.bindItem(item);
      }
      return MastermindRepliesWatcher(
        child: MastermindStickyActionLayout(
          // The primary action stays above the dock while the ask scrolls.
          action: item == null || item.state == ItemState.answered
              ? null
              : ReplyActionBar(
                  item: item,
                  replies: MastermindRepliesWatcher.cubitOf(context),
                  choice: _choice,
                ),
          body: AppPageScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: MastermindFreshnessStrip(freshness: freshness),
              ),
              SliverToBoxAdapter(
                child: switch ((item, resolved)) {
                  (final item?, _) => _Detail(
                    item: item,
                    choice: _choice,
                    updated: item.versionHash != _openedVersion,
                    now: snapshot.generatedAt,
                  ),
                  (_, final resolved?) => _Detail(
                    item: resolved,
                    choice: _choice,
                    now: snapshot.generatedAt,
                  ),
                  _ => _Gone(answered: _openedVersion != null),
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _Gone extends StatelessWidget {
  const _Gone({required this.answered});

  /// The item was on screen and then left the snapshot.
  final bool answered;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
      child: AppStateMessage(
        icon: LucideIcons.inbox,
        title: answered
            ? l10n.mastermindItemAnsweredTitle
            : l10n.mastermindItemGoneTitle,
        actionLabel: l10n.mastermindBackToInbox,
        onAction: () => context.go(Routes.mastermindInbox),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({
    required this.item,
    required this.choice,
    required this.now,
    this.updated = false,
  });

  final NeedsYou item;
  final ReplyChoice choice;
  final bool updated;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-item',
          locations: {Routes.mastermindInboxItemPath(item.id)},
          // The kind, not the title: the heading below carries the full
          // title, so the navbar never repeats it.
          title: switch (item.kind) {
            final kind? => MastermindLabels.itemKind(l10n, kind),
            null => l10n.mastermindAskTitle,
          },
          showLeadingBrand: false,
        ),
        if (updated)
          MastermindGroup(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(
                  icon: AppIcons.info,
                  tone: AppTone.warning,
                ),
                title: Text(l10n.mastermindItemUpdated),
              ),
            ],
          ),
        // The full title heads the body, and the ask is plain text: a grouped
        // row would cap it at two lines.
        ItemQuestionCard(item: item, now: now),
        // Resolved is the hub's word only; until then the reply section shows
        // this device's reply (Sent · waiting for Mastermind) or the composer.
        if (item.state != ItemState.open)
          ItemResolvedPanel(item: item)
        else
          ItemReplySection(item: item, choice: choice),
      ],
    );
  }
}
