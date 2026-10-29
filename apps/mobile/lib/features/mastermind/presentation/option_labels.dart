import 'package:mobile/features/mastermind/model/snapshot.dart';

/// A ledger option keyword such as `entity_phuc` or `entity phuc`: lower case
/// words joined by spaces, underscores or hyphens, with no punctuation.
final _keyword = RegExp(r'^[a-z0-9]+(?:[ _-][a-z0-9]+)*$');

/// The plain-language label for option [index] of [item].
///
/// The hub's short `hub_options` label wins ([NeedsYou.optionLabel]). When the
/// lane published only ledger keywords, the ask text usually explains each
/// one ("entity phuc: the company, with you as contact"); that explanation is
/// used. Failing that, the keyword reads as words in sentence case, so a raw
/// key (`entity_phuc`) never reaches the screen. Wire answers keep using
/// [NeedsYou.options]; this is display text only.
String plainOptionLabel(NeedsYou item, int index) {
  final label = item.optionLabel(index).trim();
  if (!_keyword.hasMatch(label)) return label;
  return _explained(item.body, label) ?? _words(label);
}

String _words(String keyword) {
  final words = keyword.replaceAll(RegExp('[_-]'), ' ');
  return words[0].toUpperCase() + words.substring(1);
}

/// "keyword: explanation" (or `=`, `-`, `–`, `—`) at the start of a line or
/// list item of [body], cut at the end of that line.
String? _explained(String body, String keyword) {
  final spaced = RegExp.escape(keyword).replaceAll(RegExp('[ _-]'), '[ _-]');
  final match = RegExp(
    '^[ \\t]*(?:[-*•]|\\d+[.)])?[ \\t]*[`"“]?$spaced[`"”]?[ \\t]*(?:[:=–—]|-(?=\\s))[ \\t]*(.+)\$',
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
