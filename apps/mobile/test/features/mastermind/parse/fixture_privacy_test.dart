import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

void main() {
  test('committed fixture contains only synthetic safe values', () {
    final text = File(
      'assets/dev/mastermind/sample_snapshot.json',
    ).readAsStringSync();
    for (final pattern in [
      r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',
      '[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}',
      'https?://',
      'gh[a-z]*_',
      r'eyJ[A-Za-z0-9_-]+\.',
      r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
      r'(?:/Users/|/home/|~[/\\])',
    ]) {
      expect(RegExp(pattern).hasMatch(text), isFalse);
    }
    expect(jsonDecode(text), MastermindSnapshotBuilder.defaults().toJson());
    final ids = <String>[];
    void visit(Object? value) {
      if (value is Map<String, dynamic>) {
        for (final entry in value.entries) {
          if (entry.key == 'id') ids.add(entry.value as String);
          visit(entry.value);
        }
      } else if (value is List) {
        value.forEach(visit);
      }
    }

    visit(jsonDecode(text));
    expect(ids, isNotEmpty);
    for (final id in ids) {
      expect(
        RegExp(r'^(?:item-[a-f0-9]{20}|d_[a-f0-9]{12})$').hasMatch(id),
        isTrue,
      );
    }
  });
}
