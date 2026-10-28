import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/threads/v1_threads.dart';

void main() {
  test(
    'real v1 snapshot lists lanes with id keys and no history references',
    () {
      final json =
          jsonDecode(
                File(
                  'test/features/mastermind/threads/v1_sample_redacted.json',
                ).readAsStringSync(),
              )
              as Map<String, dynamic>;
      final model = V1Threads(json);
      expect(model.lanes.single.id, 'item-cccccccccccccccccccc');
      expect(model.lanes.single.title, '[Atlas] Mastermind');
      expect(model.lanes.single.topLevel, isTrue);
      expect(model.counts, {'running': 0, 'waiting': 0, 'idle': 1});
      expect(model.lanes.single.matches('atlas', 'idle'), isTrue);
      expect(model.lanes.single.matches('atlas', 'running'), isFalse);
      expect(json['lanes'].toString(), isNot(contains('thread_ref')));
    },
  );
}
