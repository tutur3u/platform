import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

final _url = RegExp(r'https?://[^\s<>"“”]+', caseSensitive: false);

/// Sentence punctuation that ends prose, not the link it follows.
final _trailingProse = RegExp(r"[.,;:!?'’]+$");

/// [raw] without the prose around it: trailing sentence punctuation, and a
/// closing parenthesis that has no opening one inside the link (the link was
/// written in parentheses). Balanced parentheses, as in
/// `https://en.wikipedia.org/wiki/Privacy_(disambiguation)`, stay.
String _trimLink(String raw) {
  var link = raw;
  while (true) {
    final trimmed = link.replaceFirst(_trailingProse, '');
    final opens = '('.allMatches(trimmed).length;
    final closes = ')'.allMatches(trimmed).length;
    final next = trimmed.endsWith(')') && closes > opens
        ? trimmed.substring(0, trimmed.length - 1)
        : trimmed;
    if (next == link) return link;
    link = next;
  }
}

/// Splits [text] into plain runs and http(s) URLs. Prose punctuation and
/// unbalanced closing parentheses stay outside the link.
List<({String text, Uri? uri})> linkRuns(String text) {
  final runs = <({String text, Uri? uri})>[];
  var start = 0;
  for (final match in _url.allMatches(text)) {
    final link = _trimLink(match.group(0)!);
    final uri = Uri.tryParse(link);
    if (uri == null || uri.host.isEmpty) continue;
    if (match.start > start) {
      runs.add((text: text.substring(start, match.start), uri: null));
    }
    runs.add((text: link, uri: uri));
    start = match.start + link.length;
  }
  if (start < text.length) runs.add((text: text.substring(start), uri: null));
  return runs;
}

/// Full, never-ellipsized text whose web links open through the app's link
/// launcher (which honours the browser preference and reports failures).
class LinkifiedText extends StatefulWidget {
  const LinkifiedText(this.text, {this.style, super.key});

  final String text;
  final TextStyle? style;

  @override
  State<LinkifiedText> createState() => _LinkifiedTextState();
}

class _LinkifiedTextState extends State<LinkifiedText> {
  final _recognizers = <TapGestureRecognizer>[];

  void _clear() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    _recognizers.clear();
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  TapGestureRecognizer _recognizer(Uri uri) {
    final recognizer = TapGestureRecognizer()
      ..onTap = () => openMobileLink(context, uri);
    _recognizers.add(recognizer);
    return recognizer;
  }

  @override
  Widget build(BuildContext context) {
    _clear();
    final c = AppTokens.of(context).colorScheme;
    return Text.rich(
      TextSpan(
        children: [
          for (final run in linkRuns(widget.text))
            if (run.uri case final uri?)
              TextSpan(
                text: run.text,
                style: TextStyle(
                  color: c.primary,
                  decoration: TextDecoration.underline,
                  decorationColor: c.primary,
                ),
                recognizer: _recognizer(uri),
              )
            else
              TextSpan(text: run.text),
        ],
      ),
      style: widget.style,
    );
  }
}
