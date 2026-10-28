import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One ask with a meaningful title, metadata and a two-line ask preview.
///
/// The state line is the hub's word first (Resolved), then this device's
/// reply (Sent · waiting for Mastermind). The preview stays visible separately.
/// The full ask, its options and the composer live on the detail page, which
/// a tap pushes so Back returns to this list with its filters intact.
class InboxItemTile extends StatelessWidget {
  const InboxItemTile({
    required this.item,
    this.now,
    this.showKind = false,
    this.showKindIcon = false,
    super.key,
  });

  final NeedsYou item;
  final bool showKind;
  final bool showKindIcon;

  /// The section clock, for "5 min ago". Without it no age is shown.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final replies = MastermindRepliesWatcher.cubitOf(context);
    return BlocSelector<
      MastermindRepliesCubit,
      MastermindRepliesState,
      (OutboxEntry?, ReplyItemStatus)
    >(
      bloc: replies,
      selector: (state) =>
          (state.entryFor(item.id, item.versionHash), state.statusFor(item.id)),
      builder: (context, value) => _row(context, value.$1, value.$2),
    );
  }

  Widget _row(
    BuildContext context,
    OutboxEntry? entry,
    ReplyItemStatus status,
  ) {
    final l10n = context.l10n;
    final title = itemDisplayTitle(l10n, item);
    final kind = item.kind;
    final kindLabel = kind == null
        ? null
        : MastermindLabels.itemKind(l10n, kind);
    final detail = [?_state(l10n, entry, status), ?_age(l10n)].join(' · ');
    final preview = askPreviewText(item);
    void open() {
      if (_canRetry(status, entry)) {
        unawaited(
          MastermindRepliesWatcher.cubitOf(
            context,
          ).retry(item.id, item.versionHash),
        );
      }
      unawaited(context.push<void>(Routes.mastermindInboxItemPath(item.id)));
    }

    final large = mastermindLargeText(context);
    return Semantics(
      button: true,
      label: [
        ?kindLabel,
        title,
        if (detail.isNotEmpty) detail,
        if (preview.isNotEmpty) spokenAskSummary(preview),
      ].join('. '),
      hint: l10n.mastermindOpensItem,
      onTap: open,
      excludeSemantics: true,
      child: AppGroupedRow(
        leading: showKindIcon
            ? AppIconTile(
                icon: switch (item.kind) {
                  ItemKind.decision => LucideIcons.diamond,
                  ItemKind.action => LucideIcons.zap,
                  ItemKind.fyi => LucideIcons.info,
                  null => LucideIcons.messageSquareMore,
                },
                tone: item.kind == ItemKind.fyi
                    ? AppTone.neutral
                    : AppTone.warning,
              )
            : null,
        title: Text(
          title,
          key: ValueKey('ask-title-${item.id}'),
          maxLines: large ? 2 : 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                if (showKind && kindLabel != null)
                  AppBadge(child: Text(kindLabel)),
                if (item.product case final product?)
                  AppBadge.outline(
                    child: Text(MastermindLabels.product(product)),
                  ),
                Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
            if (preview.isNotEmpty)
              Text(
                preview,
                key: ValueKey('ask-preview-${item.id}'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        showChevron: true,
        onTap: open,
      ),
    );
  }

  String? _state(
    AppLocalizations l10n,
    OutboxEntry? entry,
    ReplyItemStatus status,
  ) {
    if (item.state == ItemState.answered) {
      return switch (item.resolution) {
        final answer? => l10n.mastermindResolvedWith(answer),
        null => l10n.mastermindResolvedState,
      };
    }
    if (status.issue != null) {
      return _canRetry(status, entry)
          ? l10n.mastermindReplyFailedShort
          : l10n.mastermindReplyNotSentReview;
    }
    if (entry != null) {
      return entry.status == OutboxStatus.sent
          ? l10n.mastermindReplySent
          : l10n.mastermindReplyPendingShort;
    }
    return MastermindLabels.itemState(l10n, item.state);
  }

  /// A tap retries only when the reply is still queued and nothing blocks it:
  /// the device was offline. A 429 waits out its time, a 401 or 403 stays
  /// behind the auth-failure guard, and the other issues dropped the entry, so
  /// for those a tap just opens the detail page.
  bool _canRetry(ReplyItemStatus status, OutboxEntry? entry) =>
      entry != null &&
      entry.status == OutboxStatus.pending &&
      status.issue == ReplyIssue.offline;

  String? _age(AppLocalizations l10n) {
    final at = item.createdAt ?? item.resolvedAt;
    final clock = now;
    if (at == null || clock == null) return null;
    return mastermindAgeText(l10n, clock.difference(at));
  }
}

/// A read-only option. The recommended one carries a star and the word
/// "Recommended", never colour alone.
class OptionChip extends StatelessWidget {
  const OptionChip({
    required this.option,
    required this.recommended,
    super.key,
  });

  final String option;
  final bool recommended;

  @override
  Widget build(BuildContext context) => AppBadge.outline(
    leading: recommended ? const Icon(LucideIcons.star, size: 12) : null,
    child: Text(
      recommended ? context.l10n.mastermindOptionRecommended(option) : option,
    ),
  );
}
