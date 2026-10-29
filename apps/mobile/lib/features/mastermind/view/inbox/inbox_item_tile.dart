import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/decision_card_actions.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/l10n/l10n.dart';

/// One ask with a meaningful title, metadata and a two-line ask preview.
///
/// The state line is the hub's word first (Resolved, Answered on Mac,
/// Withdrawn), then this device's reply (Sent · waiting for Mastermind). The
/// preview stays visible separately. Open asks expose inline choices, which
/// animate out when the ask is answered elsewhere; a summary tap pushes the
/// full ask and composer, so Back returns to this list with its filters intact.
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
      MastermindAnsweredElsewhereCubit,
      Map<String, AnsweredElsewhere>,
      AnsweredElsewhere?
    >(
      bloc: MastermindRepliesWatcher.answeredOf(context),
      selector: (state) => state[item.id],
      builder: (context, elsewhere) =>
          BlocSelector<
            MastermindRepliesCubit,
            MastermindRepliesState,
            (OutboxEntry?, ReplyItemStatus)
          >(
            bloc: replies,
            selector: (state) => (
              state.entryFor(item.id, item.versionHash),
              state.statusFor(item.id),
            ),
            builder: (context, value) =>
                _row(context, value.$1, value.$2, elsewhere),
          ),
    );
  }

  Widget _row(
    BuildContext context,
    OutboxEntry? entry,
    ReplyItemStatus status,
    AnsweredElsewhere? elsewhere,
  ) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final title = item.hubTitle ?? itemDisplayTitle(l10n, item);
    final kind = item.kind;
    final kindLabel = kind == null
        ? null
        : MastermindLabels.itemKind(l10n, kind);
    final detail = elsewhere != null
        ? [answeredViaText(l10n, elsewhere.via), ?elsewhere.option].join(' · ')
        : [?_state(l10n, entry, status), ?_age(l10n, locale)].join(' · ');
    final answeredCheck =
        elsewhere != null ||
        (item.state == ItemState.answered && item.answeredVia != null);
    final preview = item.hubText ?? askPreviewText(item);
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
    final row = Semantics(
      button: true,
      label: [
        ?kindLabel,
        title,
        if (item.product case final product?) MastermindLabels.product(product),
        if (item.by case final by?) l10n.mastermindAskedBy(by),
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
          maxLines: item.hubTitle != null ? null : (large ? 2 : 1),
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
                if (item.by case final by?)
                  AppBadge.outline(child: Text(l10n.mastermindAskedBy(by))),
                if (answeredCheck) const Icon(AppIcons.check, size: 14),
                Text(
                  detail,
                  key: ValueKey('ask-state-${item.id}'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
            if (preview.isNotEmpty)
              Text(
                preview,
                key: ValueKey('ask-preview-${item.id}'),
                maxLines: item.hubText != null ? null : 2,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        showChevron: true,
        onTap: open,
      ),
    );
    if (item.state != ItemState.open) return row;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        row,
        // Answered elsewhere: the choices fold away rather than vanish.
        AnimatedSwitcher(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : AppMotion.normal,
          switchInCurve: AppMotion.standard,
          switchOutCurve: AppMotion.standard,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: SizeTransition(
              sizeFactor: animation,
              alignment: Alignment.topCenter,
              child: child,
            ),
          ),
          child: elsewhere != null
              ? const SizedBox(
                  key: ValueKey('answered'),
                  width: double.infinity,
                )
              : Padding(
                  key: const ValueKey('actions'),
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: DecisionCardActions(item: item),
                ),
        ),
      ],
    );
  }

  String? _state(
    AppLocalizations l10n,
    OutboxEntry? entry,
    ReplyItemStatus status,
  ) {
    if (item.state == ItemState.withdrawn) {
      return l10n.mastermindWithdrawnNoLongerNeeded;
    }
    if (item.state == ItemState.answered) {
      if (item.answeredVia case final via?) {
        return [?item.resolution, ...answeredByParts(l10n, via)].join(' · ');
      }
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
      // The inline reply panel owns the accepted status and answer.
      return entry.status == OutboxStatus.sent
          ? null
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

  /// Resolved rows sit under their GMT+7 day, so they read the time ("06:21");
  /// open ones read their age.
  String? _age(AppLocalizations l10n, String locale) {
    if (item.state != ItemState.open && item.resolvedAt != null) {
      return Gmt7.time(item.resolvedAt!, locale);
    }
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
