import 'package:html/parser.dart' as html;
import 'package:mobile/features/chat/models/chat_models.dart';

/// Character references as HTML5 reads them in text: numeric ones and
/// names, each with or without the closing semicolon (`&amp`, `&#38`), as
/// web's `html-entities` decodes in body scope.
final _characterReference = RegExp(
  '&(?:#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[A-Za-z][A-Za-z0-9]*;?)',
);
final _url = RegExp(r'''https?://[^\s<>"']+''', caseSensitive: false);
final _urlTrailingPunctuation = RegExp(r'[.,;:!?)\]]+$');
final _asciiPunctuation = RegExp(r'''[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]''');
final _leadingSpaces = RegExp('^[ \t]+', multiLine: true);

const _cacheCapacity = 500;
final _cache = <String, ({String text, String markdown})>{};

/// Message text as web displays it. Bridged external chat stores HTML
/// character references, decoded here up to three passes as web does; one
/// reference is decoded at a time, so decoded `<` and `>` never become
/// markup. Other messages are returned as written.
String chatMessageDisplayContent(ChatMessage message) =>
    _external(message)?.text ?? message.content;

/// Markdown for the message bubble. Bridged external chat text is shown as
/// written, as web shows it: its punctuation is escaped so decoded text is
/// never read as formatting, and its links stay tappable.
String chatMessageMarkdown(ChatMessage message) =>
    _external(message)?.markdown ?? message.content;

({String text, String markdown})? _external(ChatMessage message) {
  if (message.metadata['externalChat'] != true) return null;
  final key = '${message.id}\n${message.content}';
  final hit = _cache.remove(key);
  if (hit != null) return _cache[key] = hit;
  final text = decodeChatCharacterReferences(message.content);
  final entry = (text: text, markdown: chatLiteralMarkdown(text));
  _cache[key] = entry;
  while (_cache.length > _cacheCapacity) {
    _cache.remove(_cache.keys.first);
  }
  return entry;
}

/// [content] with its character references decoded, up to three passes.
String decodeChatCharacterReferences(String content) {
  var decoded = content;
  for (var pass = 0; pass < 3; pass++) {
    final next = decoded.replaceAllMapped(
      _characterReference,
      (match) => html.parseFragment(match[0]).text ?? match[0]!,
    );
    if (next == decoded) break;
    decoded = next;
  }
  return decoded;
}

/// Markdown that renders [text] literally: links become autolinks (their
/// trailing punctuation stays text, as web splits it), every other ASCII
/// punctuation mark is escaped, and leading indentation cannot start a code
/// block.
String chatLiteralMarkdown(String text) {
  final buffer = StringBuffer();
  var last = 0;
  for (final match in _url.allMatches(text)) {
    final raw = match[0]!;
    final url = raw.replaceFirst(_urlTrailingPunctuation, '');
    buffer
      ..write(_escape(text.substring(last, match.start)))
      ..write(url.isEmpty ? '' : '<$url>')
      ..write(_escape(raw.substring(url.length)));
    last = match.end;
  }
  buffer.write(_escape(text.substring(last)));
  return buffer.toString();
}

String _escape(String text) => text
    .replaceAllMapped(_asciiPunctuation, (match) => '\\${match[0]}')
    .replaceAllMapped(_leadingSpaces, (match) => '\u00A0' * match[0]!.length);
