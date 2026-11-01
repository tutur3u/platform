import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/asks/ask_card.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';

// The shared ask-v2 contract: the same fixture the TS zod parser reads in
// packages/types/src/mastermind/ask-v2.test.ts, and the normalized snapshot
// that parser writes. Both sides must agree with that one file.
const _dir = '../../packages/types/src/mastermind/fixtures';

Map<String, dynamic> _read(String name) =>
    jsonDecode(File('$_dir/$name').readAsStringSync()) as Map<String, dynamic>;

void main() {
  final fixture = _read('ask-v2.fixture.json');
  final now = DateTime.parse(fixture['now'] as String);
  final rows = (fixture['rows'] as List).cast<Map<String, dynamic>>();

  test('reads the shared fixture to the shared normalized snapshot', () {
    final snapshot = _read('ask-v2.normalized.json');
    expect(snapshot['now'], fixture['now']);
    final cards = [for (final row in rows) AskCard.parse(row, now: now)!];
    expect([for (final card in cards) card.toJson()], snapshot['cards']);
  });

  test('has the agreed 14-row mix', () {
    final cards = [for (final row in rows) AskCard.parse(row, now: now)!];
    int count(bool Function(AskCard) test) => cards.where(test).length;
    expect(cards, hasLength(14));
    expect(count((c) => c.inboxClass == AskInboxClass.urgent), 4);
    expect(count((c) => c.inboxClass == AskInboxClass.decision), 7);
    expect(count((c) => c.inboxClass == AskInboxClass.fyi), 3);
    expect(count((c) => c.incomplete), 1);
    expect(count((c) => c.risky), 1);
    expect(count((c) => c.phase == AskPhase.expired), 1);
  });
}
