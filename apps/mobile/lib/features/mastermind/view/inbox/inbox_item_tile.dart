import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/option_labels.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/replies/answered_elsewhere_cubit.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_timing_chips.dart';
import 'package:mobile/features/mastermind/view/inbox/decision_card_actions.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_replies_watcher.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_status_panel.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
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
    this.askCard = false,
    super.key,
  });

  final NeedsYou item;
  final bool showKind;
  final bool showKindIcon;

  /// Shows an open ask as the Inbox ask card (the Inbox list). Compact
  /// surfaces such as Home keep the row.
  final bool askCard;

  /// The section clock. Without it no age is shown.
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
    // An open ask shows as the Inbox ask card: the question, its full text and
    // every option, never a title alone. Closed asks, and an ask answered on
    // another device, keep the compact row below.
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final title = item.hubTitle ?? itemDisplayTitle(l10n, item);
    final kind = item.kind;
    final kindLabel = kind == null
        ? null
        : MastermindLabels.itemKind(l10n, kind);
    final answeredCheck =
        elsewhere != null ||
        (item.state == ItemState.answered && item.answeredVia != null);
    // Resolved rows sit under their GMT+7 day, so they read the time ("06:21");
    // open ones read their age as a relative time label.
    final resolvedTime = item.state != ItemState.open && item.resolvedAt != null
        ? Gmt7.time(item.resolvedAt!, locale)
        : null;
    final state = elsewhere != null
        ? [answeredViaText(l10n, elsewhere.via), ?elsewhere.option].join(' · ')
        : [?_state(l10n, entry, status), ?resolvedTime].join(' · ');
    final at = elsewhere != null || resolvedTime != null ? null : _at;
    final preview = item.hubText ?? askPreviewText(item);
    void open() => _open(context, status, entry);

    final exactTime = GlobalKey<TooltipState>();
    final large = mastermindLargeText(context);
    Widget buildRow(String? spokenAge) => Semantics(
      button: true,
      label: [
        if (item.state == ItemState.open && elsewhere == null)
          ...askTimingSpoken(l10n, item),
        ?kindLabel,
        title,
        if (item.product case final product?) MastermindLabels.product(product),
        if (item.by case final by?) l10n.mastermindAskedBy(by),
        ?(state.isEmpty ? null : state),
        ?spokenAge,
        if (preview.isNotEmpty) spokenAskSummary(preview),
      ].join('. '),
      hint: l10n.mastermindOpensItem,
      onTap: open,
      customSemanticsActions: {
        if (at != null)
          CustomSemanticsAction(label: l10n.mastermindRelShowExact): () {
            exactTime.currentState?.ensureTooltipVisible();
          },
      },
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
                if (item.state == ItemState.open && elsewhere == null)
                  ...askTimingChips(l10n, item),
                if (showKind && kindLabel != null)
                  MastermindStatusChip(label: kindLabel),
                if (item.product case final product?)
                  MastermindStatusChip(
                    label: MastermindLabels.product(product),
                  ),
                if (item.by case final by?)
                  MastermindStatusChip(label: l10n.mastermindAskedBy(by)),
                if (answeredCheck) const Icon(AppIcons.check, size: 14),
                if (state.isNotEmpty)
                  Text(
                    state,
                    key: ValueKey('ask-state-${item.id}'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (at != null) MastermindTimeLabel(at, tooltipKey: exactTime),
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
    // The spoken age is recomputed on every clock tick, not cached with the
    // rest of the row, so a screen reader never hears a stale "5 minutes ago".
    final row = at == null
        ? buildRow(null)
        : MastermindClockBuilder(
            builder: (context, now) => buildRow(
              mastermindSpokenTime(
                l10n,
                at,
                now: now,
                zone: mastermindTimeZoneOf(context),
                locale: locale,
              ),
            ),
          );
    if (item.state != ItemState.open) return row;
    // In the Inbox list the card carries the title, so the compact row only
    // shows once the ask was answered elsewhere.
    final cardMode = askCard;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!cardMode || elsewhere != null) row,
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
              : cardMode
              ? KeyedSubtree(
                  key: const ValueKey('actions'),
                  child: _askCard(context, status, entry),
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

  /// A tap retries only when the reply is still queued and the device was
  /// offline, then pushes the full ask and composer.
  void _open(BuildContext context, ReplyItemStatus status, OutboxEntry? entry) {
    if (_canRetry(status, entry)) {
      unawaited(
        MastermindRepliesWatcher.cubitOf(
          context,
        ).retry(item.id, item.versionHash),
      );
    }
    unawaited(context.push<void>(Routes.mastermindInboxItemPath(item.id)));
  }

  /// This device's reply state, only when it says more than "Open".
  String? _cardStatus(
    AppLocalizations l10n,
    OutboxEntry? entry,
    ReplyItemStatus status,
  ) => status.issue == null && entry == null
      ? null
      : _state(l10n, entry, status);

  Widget _askCard(
    BuildContext context,
    ReplyItemStatus status,
    OutboxEntry? entry,
  ) {
    final l10n = context.l10n;
    final replies = MastermindRepliesWatcher.cubitOf(context);
    final ask = inboxAskFor(item, now: now);
    return BlocBuilder<MastermindRepliesCubit, MastermindRepliesState>(
      bloc: replies,
      builder: (context, state) {
        final pending = state.pendingOptionFor(item.id, item.versionHash);
        final queued = state.entryFor(item.id, item.versionHash);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ReplyIssueBanner(issue: state.statusFor(item.id).issue),
            MastermindAskCard(
              ask: ask,
              title: item.hubTitle ?? itemDisplayTitle(l10n, item),
              now: now,
              statusLine: _cardStatus(l10n, queued, status),
              onOpen: () => _open(context, status, entry),
              onSelectOption: state.canReply
                  ? (index) =>
                        replies.queueOption(item: item, optionIndex: index)
                  : null,
              disabledNote: state.canReply
                  ? null
                  : switch (state.capability) {
                      ReplyCapability.unknown ||
                      ReplyCapability.checking => l10n.mastermindReplyChecking,
                      ReplyCapability.unavailable =>
                        l10n.mastermindReplyCheckFailed,
                      _ => l10n.mastermindReplyOnMac,
                    },
              optionsOverride: pending != null
                  ? ReplyUndoBar(
                      option: plainOptionLabel(item, pending.optionIndex),
                      onUndo: pending.committed
                          ? null
                          : () => replies.undoOption(item.id),
                    )
                  : queued != null
                  ? ReplyEntryPanel(
                      entry: queued,
                      status: state.statusFor(item.id),
                      replies: replies,
                    )
                  : null,
            ),
          ],
        );
      },
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

  /// The instant the age is for; none without the section clock.
  DateTime? get _at => now == null ? null : item.createdAt ?? item.resolvedAt;
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
  Widget build(BuildContext context) => MastermindStatusChip(
    icon: recommended ? LucideIcons.star : null,
    tone: recommended ? AppTone.primary : AppTone.neutral,
    label: recommended
        ? context.l10n.mastermindOptionRecommended(option)
        : option,
  );
}
