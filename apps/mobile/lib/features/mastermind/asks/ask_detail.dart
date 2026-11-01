import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/enums.dart';

/// What the person is asked to do to settle an ask.
enum AskActionKind {
  answer('answer'),
  runOnMac('run_on_mac'),
  physical('physical'),
  fyi('fyi');

  const AskActionKind(this.wireName);
  final String wireName;
}

/// Where an answer was recorded. Any other wire value is [elsewhere].
enum AskAnsweredVia {
  phone('phone'),
  mac('mac'),
  chat('chat'),
  auto('auto'),
  batch('batch'),
  elsewhere('');

  const AskAnsweredVia(this.wireName);
  final String wireName;
}

/// One published link. Only an `https` URL on the public-domain allowlist
/// ([isAllowedAskLink]) is ever kept, so nothing else reaches the launcher.
final class AskLink {
  const AskLink({required this.label, required this.url});

  final String label;
  final Uri url;
}

/// `tuturuuu.com` and its subdomains, over https, with no credentials.
bool isAllowedAskLink(Uri uri) {
  final host = uri.host.toLowerCase();
  return uri.scheme == 'https' &&
      uri.userInfo.isEmpty &&
      (host == 'tuturuuu.com' || host.endsWith('.tuturuuu.com'));
}

/// The optional full ask from `GET /v1/asks/<id>`, approved for non-sensitive
/// items only (a sensitive item is a 404). Every field beyond the identity is
/// optional; the page renders a section only when its field is present. Held
/// in memory by the page only, never cached on disk.
final class AskDetail {
  const AskDetail({
    required this.id,
    required this.versionHash,
    this.title,
    this.askText,
    this.options = const [],
    this.recommendedOption,
    this.reason,
    this.defaultOptionIndex,
    this.urgency,
    this.deadline,
    this.deadlineAt,
    this.reversible,
    this.category,
    this.blocksCount,
    this.ownerName,
    this.createdAt,
    this.actionKind,
    this.actionSummary,
    this.risk,
    this.links = const [],
    this.answeredVia,
    this.body,
    this.kind,
    this.state,
    this.status,
    this.askTruncated,
    this.textComplete,
    this.optionsV2 = const [],
    this.recommendedId,
    this.recommendedWhy,
    this.inboxClass,
    this.inboxUrgency,
    this.riskClass,
    this.updatedAt,
    this.resolvedVia,
  });

  final String id;
  final String versionHash;
  final String? title;
  final String? askText;
  final List<String> options;
  final String? recommendedOption;
  final String? reason;
  final int? defaultOptionIndex;
  final AskUrgency? urgency;
  final AskDeadline? deadline;
  final DateTime? deadlineAt;
  final bool? reversible;
  final String? category;
  final int? blocksCount;
  final String? ownerName;
  final DateTime? createdAt;
  final AskActionKind? actionKind;
  final String? actionSummary;
  final String? risk;
  final List<AskLink> links;
  final AskAnsweredVia? answeredVia;

  // ask-v2 (all optional; see `ask_card.dart` for how they are normalized).
  final String? body;
  final ItemKind? kind;
  final ItemState? state;
  final AskStatus? status;
  final bool? askTruncated;
  final bool? textComplete;

  /// `options_v2`; empty when absent or unusable (one bad entry voids it).
  final List<AskOption> optionsV2;
  final String? recommendedId;
  final String? recommendedWhy;
  final AskInboxClass? inboxClass;

  /// The hub's `now|today|soon|whenever`; distinct from [urgency].
  final AskInboxUrgency? inboxUrgency;
  final AskRiskClass? riskClass;
  final DateTime? updatedAt;
  final AskResolvedVia? resolvedVia;

  /// The option applied when nobody answers; null when absent or invalid.
  String? get defaultOption {
    final index = defaultOptionIndex;
    if (index == null || index < 0 || index >= options.length) return null;
    return options[index];
  }
}

const _maxAskText = 20000;
const _maxShortText = 2000;
const _maxLabel = 200;
const _maxOptions = 8;
const _maxLinks = 20;
final _itemId = RegExp(r'^item-[a-f0-9]{20}$');
final _versionHash = RegExp(r'^[a-f0-9]{64}$');

