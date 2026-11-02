import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/asks/ask_card.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_chips.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_options.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/linkified_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// Where the card sits, which sets how much of it is clamped.
enum MastermindAskCardVariant {
  /// An Inbox list row: the full text clamps to 4 lines, with 4 options.
  list(textLines: 4, options: 4),

  /// Inline in Chat: compact, 2 lines of text and 3 options.
  chat(textLines: 2, options: 3),

  /// The detail page: nothing is clamped.
  detail(textLines: null, options: null);

  const MastermindAskCardVariant({
    required this.textLines,
    required this.options,
  });

  final int? textLines;
  final int? options;
}

/// The Inbox ask card. It always shows the question, the full text, every
/// option (the recommended one marked, with its reason) and the status chips,
/// so a decision never needs a tap to be understood.
///
/// An incomplete card (see [AskCard.incomplete]) says so, keeps its options
/// visible but disabled, and offers only [onOpen]. A risky ask never answers on
/// one tap: its options are read-only and the action opens the detail, where
/// the biometric gate lives. [onSelectOption] receives the wire option index.
class MastermindAskCard extends StatefulWidget {
  const MastermindAskCard({
    required this.ask,
    required this.title,
    this.variant = MastermindAskCardVariant.list,
    this.now,
    this.onOpen,
    this.onSelectOption,
    this.optionsOverride,
    this.disabledNote,
    this.statusLine,
    super.key,
  });

  final InboxAsk ask;

  /// The display title (the hub's title, or the first line of the ask).
  final String title;
  final MastermindAskCardVariant variant;

  /// The section clock; without it no age and no overdue state is shown.
  final DateTime? now;

  /// Opens the full question. Null hides every action that needs it.
  final VoidCallback? onOpen;

  /// Picks an option by its wire index. Null shows the options disabled.
  final ValueChanged<int>? onSelectOption;

  /// Replaces the options while a reply is sending or has been sent.
  final Widget? optionsOverride;

  /// Why options cannot be picked right now (for example "Checking...").
  final String? disabledNote;

  /// This device's reply state ("Not sent · tap to retry"). Tapping it opens
  /// the ask, where a queued reply is retried.
  final String? statusLine;

  @override
  State<MastermindAskCard> createState() => _MastermindAskCardState();
}

class _MastermindAskCardState extends State<MastermindAskCard> {
  bool _textExpanded = false;
  bool _optionsExpanded = false;

  AskCard get _card => widget.ask.card;

  /// Option positions with the recommended one first.
  List<int> get _order {
    final all = [for (var i = 0; i < _card.options.length; i++) i];
    final first = all.where(_isRecommended).toList();
    return [...first, ...all.where((i) => !first.contains(i))];
  }

  bool _isRecommended(int position) =>
      _card.recommendedId != null &&
      _card.options[position].id == _card.recommendedId;

  bool get _answerable =>
      _card.phase == AskPhase.open &&
      !_card.incomplete &&
      !_card.risky &&
      widget.onSelectOption != null;

