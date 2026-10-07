import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

import '../../../helpers/timezone_http_harness.dart';

const _private429 = ApiException(
  message: 'private@example.com token https://private.test/body',
  statusCode: 429,
  retryAfter: 45,
);

class _Repository extends TimezoneSettingsRepository {
  _Repository(DateTime Function() clock) : super(clock: clock);
  bool bypassCoalescing = false;
  @override
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) => bypassCoalescing
      ? loadPersonal()
      : super.readPersonal(userId, timeout: timeout);
  Exception? loadError;
  Exception? saveError;
  Completer<String>? pending;
  int writes = 0;
  @override
  Future<String> loadPersonal() async {
    if (pending != null) return await pending!.future;
    if (loadError != null) throw loadError!;
    return 'UTC';
  }

  @override
  Future<String> loadWorkspace(String id) async => 'UTC';

  @override
  Future<String> savePersonal(String zone) async {
    writes++;
    if (saveError != null) throw saveError!;
    return zone;
  }
}

void main() {
  late _Repository repository;
  late TimezoneSettingsCubit cubit;
  late List<OperationalErrorEvent> events;
  late DateTime now;
  setUp(() {
    now = DateTime.utc(2026);
    repository = _Repository(() => now);
    events = [];
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
      clock: () => now,
      operationalReporter: OperationalErrorReporter(
        sink: (event) async {
          events.add(event);
        },
      ),
    );
  });
  tearDown(() async {
    await cubit.close();
    repository.dispose();
  });

  for (final write in [false, true]) {
    test(
      'real HTTP 429 is sanitized at ${write ? 'write' : 'load'} phase',
      () async {
        var now = DateTime.now();
        final harness = TimezoneHttpHarness(clock: () => now);
        final captured = <OperationalErrorEvent>[];
        final subject = TimezoneSettingsCubit(
          repository: harness.repository,
          deviceLoader: () async => 'UTC',
          clock: () => now,
          operationalReporter: OperationalErrorReporter(
            sink: (event) async {
              captured.add(event);
            },
          ),
        );
        addTearDown(() async {
          await subject.close();
          harness.dispose();
        });
        harness.respond = (_) async =>
            TimezoneHttpHarness.json({'timezone': 'UTC'});
        if (write) {
          await subject.load(userId: 'synthetic-actor', workspaceId: null);
        }
        harness.respond = (_) async => http.Response(
          '{"error":"private@example.com token https://private.test/body"}',
          429,
          headers: {'content-type': 'application/json', 'retry-after': '45'},
        );
        if (write) {
          await subject.save('Europe/London');
        } else {
          await subject.load(userId: 'synthetic-actor', workspaceId: null);
        }
        expect(captured, hasLength(1));
        expect(
          captured.single.phase,
          write
              ? OperationalPhase.timezoneWrite
              : OperationalPhase.timezoneRead,
        );
        expect(captured.single.status, 429);
        expect(captured.single.retryAfterBucket, 'up_to_60s');
        expect(captured.single.fields.toString(), isNot(contains('private')));
        expect(
          captured.single.fields.toString(),
          isNot(contains('synthetic-access')),
        );
        final requests = harness.requests.length;
        if (write) {
          await subject.save('Europe/London');
        } else {
          await subject.reload();
        }
        expect(harness.requests, hasLength(requests));
        expect(captured, hasLength(1));
        now = now.add(const Duration(seconds: 46));
        harness.respond = (_) async =>
            TimezoneHttpHarness.json({'timezone': 'Europe/London'});
        if (write) {
          await subject.save('Europe/London');
        } else {
          await subject.reload();
        }
        expect(subject.state.failed, false);
        expect(subject.state.personal, 'Europe/London');
      },
    );
  }

  test(
    'actual read 429 reports once and cooldown does not create incidents',
    () async {
      repository.loadError = _private429;
      await cubit.load(userId: 'user', workspaceId: null);
      await cubit.reload();
      expect(events, hasLength(1));
      final event = events.single;
      expect(event.phase, OperationalPhase.timezoneRead);
      expect(event.kind, OperationalFailureKind.http);
      expect(event.status, 429);
      expect(event.retryAfterBucket, 'up_to_60s');
      expect(event.fields.toString(), isNot(contains('private')));
      expect(cubit.state.retryAt, now.add(const Duration(seconds: 45)));
      now = now.add(const Duration(seconds: 46));
      repository.loadError = null;
      await cubit.reload();
      expect(cubit.state.failed, false);
      expect(events, hasLength(1));
    },
  );

  test(
    'actual write 429 preserves retry and reports write instead of read',
    () async {
      await cubit.load(userId: 'user', workspaceId: null);
      repository.saveError = _private429;
      await cubit.save('Europe/London');
      await cubit.save('Europe/London');
      expect(events, hasLength(1));
      expect(events.single.phase, OperationalPhase.timezoneWrite);
      expect(events.single.status, 429);
      expect(cubit.state.failedSaveZone, 'Europe/London');
      expect(repository.writes, 1);
      now = now.add(const Duration(seconds: 46));
      repository.saveError = null;
      await cubit.save('Europe/London');
      expect(cubit.state.personal, 'Europe/London');
      expect(cubit.state.failed, false);
    },
  );

  test(
    'ABA failure from a superseded account request is not reported',
    () async {
      final pending = Completer<String>();
      repository
        ..bypassCoalescing = true
        ..pending = pending;
      final first = cubit.load(userId: 'a', workspaceId: null);
      await cubit.load(userId: null, workspaceId: null);
      repository.pending = null;
      await cubit.load(userId: 'a', workspaceId: null);
      pending.completeError(_private429);
      await first;
      expect(events, isEmpty);
      expect(cubit.state.resolved, true);
    },
  );

  test(
    'successful auto write with native failure reports resolution only',
    () async {
      await cubit.close();
      cubit = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () async => throw Exception('private native payload'),
        operationalReporter: OperationalErrorReporter(
          sink: (event) async {
            events.add(event);
          },
        ),
      );
      await cubit.load(userId: 'user', workspaceId: null);
      expect(events, isEmpty);
      await cubit.save('auto');
      expect(repository.writes, 1);
      expect(cubit.state.personal, 'auto');
      expect(cubit.state.failedSaveZone, isNull);
      expect(events, hasLength(1));
      expect(events.single.phase, OperationalPhase.timezoneResolve);
      expect(events.single.fields.toString(), isNot(contains('private')));
    },
  );

  test('closed/logout session failures are not incidents', () async {
    repository.loadError = const ApiException(
      message: 'signed out',
      statusCode: 0,
      failureKind: ApiFailureKind.session,
    );
    await cubit.load(userId: 'user', workspaceId: null);
    expect(events, isEmpty);
  });

  test('throwing sink leaves state and retry functional', () async {
    await cubit.close();
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
      clock: () => now,
      operationalReporter: OperationalErrorReporter(
        sink: (_) => throw StateError('sink failed'),
      ),
    );
    repository.loadError = _private429;
    await cubit.load(userId: 'user', workspaceId: null);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.failed, true);
    now = now.add(const Duration(seconds: 46));
    repository.loadError = null;
    await cubit.reload();
    expect(cubit.state.resolved, true);
  });
}
