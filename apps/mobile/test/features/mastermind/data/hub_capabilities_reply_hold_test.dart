import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';

Uint8List _body(Map<String, Object?> json) =>
    Uint8List.fromList(utf8.encode(jsonEncode(json)));

void main() {
  const base = {
    'schema_versions': ['1.4'],
    'replies': true,
    'push': false,
  };

  test('reply_hold defaults off when absent', () {
    expect(MastermindCapabilities.parse(_body(base))?.replyHold, isFalse);
  });

  test('reply_hold is read when present, alone or with iris', () {
    expect(
      MastermindCapabilities.parse(
        _body({...base, 'reply_hold': true}),
      )?.replyHold,
      isTrue,
    );
    final both = MastermindCapabilities.parse(
      _body({...base, 'iris': true, 'reply_hold': false}),
    );
    expect(both?.iris, isTrue);
    expect(both?.replyHold, isFalse);
  });

  test('a non-bool reply_hold or an unknown extra key fails closed', () {
    expect(
      MastermindCapabilities.parse(_body({...base, 'reply_hold': 'yes'})),
      isNull,
    );
    expect(MastermindCapabilities.parse(_body({...base, 'x': true})), isNull);
  });
}
