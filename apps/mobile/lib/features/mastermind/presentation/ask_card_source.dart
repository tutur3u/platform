import 'package:mobile/features/mastermind/asks/ask_card.dart';
import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';

/// A hub snapshot ask as the Inbox [AskCard], plus how each card option maps
/// back to the wire `option_index` the reply outbox sends.
///
/// The card is a view: the strict snapshot parser still owns what is accepted,
/// and the X1 [AskCard] still owns what is normalized and what is incomplete.
final class InboxAsk {
  const InboxAsk({
    required this.card,
    required this.optionIndexes,
    required this.reversible,
    this.by,
    this.createdAt,
    this.deadlineBucket,
    this.product,
    this.legacyUrgency,
  });

  final AskCard card;

  /// For each entry of [AskCard.options], its index in [NeedsYou.options], or
  /// null when it cannot be matched to one (then it is never answerable).
  final List<int?> optionIndexes;

  /// `reversible`, when the hub said so.
  final bool? reversible;

  /// The asker (`by`), when published.
  final String? by;
  final DateTime? createdAt;

  /// The coarse deadline bucket, for an ask without an absolute `deadline_at`.
  final AskDeadline? deadlineBucket;
  final Product? product;

  /// The publisher's `low|normal|high|urgent`, distinct from the hub's tier.
  final AskUrgency? legacyUrgency;
}

/// Reads [item] into an [InboxAsk]. [now] is injectable so the derived tier is
/// deterministic in tests.
InboxAsk inboxAskFor(NeedsYou item, {DateTime? now}) {
  final v2 = item.askV2;
  final selectable = selectableOptions(item);
  final recommended = [
    for (final (index, label) in selectable)
      if (item.optionRecommended(index)) label,
  ].firstOrNull;
  final detail = AskDetail(
    id: item.id,
    versionHash: item.versionHash,
    title: _title(item),
    askText: _text(item),
    options: [for (final (_, label) in selectable) label],
    recommendedOption: recommended,
    urgency: item.urgency,
    deadline: item.deadline,
    deadlineAt: v2.deadlineAt,
    reversible: v2.reversible,
    createdAt: item.createdAt,
    kind: item.kind,
    state: item.state,
    status: v2.status,
    askTruncated: item.askTruncated,
    textComplete: v2.textComplete,
    optionsV2: v2.optionsV2,
    recommendedId: v2.recommendedId,
    recommendedWhy: v2.recommendedWhy,
    inboxClass: v2.inboxClass,
    // A legacy `urgent` ask stays in the Urgent tier without `inbox_class`.
    inboxUrgency:
        v2.inboxUrgency ??
        (item.urgency == AskUrgency.urgent ? AskInboxUrgency.now : null),
    riskClass: v2.riskClass,
    updatedAt: v2.updatedAt,
    resolvedVia: v2.resolvedVia,
  );
  final card = AskCard.fromDetail(detail, now: now);
  final indexes = v2.optionsV2.isEmpty
      ? [for (final (index, _) in selectable) index]
      : _v2WireIndexes(item, selectable, card.options);
  return InboxAsk(
    card: card,
    optionIndexes: List.unmodifiable(indexes),
    reversible: v2.reversible,
    by: item.by,
    createdAt: item.createdAt,
    deadlineBucket: item.deadline,
    product: item.product,
    legacyUrgency: item.urgency,
  );
}

String? _title(NeedsYou item) {
  final hub = item.hubTitle?.trim();
  if (hub != null && hub.isNotEmpty) return hub;
  final title = item.title.trim();
  if (title.isNotEmpty && !isRedactedTitle(title)) return title;
  final first = item.body.trim().split(RegExp(r'\r?\n')).first.trim();
  return first.isEmpty ? null : first;
}

String? _text(NeedsYou item) {
  final hub = item.hubText?.trim();
  if (hub != null && hub.isNotEmpty) return hub;
  if (isOpenOnMacStandIn(item.body)) return null;
  // When the first ask line is the title, the text starts after it; a
  // one-line ask keeps its line so it is not mistaken for missing text.
  final rest = askPreviewText(item);
  return rest.isNotEmpty ? rest : item.body.trim();
}

/// Maps v2 options to wire `option_index`es. The hub publishes no index on
/// `options_v2`, so the label is the only join key; it is trusted only when
/// it is unambiguous. Any duplicate label (among the v2 options or among the
/// wire options) disables one-tap for the whole card (every index null) so a
/// tap can never send a different option than the one shown.
List<int?> _v2WireIndexes(
  NeedsYou item,
  List<(int, String)> selectable,
  List<AskOption> options,
) {
  final shown = [for (final option in options) option.label];
  final ambiguous =
      shown.toSet().length != shown.length ||
      _hasDuplicates([for (final (_, plain) in selectable) plain]) ||
      _hasDuplicates([
        for (final (index, _) in selectable) item.options[index],
      ]);
  if (ambiguous) return List<int?>.filled(options.length, null);
  return [for (final label in shown) _wireIndex(item, selectable, label)];
}

bool _hasDuplicates(List<String> labels) =>
    labels.toSet().length != labels.length;

int? _wireIndex(NeedsYou item, List<(int, String)> selectable, String label) {
  int? match;
  for (final (index, plain) in selectable) {
    if (plain == label || item.options[index] == label) {
      if (match != null) return null;
      match = index;
    }
  }
  return match;
}

/// Whether [item] needs approval on a trusted device, so it is never answered
/// by one tap or in a batch: the card is risky, or `risk_class` is null while
/// the snapshot carries other p2 inbox fields (fail closed). Iris writes are
/// still off, so such an ask cannot be answered from the phone yet.
bool isRiskyAsk(NeedsYou item) =>
    inboxAskFor(item).card.risky ||
    (item.askV2.riskClass == null && item.askV2.hasP2Fields);
