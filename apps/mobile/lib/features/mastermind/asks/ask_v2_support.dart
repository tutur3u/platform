// Shared vocabulary for the Mastermind Inbox `ask-v2` contract. The TS mirror
// is `packages/types/src/mastermind/ask-v2.ts`; the two read one fixture to
// one normalized snapshot (see `ask_card_contract_test.dart`).

/// The Inbox tier an ask belongs to.
enum AskInboxClass {
  urgent('urgent'),
  decision('decision'),
  fyi('fyi');

  const AskInboxClass(this.wireName);
  final String wireName;
}

/// Why an ask needs extra care before it can be answered. `normal` is no risk.
///
/// [unknown] is never published: it is what a present but unrecognised
/// `risk_class` (an unknown string, a number, an object) reads as, so the
/// risk gate fails CLOSED. An absent `risk_class` stays null (old hub data).
enum AskRiskClass {
  deploy('deploy'),
  spend('spend'),
  credential('credential'),
  security('security'),
  normal('normal'),
  unknown('unknown');

  const AskRiskClass(this.wireName);
  final String wireName;
}

/// The hub's push-v2 urgency (`now|today|soon|whenever`). Not the same
/// vocabulary as `AskUrgency`, which the detail endpoint publishes.
enum AskInboxUrgency {
  now('now'),
  today('today'),
  soon('soon'),
  whenever('whenever');

  const AskInboxUrgency(this.wireName);
  final String wireName;
}

/// Where the hub says an ask was resolved (`resolved_via`).
enum AskResolvedVia {
  mobile('mobile'),
  discord('discord'),
  mac('mac'),
  agent('agent');

  const AskResolvedVia(this.wireName);
  final String wireName;
}

/// The hub row `status`.
enum AskStatus {
  open('open'),
  resolved('resolved'),
  expired('expired');

  const AskStatus(this.wireName);
  final String wireName;
}

/// The lifecycle a card is in, from the row's `state` and `status`.
enum AskPhase {
  open('open'),
  answered('answered'),
  withdrawn('withdrawn'),
  expired('expired');

  const AskPhase(this.wireName);
  final String wireName;
}

/// Why a card is incomplete, in the fixed order the card reports them.
enum AskIncompleteReason {
  missingQuestion('missing_question'),
  missingText('missing_text'),
  truncated('truncated'),
  textIncomplete('text_incomplete'),
  missingOptions('missing_options');

  const AskIncompleteReason(this.wireName);
  final String wireName;
}

/// One answer choice: a stable [id], the [label] shown, and an optional
/// one-line consequence [note].
final class AskOption {
  const AskOption({required this.id, required this.label, this.note});

  final String id;
  final String label;
  final String? note;

  Map<String, Object?> toJson() => {'id': id, 'label': label, 'note': note};
}

const maxAskOptionId = 64;
const maxAskNote = 200;
const maxAskWhy = 280;

final _timestamp = RegExp(
  r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$',
);

bool _leap(int year) => (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;

int _daysInMonth(int year, int month) => month == 2
    ? (_leap(year) ? 29 : 28)
    : const [4, 6, 9, 11].contains(month)
    ? 30
    : 31;

/// A timezone-aware ISO timestamp as a UTC instant (whole seconds), or null.
/// Naive, date-only and out-of-range values are invalid. Checked by hand so
/// Dart and TS agree on every input.
DateTime? parseAskTimestamp(Object? value) {
  if (value is! String) return null;
  final match = _timestamp.firstMatch(value);
  if (match == null) return null;
  int part(int group) => int.parse(match.group(group)!);
  final year = part(1);
  final month = part(2);
  final day = part(3);
  if (year < 1970 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > _daysInMonth(year, month) ||
      part(4) > 23 ||
      part(5) > 59 ||
      part(6) > 59) {
    return null;
  }
  var offsetSeconds = 0;
  final zone = match.group(7)!;
  if (zone != 'Z') {
    final hours = int.parse(zone.substring(1, 3));
    final minutes = int.parse(zone.substring(4, 6));
    if (hours > 23 || minutes > 59) return null;
    offsetSeconds = (hours * 60 + minutes) * 60 * (zone[0] == '-' ? -1 : 1);
  }
  final utc = DateTime.utc(
    year,
    month,
    day,
    part(4),
    part(5),
    part(6),
  ).subtract(Duration(seconds: offsetSeconds));
  return utc.year > 9999 ? null : utc;
}

/// `YYYY-MM-DDTHH:MM:SSZ`.
String formatAskTimestamp(DateTime value) {
  String two(int n) => n.toString().padLeft(2, '0');
  final utc = value.toUtc();
  return '${utc.year.toString().padLeft(4, '0')}-${two(utc.month)}-'
      '${two(utc.day)}T${two(utc.hour)}:${two(utc.minute)}:${two(utc.second)}Z';
}
