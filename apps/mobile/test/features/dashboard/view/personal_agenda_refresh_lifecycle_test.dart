import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/personal_agenda_scope.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

class _Zones extends Mock implements TimezoneSettingsRepository {
  String personal = 'auto';
  final actors = <String>[];
  @override
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) async {
    actors.add(userId);
    return personal;
  }

  @override
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) async => 'America/Los_Angeles';
}

class _Write {
  _Write(this.key);
  final CacheKey key;
  final gate = Completer<void>();
  void acknowledge() => gate.complete();
  void reject() => gate.completeError(StateError('Owned fixture rejection'));
}

// Controlled storage API acknowledgments only; no disk/durable commit proof.
class _Storage extends Mock implements CacheStore {
  final writes = <_Write>[];
  @override
  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async => CacheReadResult<T>(state: CacheEntryState.missing);
  @override
  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const [],
    int? expectedRevision,
    void Function()? checkScope,
    bool requirePublication = false,
  }) async {
    checkScope?.call();
    final write = _Write(key);
    writes.add(write);
    await write.gate.future;
    checkScope?.call();
  }
}

class _Observed {
  _Observed(this.receipt) {
    unawaited(
      receipt.completion.then<void>(
        (_) {
          done = true;
        },
        onError: (Object e) {
          failure = e;
          done = true;
        },
      ),
    );
  }
  final PersonalAgendaRefreshReceipt receipt;
  bool done = false;
  Object? failure;
}

Future<void> _progress(WidgetTester tester, bool Function() condition) async {
  for (var turn = 0; turn < 50 && !condition(); turn++) {
    await tester.pump();
  }
  expect(condition(), isTrue, reason: 'Owned finite lifecycle phase completed');
}

class _Fixture {
  _Fixture(this.tester, this.workspace);
  static const actor = '33333333-3333-4333-8333-333333333333';
  final WidgetTester tester;
  final String workspace;
  final repository = _Repository();
  final zones = _Zones();
  final storage = _Storage();
  final handle = PersonalAgendaRefreshHandle();
  final observations = <_Observed>[];
  late final TimezoneSettingsCubit settings;
  late CalendarCubit calendar;
  int requests = 0;

  _Observed observeLatest() {
    final receipt = handle.latest!;
    for (final old in observations) {
      if (identical(old.receipt.completion, receipt.completion)) return old;
    }
    final observed = _Observed(receipt);
    observations.add(observed);
    return observed;
  }

  Future<_Observed> mount() async {
    when(
      () => repository.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async {
      requests++;
      return <CalendarEvent>[];
    });
    settings = TimezoneSettingsCubit(
      repository: zones,
      deviceLoader: () async => 'Europe/London',
    );
    await settings.load(userId: actor, workspaceId: workspace);
    await ApiClient.runForUser(
      actor,
      () => tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: PersonalAgendaScope(
            userId: actor,
            workspaceId: workspace,
            settings: settings,
            repository: repository,
            cacheStore: storage,
            refreshHandle: handle,
            child: Builder(
              builder: (context) {
                calendar = context.read<CalendarCubit>();
                return const SizedBox();
              },
            ),
          ),
        ),
      ),
    );
    await _progress(tester, () => storage.writes.length == 1);
    final initial = observeLatest();
    expect(initial.done, isFalse);
    expect(calendar.state.status, CalendarStatus.loaded);
    expect(storage.writes.single.key.workspaceId, workspace);
    // runForUser pins API scope, not Supabase's cache actor getter.
    expect(storage.writes.single.key.userId, currentCacheUserId());
    expect(zones.actors, everyElement(actor));
    storage.writes.single.acknowledge();
    await _progress(tester, () => initial.done);
    expect(initial.failure, isNull);
    return initial;
  }

  Future<void> queueZone(String value) async {
    final revision = handle.latest!.revision;
    zones.personal = value;
    await settings.reload();
    await _progress(tester, () => (handle.latest?.revision ?? 0) > revision);
  }

  Future<_Observed> changeZone(String value) async {
    await queueZone(value);
    return observeLatest();
  }

  Future<void> close() async {
    // Preserve cancellation truth: incomplete gates reject, never fake ACK.
    if (handle.latest != null) observeLatest();
    await tester.pumpWidget(const SizedBox.shrink());
    for (final write in storage.writes) {
      if (!write.gate.isCompleted) write.reject();
    }
    await _progress(tester, () => observations.every((o) => o.done));
    await settings.close();
  }
}

