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
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One ask in the Inbox list, in two lines: the friendly title, then the kind
/// badge with the ask's state and age.
///
/// The state line is the hub's word first (Resolved), then this device's
/// reply (Sent · waiting for Mastermind), then a one-line preview of the ask.
/// The full ask, its options and the composer live on the detail page, which
/// a tap pushes so Back returns to this list with its filters intact.
class InboxItemTile extends StatelessWidget {
  const InboxItemTile({
    required this.item,
    this.now,
    this.showKind = false,
    super.key,
  });

  final NeedsYou item;
  final bool showKind;

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
    void open() {
      if (status.issue != null && entry != null) {
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
      label: [?kindLabel, title, if (detail.isNotEmpty) detail].join('. '),
      hint: l10n.mastermindOpensItem,
      onTap: open,
      excludeSemantics: true,
      child: AppGroupedRow(
        title: Text(
          title,
          maxLines: large ? 2 : 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Row(
          children: [
            if (showKind && kindLabel != null) ...[
              AppBadge(
                variant: item.state == ItemState.answered
                    ? AppBadgeVariant.outline
                    : AppBadgeVariant.secondary,
                leading: item.state == ItemState.answered
                    ? const Icon(AppIcons.check, size: 12)
                    : null,
                child: Text(kindLabel),
              ),
              const SizedBox(width: AppSpacing.xs),
            ],
            if (detail.isNotEmpty)
              Expanded(
                child: Text(
                  detail,
                  maxLines: large ? 2 : 1,
                  overflow: TextOverflow.ellipsis,
                ),
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
    if (status.issue != null) return l10n.mastermindReplyFailedShort;
    if (entry != null) {
      return entry.status == OutboxStatus.sent
          ? l10n.mastermindReplySent
          : l10n.mastermindReplyPendingShort;
    }
    final body = item.body.trim();
    if (isOpenOnMacStandIn(body) || body == item.title.trim()) return null;
    return body.replaceAll(RegExp(r'\s+'), ' ');
  }

  String? _age(AppLocalizations l10n) {
    final at = item.resolvedAt;
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
