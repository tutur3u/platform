import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/local_search.dart';

void main() {
  test('server ILIKE whole query, accents, whitespace and wildcards', () {
    expect(localIlike('Coffee beans', 'COFFEE BE'), isTrue);
    expect(localIlike('Coffee beans', 'beans coffee'), isFalse);
    expect(localIlike('Café', 'cafe'), isFalse);
    expect(localIlike('Café', 'CAFÉ'), isTrue);
    expect(localIlike('Coffee beans', 'Coffee  beans'), isFalse);
    expect(localIlike('Coffee beans', 'C%_beans'), isTrue);
    expect(localIlike('100% real', r'100\%'), isTrue);
    expect(localIlike('1000 real', r'100\%'), isFalse);
    expect(localIlike(null, 'coffee'), isFalse);
    expect(localIlike('A\u{1F34E}B', 'A_B'), isTrue);
    expect(localIlike('line\nbreak', 'line_break'), isTrue);
  });
  test('query compilation has no process-global private query cache', () {
    final first = compileLocalIlike('Coffee%beans');
    final source = File('lib/core/cache/local_search.dart').readAsStringSync();
    // RegExp itself may intern identical patterns; the search module must not
    // retain a separate process-global map of raw user queries.
    expect(
      RegExp(
        r'^\s*(?:final|const|var)\s+\w+\s*=\s*<String,\s*RegExp>',
        multiLine: true,
      ).hasMatch(source),
      isFalse,
    );
    expect(first.hasMatch('Coffee roasted beans'), isTrue);
    expect(first.hasMatch('Coffee beans'), isTrue);
    expect(first.hasMatch('Tea beans'), isFalse);
    for (var i = 0; i < 70; i++) {
      compileLocalIlike('distinct query $i');
    }
    final recompiled = compileLocalIlike('Coffee%beans');
    expect(recompiled.hasMatch('Coffee roasted beans'), isTrue);
    expect(localIlike(null, ''), isTrue);
  });
}
