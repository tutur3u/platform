import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/startup/foreground_refresh.dart';
import 'package:mobile/core/sync/smart_sync.dart';
import 'package:mobile/core/sync/sync_domain_policy.dart';

void main() {
  late DateTime now;
  late SmartSync sync;
  late bool allowed;

  setUp(() {
    now = DateTime.utc(2026, 11, 20);
    allowed = true;
    sync = SmartSync(
      backgroundAllowed: () async => allowed,
      now: () => now,
      concurrency: 1,
    );
  });

  Future<SyncOutcome> refresh(
    String key,
    Future<void> Function() fetch, {
    DateTime? fetchedAt,
    bool Function()? isCurrent,
    SyncTrigger trigger = SyncTrigger.resume,
  }) => sync.refresh(
    key: key,
    trigger: trigger,
    policy: const SyncPolicy(ttl: Duration(minutes: 2)),
    isCurrent: isCurrent ?? () => true,
    fetch: fetch,
    fetchedAt: fetchedAt,
  );

  test('domain policy respects cache permissions and push eligibility', () {
    const cache = CachePolicy(
      staleAfter: Duration(minutes: 4),
      expireAfter: Duration(days: 1),
      refreshOnReconnect: false,
    );
    final notifications = syncDomainPolicy('notifications.feed', cache);
    final calendar = syncDomainPolicy('calendar.events', cache);
    expect(notifications.ttl, const Duration(seconds: 45));
    expect(notifications.triggers, contains(SyncTrigger.pushHint));
    expect(notifications.triggers, isNot(contains(SyncTrigger.reconnect)));
    expect(calendar.triggers, isNot(contains(SyncTrigger.pushHint)));
  });

  test('only OS refresh checks device restrictions', () async {
    var policyChecks = 0;
    sync = SmartSync(
      backgroundAllowed: () async {
        policyChecks++;
        return false;
      },
      now: () => now,
    );
    var calls = 0;
    Future<void> fetch() async => calls++;
    expect(await refresh('fresh', fetch, fetchedAt: now), SyncOutcome.fresh);
    expect(
      await refresh('os', fetch, trigger: SyncTrigger.osRefresh),
      SyncOutcome.deferred,
    );
    for (final trigger in [
      SyncTrigger.resume,
      SyncTrigger.reconnect,
      SyncTrigger.pushHint,
    ]) {
      expect(
        await refresh(trigger.name, fetch, trigger: trigger),
        SyncOutcome.refreshed,
      );
    }
    expect(policyChecks, 1);
    expect(calls, 3);
  });

  test('pending OS admission cannot block a foreground fetch', () async {
    final admission = Completer<bool>();
    sync = SmartSync(backgroundAllowed: () => admission.future);
    final os = refresh(
      'mail',
      () async => fail('restricted OS fetch'),
      trigger: SyncTrigger.osRefresh,
    );
    expect(await refresh('mail', () async {}), SyncOutcome.refreshed);
    admission.complete(false);
    expect(await os, SyncOutcome.deferred);
  });

  test('failures back off and a successful refresh clears backoff', () async {
    var calls = 0;
    Future<void> fetch() async {
      if (++calls <= 2) throw StateError('Refresh gate closed');
    }

    expect(await refresh('calendar', fetch), SyncOutcome.failed);
    now = now.add(const Duration(seconds: 29));
    expect(await refresh('calendar', fetch), SyncOutcome.deferred);
    now = now.add(const Duration(seconds: 1));
    expect(await refresh('calendar', fetch), SyncOutcome.failed);
    now = now.add(const Duration(seconds: 59));
    expect(await refresh('calendar', fetch), SyncOutcome.deferred);
    now = now.add(const Duration(seconds: 1));
    expect(await refresh('calendar', fetch), SyncOutcome.refreshed);
    expect(await refresh('calendar', fetch), SyncOutcome.fresh);
    expect(calls, 3);
  });

  test('deduplicates same-key requests and defaults to three slots', () async {
    sync = SmartSync(backgroundAllowed: () async => allowed, now: () => now);
    final holds = List.generate(4, (_) => Completer<void>());
    final started = <int>[];
    final flights = List.generate(holds.length, (index) {
      return refresh('task-$index', () async {
        started.add(index);
        await holds[index].future;
      });
    });
    final duplicate = refresh('task-0', () async => fail('duplicate fetch'));

    expect(identical(flights.first, duplicate), isTrue);
    await Future<void>.delayed(Duration.zero);
    expect(started, [0, 1, 2]);
    holds.first.complete();
    expect(await flights.first, SyncOutcome.refreshed);
    await Future<void>.delayed(Duration.zero);
    expect(started, [0, 1, 2, 3]);
    for (final hold in holds.skip(1)) {
      hold.complete();
    }
    expect(await Future.wait(flights), everyElement(SyncOutcome.refreshed));
  });

  test('unlock gates work and a scope reset drops old queued work', () async {
    final queued = <void Function()>[];
    addTearDown(ForegroundRefresh.bind((_, work) => queued.add(work)));
    var calls = 0;
    final old = refresh('notifications', () async => calls++);
    await Future<void>.delayed(Duration.zero);
    expect(queued, hasLength(1));
    expect(calls, 0);
    sync.reset();
    queued.removeAt(0)();
    expect(await old, SyncOutcome.deferred);
    expect(calls, 0);

    final current = refresh('notifications', () async => calls++);
    await Future<void>.delayed(Duration.zero);
    expect(calls, 0);
    queued.single();
    expect(await current, SyncOutcome.refreshed);
    expect(calls, 1);
  });
}
