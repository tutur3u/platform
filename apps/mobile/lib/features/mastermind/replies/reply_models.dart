/// The hub rejects longer text with 413 or 400, so the composer never lets it
/// reach the wire. Counted in code points, as the Worker counts them.
const mastermindReplyTextLimit = 500;

/// A Needs-you item with nothing real to pick carries this single option. It is
/// a pointer to the Mac, never a choice: the Worker answers 400 if it is sent.
const mastermindReplyPlaceholderOption = 'Reply on Mac';

/// How long a queued or sent reply is remembered on the device.
const mastermindOutboxRetention = Duration(days: 7);

const _maxOutboxEntries = 50;

enum OutboxStatus {
  /// Persisted, not yet accepted by the hub. Retried with the same key.
  pending,

  /// Accepted (201, or 200 for a replay). Kept only so the item shows its state
  /// until the next snapshot drops it.
  sent,
}

/// One reply on its way to the hub.
///
/// [idempotencyKey] is generated once, stored before the first send and reused
/// by every retry, so a lost response can never turn into a second reply.
final class OutboxEntry {
  const OutboxEntry({
    required this.idempotencyKey,
    required this.itemId,
    required this.versionHash,
    required this.createdAt,
    this.status = OutboxStatus.pending,
    this.optionIndex,
    this.optionLabel,
    this.text,
  }) : assert(
         (optionIndex == null) != (text == null),
         'A reply carries an option index or text, never both.',
       );

  final String idempotencyKey;
  final String itemId;
  final String versionHash;
  final DateTime createdAt;
  final OutboxStatus status;
  final int? optionIndex;

  /// The option as the user saw it, for the confirmation and status copy.
  final String? optionLabel;
  final String? text;

  OutboxEntry withStatus(OutboxStatus next) => OutboxEntry(
    idempotencyKey: idempotencyKey,
    itemId: itemId,
    versionHash: versionHash,
    createdAt: createdAt,
    status: next,
    optionIndex: optionIndex,
    optionLabel: optionLabel,
    text: text,
  );

  /// The closed POST /v1/replies body: exactly one of `option_index` or `text`.
  Map<String, Object> toRequestJson() => {
    'schema_version': '1.4',
    'item_id': itemId,
    'version_hash': versionHash,
    if (optionIndex != null) 'option_index': optionIndex!,
    if (text != null) 'text': text!,
  };

  Map<String, Object> toStoredJson() => {
    'key': idempotencyKey,
    'item_id': itemId,
    'version_hash': versionHash,
    'created_at': createdAt.toUtc().toIso8601String(),
    'status': status.name,
    if (optionIndex != null) 'option_index': optionIndex!,
    if (optionLabel != null) 'option_label': optionLabel!,
    if (text != null) 'text': text!,
  };

  /// Strict: anything off-shape is dropped rather than repaired or sent.
  static OutboxEntry? fromStoredJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final key = raw['key'];
    final item = raw['item_id'];
    final hash = raw['version_hash'];
    final created = raw['created_at'] is String
        ? DateTime.tryParse(raw['created_at'] as String)
        : null;
    final status = OutboxStatus.values.asNameMap()[raw['status']];
    final index = raw['option_index'];
    final label = raw['option_label'];
    final text = raw['text'];
    if (key is! String ||
        !_uuid.hasMatch(key) ||
        item is! String ||
        !_itemId.hasMatch(item) ||
        hash is! String ||
        !_hex64.hasMatch(hash) ||
        created == null ||
        status == null ||
        (index == null) == (text == null) ||
        (index != null && (index is! int || index < 0 || index > 7)) ||
        (text != null && (text is! String || !isValidReplyText(text))) ||
        (label != null && (label is! String || label.length > 200))) {
      return null;
    }
    return OutboxEntry(
      idempotencyKey: key,
      itemId: item,
      versionHash: hash,
      createdAt: created.toUtc(),
      status: status,
      optionIndex: index as int?,
      optionLabel: label as String?,
      text: text as String?,
    );
  }

  static final _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  );
  static final _itemId = RegExp(r'^item-[0-9a-f]{20}$');
  static final _hex64 = RegExp(r'^[0-9a-f]{64}$');
}

/// Entries to keep: unexpired, at most one per item version, and bounded.
List<OutboxEntry> normalizeOutbox(
  Iterable<OutboxEntry> entries, {
  required DateTime now,
}) {
  final seen = <String>{};
  final kept = <OutboxEntry>[];
  for (final entry in entries) {
    final fresh = now.difference(entry.createdAt) < mastermindOutboxRetention;
    if (fresh && seen.add('${entry.itemId}/${entry.versionHash}')) {
      kept.add(entry);
    }
  }
  return kept.length <= _maxOutboxEntries
      ? kept
      : kept.sublist(kept.length - _maxOutboxEntries);
}

/// Non-empty after trimming and within the limit; the hub owns the rest of the
/// text policy and answers `unsafe_text`.
bool isValidReplyText(String text) {
  final trimmed = text.trim();
  return trimmed.isNotEmpty && trimmed.runes.length <= mastermindReplyTextLimit;
}

/// What the user has composed for one item and not yet sent. It outlives a
/// refresh of the item, so a stale answer never costs the user their words.
final class ReplyDraft {
  const ReplyDraft({this.optionIndex, this.optionLabel, this.text = ''});

  final int? optionIndex;
  final String? optionLabel;
  final String text;

  bool get isEmpty => optionIndex == null && text.trim().isEmpty;

  ReplyDraft withOption(int? index, String? label) =>
      ReplyDraft(optionIndex: index, optionLabel: label, text: text);

  ReplyDraft withText(String value) => ReplyDraft(
    optionIndex: optionIndex,
    optionLabel: optionLabel,
    text: value,
  );
}
