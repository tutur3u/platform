import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/sources/api_exception.dart';

void main() {
  test(
    'envelope excludes raw errors, arbitrary status and release metadata',
    () async {
      final events = <OperationalErrorEvent>[];
      OperationalErrorReporter(
        sink: (event) async {
          events.add(event);
        },
        appVersion: 'private@example.com',
        appBuild: 'token https://private.test',
      ).report(
        OperationalPhase.assistantCreate,
        const ApiException(
          message: 'private prompt personality memory token URL',
          statusCode: 999999,
          retryAfter: 999999,
          code: 'private code',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(events.single.fields, {
        'schema': 'mobile_operational_v1',
        'phase': 'assistantCreate',
        'failure_kind': 'http',
        'retry_after_bucket': 'over_5m',
        'app_version': 'unknown',
        'app_build': 'unknown',
      });
    },
  );

  test('bounded dedup evicts oldest and admits after five minutes', () {
    var now = DateTime.utc(2026);
    final dedup = BoundedFailureDeduplicator(capacity: 2, clock: () => now);
    expect(dedup.admit('a'), true);
    expect(dedup.admit('a'), false);
    expect(dedup.admit('b'), true);
    expect(dedup.admit('c'), true);
    expect(dedup.admit('a'), true);
    expect(dedup.admit('c'), false);
    now = now.add(const Duration(minutes: 5));
    expect(dedup.admit('c'), true);
  });

  test('dedup separates phases/status and buckets retry delay', () async {
    final events = <OperationalErrorEvent>[];
    final reporter = OperationalErrorReporter(
      sink: (event) async {
        events.add(event);
      },
      appVersion: '1.2.3',
      appBuild: '123',
    );
    const error = ApiException(
      message: 'private',
      statusCode: 429,
      retryAfter: 45,
    );
    reporter
      ..report(OperationalPhase.timezoneRead, error)
      ..report(OperationalPhase.timezoneRead, error)
      ..report(OperationalPhase.timezoneWrite, error)
      ..report(
        OperationalPhase.timezoneRead,
        const ApiException(message: 'private', statusCode: 500),
      );
    await Future<void>.delayed(Duration.zero);
    expect(events, hasLength(3));
    expect(events.first.appVersion, '1.2.3');
    expect(events.first.appBuild, '123');
    expect(events.first.retryAfterBucket, 'up_to_60s');
  });

  for (final asynchronous in [false, true]) {
    test('sink failure is isolated, async=$asynchronous', () async {
      OperationalErrorReporter(
        sink: (_) {
          if (asynchronous) return Future<void>.error(StateError('private'));
          throw StateError('private');
        },
      ).report(OperationalPhase.assistantReply, TimeoutException('private'));
      await Future<void>.delayed(Duration.zero);
    });
  }
}