  VoidCallback? _tapFor(int position) {
    final index = widget.ask.optionIndexes[position];
    final select = widget.onSelectOption;
    if (!_answerable || index == null || select == null) return null;
    return () => select(index);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final locale = Localizations.localeOf(context).toString();
    final now = widget.now ?? DateTime.now();
    final large = mastermindLargeText(context);
    final chips = askChipSpecs(l10n, widget.ask, locale: locale, now: now);
    final text = _card.text;
    final recommended = _card.recommendedLabel;
    final order = _order;
    final limit = widget.variant.options;
    final collapsed =
        limit != null && order.length > limit && !_optionsExpanded;
    final shown = collapsed ? order.take(limit) : order;
    final hidden = order.length - shown.length;
    final created = widget.ask.createdAt;
    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: [
        for (final chip in chips) chip.label,
        widget.title,
        if (recommended != null)
          l10n.mastermindAskCardRecommendedOption(recommended),
        if (order.isNotEmpty) l10n.mastermindAskCardOptionCount(order.length),
      ].join('. '),
      hint: widget.onOpen == null ? null : l10n.mastermindOpensItem,
      onTap: widget.onOpen,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ExcludeSemantics(
              child: InkWell(
                onTap: widget.onOpen,
                borderRadius: BorderRadius.circular(AppRadius.xs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (chips.isNotEmpty)
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [for (final chip in chips) chip.build()],
                      ),
                    if (chips.isNotEmpty) const SizedBox(height: AppSpacing.sm),
                    Text(
                      widget.title,
                      key: ValueKey('ask-title-${_card.id}'),
                      maxLines:
                          widget.variant == MastermindAskCardVariant.detail ||
                              large
                          ? null
                          : 3,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.large.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (text != null) ...[
              const SizedBox(height: AppSpacing.sm),
              _ClampedText(
                textKey: ValueKey('ask-preview-${_card.id}'),
                text: text,
                maxLines: widget.variant.textLines,
                expanded: _textExpanded,
                onToggle: () => setState(() => _textExpanded = !_textExpanded),
              ),
            ],
            if (_card.incomplete) ...[
              const SizedBox(height: AppSpacing.sm),
              AskNotice(
                key: ValueKey('ask-incomplete-${_card.id}'),
                tone: AppTone.warning,
                icon: LucideIcons.triangleAlert,
                text: l10n.mastermindAskCardIncompleteMessage,
              ),
            ] else if (_card.phase == AskPhase.expired) ...[
              const SizedBox(height: AppSpacing.sm),
              AskNotice(
                tone: AppTone.warning,
                icon: LucideIcons.hourglass,
                text: l10n.mastermindAskCardExpiredMessage,
              ),
            ],
            if (widget.optionsOverride case final override?) ...[
              const SizedBox(height: AppSpacing.sm),
              override,
            ] else if (order.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              for (final position in shown)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AskOptionTile(
                    key: ValueKey('ask-option-${_card.id}-$position'),
                    option: _card.options[position],
                    recommended: _isRecommended(position),
                    why: _card.recommendedWhy,
                    onTap: _tapFor(position),
                  ),
                ),
              if (limit != null && order.length > limit)
                AskDisclosureRow(
                  key: ValueKey('ask-more-options-${_card.id}'),
                  label: _optionsExpanded
                      ? l10n.mastermindAskCardFewerOptions
                      : l10n.mastermindAskCardMoreOptions(hidden),
                  expanded: _optionsExpanded,
                  onTap: () =>
                      setState(() => _optionsExpanded = !_optionsExpanded),
                ),
            ],
            if (widget.statusLine case final line?)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: InkWell(
                  onTap: widget.onOpen,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      minHeight: askCardMinTarget,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        line,
                        key: ValueKey('ask-state-${_card.id}'),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.small.copyWith(
                          color: c.mutedForeground,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            if (widget.disabledNote case final note?)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(
                  note,
                  style: tokens.typography.small.copyWith(
                    color: c.mutedForeground,
                  ),
                ),
              ),
            if (widget.ask.by != null ||
                (created != null && widget.now != null))
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: _Context(
                  by: widget.ask.by,
                  at: created,
                  show: widget.now != null,
                ),
              ),
            ?_action(l10n),
          ],
        ),
      ),
    );
  }

  Widget? _action(AppLocalizations l10n) {
    final open = widget.onOpen;
    if (open == null ||
        widget.variant == MastermindAskCardVariant.detail ||
        _card.phase != AskPhase.open ||
        widget.optionsOverride != null) {
      return null;
    }
    if (_card.incomplete) {
      return AppButton.outline(
        key: ValueKey('ask-open-full-${_card.id}'),
        size: AppButtonSize.large,
        onPressed: open,
        leading: const Icon(LucideIcons.externalLink, size: 18),
        child: Text(l10n.mastermindAskCardOpenFull),
      );
    }
    if (_card.risky) {
      return AppButton.primary(
        key: ValueKey('ask-open-biometric-${_card.id}'),
        size: AppButtonSize.large,
        onPressed: open,
        leading: const Icon(LucideIcons.fingerprint, size: 18),
        child: Text(l10n.mastermindAskCardAnswerWithBiometric),
      );
    }
    return AppButton.outline(
      key: ValueKey('ask-reply-words-${_card.id}'),
      size: AppButtonSize.large,
      onPressed: open,
      leading: const Icon(LucideIcons.messageSquareText, size: 18),
      child: Text(l10n.mastermindAskCardReplyInWords),
    );
  }
}

/// "From Atlas · Asked 2 hours ago": the asker and how old the ask is.
class _Context extends StatelessWidget {
  const _Context({required this.by, required this.at, required this.show});

  final String? by;
  final DateTime? at;
  final bool show;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final style = tokens.typography.small.copyWith(
      color: tokens.colorScheme.mutedForeground,
    );
    final time = at;
    return ExcludeSemantics(
      child: Wrap(
        spacing: AppSpacing.sm,
        children: [
          if (by case final by?) Text(l10n.mastermindAskedBy(by), style: style),
          if (show && time != null) MastermindTimeLabel(time, style: style),
        ],
      ),
    );
  }
}

/// The full ask text. It clamps to [maxLines] with an inline toggle that
/// expands in place, and only offers the toggle when the text really overflows.
class _ClampedText extends StatelessWidget {
  const _ClampedText({
    required this.text,
    required this.maxLines,
    required this.expanded,
    required this.onToggle,
    required this.textKey,
  });

  final Key textKey;
  final String text;
  final int? maxLines;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final style = tokens.typography.base.copyWith(
      color: tokens.colorScheme.foreground,
      height: 1.45,
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final limit = maxLines;
        final overflows =
            limit != null &&
            (TextPainter(
              text: TextSpan(text: text, style: style),
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
              maxLines: limit,
            )..layout(maxWidth: constraints.maxWidth)).didExceedMaxLines;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (limit == null || expanded)
              LinkifiedText(text, key: textKey, style: style)
            else
              Text(
                text,
                key: textKey,
                maxLines: limit,
                overflow: TextOverflow.ellipsis,
                style: style,
              ),
            if (overflows)
              AskDisclosureRow(
                label: expanded
                    ? l10n.mastermindAskCardHideFullText
                    : l10n.mastermindAskCardShowFullText,
                expanded: expanded,
                onTap: onToggle,
              ),
          ],
        );
      },
    );
  }
}
