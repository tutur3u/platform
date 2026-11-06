/// What a hub redaction token stood for. The text itself is never shown.
enum RedactionKind { path, link, secret, id, email, number, other }

/// One run of message text: plain words, or a redaction placeholder.
sealed class ThreadTextRun {
  const ThreadTextRun();
}

final class PlainRun extends ThreadTextRun {
  const PlainRun(this.text);
  final String text;
}

final class RedactionRun extends ThreadTextRun {
  const RedactionRun(this.kind, {this.host});
  final RedactionKind kind;

  /// A bare host label for a link (`‹link: github.com›`); never a URL.
  final String? host;
}

final _token = RegExp('‹([^‹›\n]{1,60})›');
final _host = RegExp(r'^(?=.{1,63}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$');

/// Zero-width, bidi-override and C0/C1 control characters other than line
/// breaks and tabs: they can reorder or hide what an agent wrote.
final _invisible = RegExp(
  r'[\u0000-\u0008\u000B-\u001F\u007F-\u009F'
  r'\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]',
);

/// Splits redacted hub text into plain runs and placeholders (D §1.3, §3.7).
///
/// A token the phone does not recognise still becomes a neutral placeholder,
/// so unknown redaction syntax can never leak its contents as plain text.
List<ThreadTextRun> threadTextRuns(String text) {
  final clean = text.replaceAll(_invisible, '');
  final runs = <ThreadTextRun>[];
  var start = 0;
  for (final match in _token.allMatches(clean)) {
    if (match.start > start) {
      runs.add(PlainRun(clean.substring(start, match.start)));
    }
    runs.add(_redaction(match.group(1)!.trim()));
    start = match.end;
  }
  if (start < clean.length) runs.add(PlainRun(clean.substring(start)));
  return runs;
}

RedactionRun _redaction(String body) {
  final lower = body.toLowerCase();
  if (lower.startsWith('link:')) {
    final host = lower.substring(5).trim();
    return RedactionRun(
      RedactionKind.link,
      host: _host.hasMatch(host) ? host : null,
    );
  }
  return RedactionRun(switch (lower) {
    'path' => RedactionKind.path,
    'link' || 'url' => RedactionKind.link,
    'secret' || 'secret withheld' => RedactionKind.secret,
    'id' => RedactionKind.id,
    'email' => RedactionKind.email,
    'number' => RedactionKind.number,
    _ => RedactionKind.other,
  });
}