/// Non-strict parser: unknown keys are ignored and an unknown enum or a
/// malformed optional field is absent. Only a missing or malformed identity
/// rejects the payload (null).
AskDetail? parseAskDetail(Object? json) {
  if (json is! Map<String, dynamic>) return null;
  final id = json['id'];
  final versionHash = json['version_hash'];
  if (id is! String || !_itemId.hasMatch(id)) return null;
  if (versionHash is! String || !_versionHash.hasMatch(versionHash)) {
    return null;
  }
  final options = _options(json['options']);
  final blocks = json['blocks_count'];
  final via = json['answered_via'];
  return AskDetail(
    id: id,
    versionHash: versionHash,
    title: _text(json['title'], _maxLabel),
    askText: _text(json['ask_text'], _maxAskText),
    options: options,
    recommendedOption: _text(json['recommended_option'], _maxLabel),
    reason: _text(json['reason'], _maxShortText),
    defaultOptionIndex: _index(json['default_option_index'], options),
    urgency: AskUrgency.fromWire(json['urgency']),
    deadline: AskDeadline.fromWire(json['deadline']),
    deadlineAt: parseAskTimestamp(json['deadline_at']),
    reversible: json['reversible'] is bool ? json['reversible'] as bool : null,
    category: _text(json['category'], _maxLabel),
    blocksCount: blocks is int && blocks >= 0 ? blocks : null,
    ownerName: _text(json['owner_name'], _maxLabel),
    createdAt: _time(json['created_at']),
    actionKind: _enum(
      AskActionKind.values,
      json['action_kind'],
      (v) => v.wireName,
    ),
    actionSummary: _text(json['action_summary'], _maxShortText),
    risk: _text(json['risk'], _maxShortText),
    links: _links(json['links']),
    answeredVia: via is String && via.isNotEmpty
        ? _enum(AskAnsweredVia.values, via, (v) => v.wireName) ??
              AskAnsweredVia.elsewhere
        : null,
    body: _text(json['body'], _maxAskText),
    kind: _enum(ItemKind.values, json['kind'], (v) => v.wireName),
    state: _enum(ItemState.values, json['state'], (v) => v.wireName),
    status: _enum(AskStatus.values, json['status'], (v) => v.wireName),
    askTruncated: _flag(json['ask_truncated']),
    textComplete: _flag(json['text_complete']),
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
    riskClass: _enum(
      AskRiskClass.values,
      json['risk_class'],
      (v) => v.wireName,
    ),
    updatedAt: parseAskTimestamp(json['updated_at']),
    resolvedVia: _enum(
      AskResolvedVia.values,
      json['resolved_via'],
      (v) => v.wireName,
    ),
  );
}

bool? _flag(Object? value) => value is bool ? value : null;

/// All-or-nothing: one bad entry (or a duplicate id) voids the list, so an
/// option is never silently dropped.
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

DateTime? _time(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toUtc() : null;

List<String> _options(Object? value) {
  if (value is! List || value.length > _maxOptions) return const [];
  final options = <String>[];
  for (final option in value) {
    final text = _text(option, _maxLabel);
    if (text == null) return const [];
    options.add(text);
  }
  return List.unmodifiable(options);
}

int? _index(Object? value, List<String> options) =>
    value is int && value >= 0 && value < options.length ? value : null;

List<AskLink> _links(Object? value) {
  if (value is! List) return const [];
  final links = <AskLink>[];
  for (final row in value.take(_maxLinks)) {
    if (row is! Map<String, dynamic>) continue;
    final url = _allowed(row['url']);
    final label = _text(row['label'], _maxLabel);
    if (url == null || label == null) continue;
    links.add(AskLink(label: label, url: url));
  }
  return List.unmodifiable(links);
}

Uri? _allowed(Object? value) {
  if (value is! String || value.length > 2048) return null;
  final uri = Uri.tryParse(value.trim());
  return uri != null && isAllowedAskLink(uri) ? uri : null;
}
