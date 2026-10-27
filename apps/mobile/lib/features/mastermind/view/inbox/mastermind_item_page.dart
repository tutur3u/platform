import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/item_reply_section.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox/item/:itemId`: one Needs-you item in full, with the
/// reply composer when the hub accepts replies.
///
/// The id is an opaque snapshot id used only to look the item up. If it is not
/// an open item any more the page says so and offers the way back; it is never
/// an error.
class MastermindItemPage extends StatefulWidget {
  const MastermindItemPage({required this.itemId, super.key});

  final String itemId;

  @override
  State<MastermindItemPage> createState() => _MastermindItemPageState();
}

class _MastermindItemPageState extends State<MastermindItemPage> {
  /// The `version_hash` first shown here, to notice a question that changed.
  String? _openedVersion;

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final item = openNeedsYouById(ready.snapshot, widget.itemId);
      if (item != null) _openedVersion ??= item.versionHash;
      return MastermindRepliesWatcher(
        child: AppPageScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: MastermindFreshnessStrip(freshness: freshness),
            ),
            SliverToBoxAdapter(
              child: item == null
                  ? _Gone(answered: _openedVersion != null)
                  : _Detail(
                      item: item,
                      updated: item.versionHash != _openedVersion,
                    ),
            ),
          ],
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
  const _Detail({required this.item, required this.updated});

  final NeedsYou item;
  final bool updated;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-item',
          locations: {Routes.mastermindInboxItemPath(item.id)},
          title: item.title,
          showLeadingBrand: false,
        ),
        if (updated)
          AppGroupedSection.spaced(
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
        AppGroupedSection.spaced(
          children: [
            AppGroupedRow(
              title: Text(item.title),
              subtitle: Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  if (item.kind case final kind?)
                    AppBadge(
                      child: Text(MastermindLabels.itemKind(l10n, kind)),
                    ),
                  if (item.product case final product?)
                    AppBadge.outline(
                      child: Text(MastermindLabels.product(product)),
                    ),
                ],
              ),
            ),
            if (item.body.isNotEmpty) AppGroupedRow(title: Text(item.body)),
          ],
        ),
        ItemReplySection(item: item),
      ],
    );
  }
}
