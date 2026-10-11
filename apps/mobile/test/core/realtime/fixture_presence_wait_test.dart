import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'fixture_presence_wait.dart';

void main() {
  const nativeId = 'synthetic-native';
  Map<String, dynamic> observed({required bool present}) => {
    'presence': {
      if (present)
        nativeId: [
          {'user_id': nativeId},
        ],
      'synthetic-web': [
        {'user_id': 'synthetic-web'},
      ],
    },
  };

  test('departure waits for delayed peer propagation beyond 100ms', () async {
    var present = true;
    var reads = 0;
    final propagation = Timer(const Duration(milliseconds: 250), () {
      present = false;
    });
    try {
      final result = await waitForNativeDeparture(() async {
        reads++;
        return observed(present: present);
      }, nativeId);
      expect((result['presence'] as Map<String, dynamic>)[nativeId], isNull);
      expect(reads, greaterThan(1));
      expect(
        (result['presence'] as Map<String, dynamic>)['synthetic-web'],
        isNotNull,
      );
    } finally {
      propagation.cancel();
    }
  });

  test(
    'persistent presence fails within the stated departure budget',
    () async {
      await expectLater(
        waitForNativeDeparture(
          () async => observed(present: true),
          nativeId,
          timeout: const Duration(milliseconds: 80),
        ),
        throwsA(isA<TimeoutException>()),
      );
    },
  );

  test('a stalled observation cannot extend the departure budget', () async {
    final pending = Completer<Map<String, dynamic>>();
    try {
      await expectLater(
        waitForNativeDeparture(
          () => pending.future,
          nativeId,
          timeout: const Duration(milliseconds: 80),
        ).timeout(const Duration(seconds: 1)),
        throwsA(
          isA<TimeoutException>().having(
            (error) => error.duration,
            'departure budget',
            const Duration(milliseconds: 80),
          ),
        ),
      );
    } finally {
      pending.complete(observed(present: false));
    }
  });

  test(
    'an observation failure is propagated, not treated as departure',
    () async {
      final failure = StateError('synthetic observation failed');
      await expectLater(
        waitForNativeDeparture(() async => throw failure, nativeId),
        throwsA(same(failure)),
      );
    },
  );

  test('only the native participant must leave, other peers remain', () async {
    final result = await waitForNativeDeparture(
      () async => observed(present: false),
      nativeId,
    );
    expect((result['presence'] as Map<String, dynamic>)[nativeId], isNull);
    expect(
      (result['presence'] as Map<String, dynamic>)['synthetic-web'],
      isNotNull,
    );
  });
}
