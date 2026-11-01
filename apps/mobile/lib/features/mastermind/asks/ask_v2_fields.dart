import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';

const _maxLabel = 200;
const _maxOptions = 8;

/// The hub's optional Inbox fields (p1: `updated_at`, `status`,
/// `resolved_via`; p2: `options_v2`, `recommended_id`, `recommended_why`,
/// `inbox_class`, `deadline_at`, `risk_class`, plus `urgency`,
/// `text_complete` and `reversible`).
///
/// Read tolerantly and identically by the ask detail parser and the strict
/// snapshot parser: an unknown enum, a malformed value or an oversized string
/// leaves that field absent. Nothing here ever throws, and one bad `options_v2`
/// entry voids the whole list (never a silently trimmed one) so the card falls
/// back to the legacy `options`.
final class AskV2Fields {
  const AskV2Fields({
    this.status,
    this.updatedAt,
    this.resolvedVia,
    this.optionsV2 = const [],
    this.recommendedId,
    this.recommendedWhy,
    this.inboxClass,
    this.inboxUrgency,
    this.deadlineAt,
    this.riskClass,
    this.textComplete,
    this.reversible,
  });

  factory AskV2Fields.read(Map<String, dynamic> json) => AskV2Fields(
    status: _enum(AskStatus.values, json['status'], (v) => v.wireName),
    updatedAt: parseAskTimestamp(json['updated_at']),
    resolvedVia: _enum(
      AskResolvedVia.values,
      json['resolved_via'],
      (v) => v.wireName,
    ),
    optionsV2: _optionsV2(json['options_v2']),
    recommendedId: _text(json['recommended_id'], maxAskOptionId),
    recommendedWhy: _text(json['recommended_why'], maxAskWhy),
    inboxClass: _enum(
      AskInboxClass.values,
      json['inbox_class'],
      (v) => v.wireName,
    ),
    inboxUrgency: _enum(
      AskInboxUrgency.values,
      json['urgency'],
      (v) => v.wireName,
    ),
    deadlineAt: parseAskTimestamp(json['deadline_at']),
    riskClass: _enum(
      AskRiskClass.values,
      json['risk_class'],
      (v) => v.wireName,
    ),
    textComplete: json['text_complete'] is bool
        ? json['text_complete'] as bool
        : null,
    reversible: json['reversible'] is bool ? json['reversible'] as bool : null,
  );

  /// The keys the strict snapshot parser accepts beyond its legacy set.
  static const keys = [
    'status',
    'updated_at',
    'resolved_via',
    'options_v2',
    'recommended_id',
    'recommended_why',
    'inbox_class',
    'deadline_at',
    'risk_class',
    'text_complete',
    'reversible',
  ];

  final AskStatus? status;
  final DateTime? updatedAt;
  final AskResolvedVia? resolvedVia;
  final List<AskOption> optionsV2;
  final String? recommendedId;
  final String? recommendedWhy;
  final AskInboxClass? inboxClass;

  /// The hub's `now|today|soon|whenever`; distinct from the legacy
  /// `AskUrgency` read from the same `urgency` key.
  final AskInboxUrgency? inboxUrgency;
  final DateTime? deadlineAt;
  final AskRiskClass? riskClass;
  final bool? textComplete;
  final bool? reversible;
}

const askV2FieldsEmpty = AskV2Fields();

List<AskOption> _optionsV2(Object? value) {
  if (value is! List || value.length > _maxOptions) return const [];
  final options = <AskOption>[];
  for (final row in value) {
    if (row is! Map<String, dynamic>) return const [];
    final id = _text(row['id'], maxAskOptionId);
    final label = _text(row['label'], _maxLabel);
    if (id == null || label == null) return const [];
    if (options.any((option) => option.id == id)) return const [];
    options.add(
      AskOption(id: id, label: label, note: _text(row['note'], maxAskNote)),
    );
  }
  return List.unmodifiable(options);
}

T? _enum<T>(List<T> values, Object? wire, String Function(T) name) {
  for (final value in values) {
    if (name(value) == wire) return value;
  }
  return null;
}

String? _text(Object? value, int max) {
  if (value is! String) return null;
  final trimmed = value.trim();
  if (trimmed.isEmpty || trimmed.runes.length > max) return null;
  return trimmed;
}