void main() {
  setUpAll(() => registerFallbackValue(DateTime.utc(2026)));
  for (final mode in ['ack', 'error', 'dispose', 'last-error']) {
    testWidgets('actual refresh lifecycle: $mode', (tester) async {
      final suffix = mode == 'ack'
          ? '001'
          : mode == 'error'
          ? '002'
          : mode == 'dispose'
          ? '003'
          : '004';
      final fixture = _Fixture(
        tester,
        '77777777-7777-4777-8777-777777777$suffix',
      );
      try {
        final initial = await fixture.mount();
        if (mode == 'last-error') {
          await fixture.queueZone('Asia/Ho_Chi_Minh');
          await _progress(tester, () => fixture.storage.writes.length == 2);
          // Deliberately no test observer until after failure: production
          // must observe even the last raw wave without changing its receipt.
          fixture.storage.writes[1].reject();
          for (var turn = 0; turn < 5; turn++) {
            await tester.pump();
          }
          expect(tester.takeException(), isNull);
          final failed = fixture.observeLatest();
          await _progress(tester, () => failed.done);
          expect(failed.failure, isA<StateError>());
          expect(fixture.requests, 2);
          return;
        }
        final active = await fixture.changeZone('Asia/Ho_Chi_Minh');
        await _progress(tester, () => fixture.storage.writes.length == 2);
        final latest = await fixture.changeZone('Europe/London');
        expect(active.receipt.revision, greaterThan(initial.receipt.revision));
        expect(latest.receipt.revision, greaterThan(active.receipt.revision));
        expect(active.done, isFalse);
        expect(latest.done, isFalse);
        expect(fixture.requests, 2);
        expect(fixture.calendar.state.timezone, 'Asia/Ho_Chi_Minh');
        expect(fixture.calendar.state.status, CalendarStatus.loaded);
        if (mode == 'dispose') {
          await tester.pumpWidget(const SizedBox.shrink());
          fixture.storage.writes[1].reject();
          await _progress(tester, () => active.done && latest.done);
          expect(fixture.calendar.isClosed, isTrue);
          expect(fixture.requests, 2);
          expect(active.failure, isA<StateError>());
          expect(latest.failure, isA<StateError>());
        } else if (mode == 'error') {
          fixture.storage.writes[1].reject();
          await _progress(tester, () => active.done);
          expect(active.failure, isA<StateError>());
          // Desired continuation contract: currently the plain .then tail
          // forwards the rejection and never admits the latest wave (RED).
          expect(
            fixture.requests,
            3,
            reason:
                'A failed owned predecessor must not strand the latest wave',
          );
          expect(fixture.storage.writes, hasLength(3));
          expect(latest.done, isFalse);
          fixture.storage.writes[2].acknowledge();
          await _progress(tester, () => latest.done);
          expect(latest.failure, isNull);
        } else {
          fixture.storage.writes[1].acknowledge();
          await _progress(tester, () => fixture.storage.writes.length == 3);
          expect(active.done, isTrue);
          expect(active.failure, isNull);
          expect(latest.done, isFalse);
          expect(fixture.requests, 3);
          expect(fixture.calendar.state.timezone, 'Europe/London');
          fixture.storage.writes[2].acknowledge();
          await _progress(tester, () => latest.done);
          expect(latest.failure, isNull);
        }
        expect(tester.takeException(), isNull);
      } finally {
        await fixture.close();
      }
    }, timeout: const Timeout(Duration(seconds: 20)));
  }
}
