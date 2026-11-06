import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Letters and digits joined by spaces, underscores or hyphens, with no other
/// punctuation: the only shape an option identifier can take.
final _identifierShape = RegExp(r'^[A-Za-z0-9]+(?:[ _-]+[A-Za-z0-9]+)*$');

/// The words of an identifier: split on separators and camelCase humps.
List<String> _words(String key) => key
    .replaceAllMapped(
      RegExp('([a-z0-9])([A-Z])'),
      (m) => '${m.group(1)} ${m.group(2)}',
    )
    .split(RegExp('[ _-]+'))
    .where((word) => word.isNotEmpty)
    .toList();

/// Whether [label] is a ledger identifier (`entity_phuc`, `ENTITY-PHUC`,
/// `entity_Phuc`, `entityPhuc`, `entity phuc`) rather than written words
/// ("Approve", "Ship tonight", "OK").
bool isOptionIdentifier(String label) {
  if (!_identifierShape.hasMatch(label)) return false;
  if (label.contains(RegExp('[_-]'))) return true;
  if (RegExp('[a-z][A-Z]').hasMatch(label)) return true;
  final letters = label.replaceAll(RegExp('[^A-Za-z]'), '');
  if (letters.isEmpty) return false;
  if (letters == letters.toLowerCase()) return true;
  // All caps reads as an identifier once it is longer than an initialism.
  return letters == letters.toUpperCase() && letters.length > 3;
}

/// The plain-language label for option [index] of [item].
///
/// The hub's short `hub_options` label wins ([NeedsYou.optionLabel]). When the
/// lane published only ledger identifiers, the ask text usually explains each
/// one ("ENTITY_PHUC: the company, with you as contact"); that explanation is
/// used, matched whatever the identifier's case or separators. Failing that,
/// the identifier reads as words in sentence case ("Entity phuc"), so a raw
/// key never reaches the screen. Wire answers keep using [NeedsYou.options];
/// this is display text only.
String plainOptionLabel(NeedsYou item, int index) {
  final label = item.optionLabel(index).trim();
  if (!isOptionIdentifier(label)) return label;
  final words = _words(label);
  return _explained(item.body, words) ?? _sentence(words.join(' '));
}

String _sentence(String text) {
  final lower = text.toLowerCase();
  return lower[0].toUpperCase() + lower.substring(1);
}

/// "key: explanation" (or `=`, `-`, `–`, `—`) at the start of a line or list
/// item of [body], where key is [words] in any case, joined by any separator
/// or none. Cut at the end of that line.
String? _explained(String body, List<String> words) {
  final key = words.map(RegExp.escape).join('[ _-]*');
  final match = RegExp(
    r'^[ \t]*(?:[-*•]|\d+[.)])?[ \t]*[`"“]?' +
        key +
        r'[`"”]?[ \t]*(?:[:=–—]|-(?=\s))[ \t]*(.+)$',
    multiLine: true,
    caseSensitive: false,
  ).firstMatch(body);
  final explanation = match?.group(1)?.trim();
  if (explanation == null || explanation.isEmpty) return null;
  final text = explanation.runes.length > 80
      ? '${String.fromCharCodes(explanation.runes.take(79)).trimRight()}…'
      : explanation;
  return text[0].toUpperCase() + text.substring(1);
}
