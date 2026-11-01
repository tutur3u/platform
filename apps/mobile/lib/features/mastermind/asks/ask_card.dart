import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/enums.dart';

/// The normalized Inbox card both platforms render from: a view over an
/// [AskDetail], not a second model. The TS mirror is `parseAskCard` in
/// `packages/types/src/mastermind/ask-v2.ts`.
///
/// Rules:
/// - `options_v2` / `recommended_id` win when `options_v2` is usable, else
///   `options` (positional ids `opt-N`) and `recommended_option` (a label);
/// - [inboxClass] is the explicit `inbox_class`, else derived (see
///   [deriveInboxClass]);
/// - the card is INCOMPLETE when its question text or options are missing.
final class AskCard {
  const AskCard({
    required this.id,
    required this.versionHash,
    required this.title,
    required this.text,
    required this.options,
    required this.recommendedId,
    required this.recommendedLabel,
    required this.recommendedWhy,
    required this.inboxClass,
    required this.urgency,
    required this.deadlineAt,
    required this.riskClass,
    required this.phase,
    required this.kind,
    required this.incompleteReasons,
    required this.updatedAt,
    required this.resolvedVia,
  });

  factory AskCard.fromDetail(AskDetail detail, {DateTime? now}) {
    final phase = _phase(detail);
    final fromV2 = detail.optionsV2.isNotEmpty;
    final options = fromV2
        ? detail.optionsV2
        : [
            for (var i = 0; i < detail.options.length; i++)
              AskOption(id: 'opt-$i', label: detail.options[i]),
          ];
    final recommended =
        (fromV2 ? _byId(options, detail.recommendedId) : null) ??
        _byLabel(options, detail.recommendedOption);
    final inboxClass = deriveInboxClass(detail, phase, now ?? DateTime.now());
    final text = detail.askText ?? detail.body;
    final reasons = <AskIncompleteReason>[
      if (detail.title == null) AskIncompleteReason.missingQuestion,
      if (text == null) AskIncompleteReason.missingText,
      if (detail.askTruncated == true) AskIncompleteReason.truncated,
      if (detail.textComplete == false) AskIncompleteReason.textIncomplete,
      if (options.isEmpty &&
          inboxClass != AskInboxClass.fyi &&
          detail.kind != ItemKind.fyi)
        AskIncompleteReason.missingOptions,
    ];
    return AskCard(
      id: detail.id,
      versionHash: detail.versionHash,
      title: detail.title,
      text: text,
      options: List.unmodifiable(options),
      recommendedId: recommended?.id,
      recommendedLabel: recommended?.label,
      recommendedWhy: recommended == null ? null : detail.recommendedWhy,
      inboxClass: inboxClass,
      urgency: detail.inboxUrgency,
      deadlineAt: detail.deadlineAt,
      riskClass: detail.riskClass,
      phase: phase,
      kind: detail.kind,
      incompleteReasons: List.unmodifiable(reasons),
      updatedAt: detail.updatedAt,
      resolvedVia: detail.resolvedVia,
    );
  }

  /// Reads one ask row (a hub snapshot row or a `GET /v1/asks/<id>` body).
  /// Null only for a malformed identity. [now] is injectable so derivation is
  /// deterministic in tests.
  static AskCard? parse(Object? json, {DateTime? now}) {
    final detail = parseAskDetail(json);
    return detail == null ? null : AskCard.fromDetail(detail, now: now);
  }

  final String id;
  final String versionHash;
  final String? title;

  /// The full text: `ask_text`, else `body`.
  final String? text;
  final List<AskOption> options;
  final String? recommendedId;
  final String? recommendedLabel;
  final String? recommendedWhy;
  final AskInboxClass inboxClass;
  final AskInboxUrgency? urgency;
  final DateTime? deadlineAt;
  final AskRiskClass? riskClass;
  final AskPhase phase;
  final ItemKind? kind;
  final List<AskIncompleteReason> incompleteReasons;
  final DateTime? updatedAt;
  final AskResolvedVia? resolvedVia;

  bool get incomplete => incompleteReasons.isNotEmpty;

  /// A non-null, non-`normal` risk class: never answered with one tap.
  bool get risky => riskClass != null && riskClass != AskRiskClass.normal;

  /// The snapshot shape asserted against `ask-v2.normalized.json`.
  Map<String, Object?> toJson() => {
    'id': id,
    'version_hash': versionHash,
    'title': title,
    'text': text,
    'options': [for (final option in options) option.toJson()],
    'recommended_id': recommendedId,
    'recommended_label': recommendedLabel,
    'recommended_why': recommendedWhy,
    'inbox_class': inboxClass.wireName,
    'urgency': urgency?.wireName,
    'deadline_at': deadlineAt == null ? null : formatAskTimestamp(deadlineAt!),
    'risk_class': riskClass?.wireName,
    'risky': risky,
    'phase': phase.wireName,
    'kind': kind?.wireName,
    'incomplete': incomplete,
    'incomplete_reasons': [for (final r in incompleteReasons) r.wireName],
    'updated_at': updatedAt == null ? null : formatAskTimestamp(updatedAt!),
    'resolved_via': resolvedVia?.wireName,
  };
}

AskPhase _phase(AskDetail detail) {
  if (detail.status == AskStatus.expired) return AskPhase.expired;
  if (detail.state == ItemState.answered ||
      detail.status == AskStatus.resolved) {
    return AskPhase.answered;
  }
  return detail.state == ItemState.withdrawn
      ? AskPhase.withdrawn
      : AskPhase.open;
}

AskOption? _byId(List<AskOption> options, String? id) {
  if (id == null) return null;
  for (final option in options) {
    if (option.id == id) return option;
  }
  return null;
}

AskOption? _byLabel(List<AskOption> options, String? label) {
  if (label == null) return null;
  for (final option in options) {
    if (option.label == label) return option;
  }
  return null;
}

/// Explicit `inbox_class` wins. Otherwise an open ask past its `deadline_at`
/// is urgent; then `now` is urgent, `today`/`soon` are decisions and
/// `whenever` is FYI. With no urgency, a `fyi` kind is FYI and the rest are
/// decisions. Closed (expired, answered, withdrawn) asks are never promoted
/// by a deadline.
AskInboxClass deriveInboxClass(AskDetail detail, AskPhase phase, DateTime now) {
  final explicit = detail.inboxClass;
  if (explicit != null) return explicit;
  final deadline = detail.deadlineAt;
  if (phase == AskPhase.open &&
      deadline != null &&
      deadline.millisecondsSinceEpoch ~/ 1000 <
          now.millisecondsSinceEpoch ~/ 1000) {
    return AskInboxClass.urgent;
  }
  return switch (detail.inboxUrgency) {
    AskInboxUrgency.now => AskInboxClass.urgent,
    AskInboxUrgency.today || AskInboxUrgency.soon => AskInboxClass.decision,
    AskInboxUrgency.whenever => AskInboxClass.fyi,
    null =>
      detail.kind == ItemKind.fyi ? AskInboxClass.fyi : AskInboxClass.decision,
  };
}
