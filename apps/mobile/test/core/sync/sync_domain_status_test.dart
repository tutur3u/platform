import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/sync/smart_sync.dart';
import 'package:mobile/core/sync/sync_domain_status.dart';

void main() {
  test('domain comes from the first namespace segment of a cache key', () {
    expect(syncDomainOf('tasks.board|u=user-1|w=ws-1'), 'tasks');
    expect(syncDomainOf('calendar|u=user-1'), 'calendar');
    expect(syncDomainOf(''), 'other');
    expect(syncDomainOf(42), 'other');
    expect(syncDomainOf('sha256:${'a' * 64}'), 'other');
  });

  test('snapshot records last success, failure counts and back-off', () async {
    var now = DateTime.utc(2026, 11, 24, 9);
    final sync = SmartSync(backgroundAllowed: () async => true, now: () => now);
    const policy = SyncPolicy(ttl: Duration(minutes: 2));
    Future<SyncOutcome> refresh(String key, Future<void> Function() fetch) =>
        sync.refresh(
          key: key,
          policy: policy,
          trigger: SyncTrigger.resume,
          isCurrent: () => true,
          fetch: fetch,
        );

    expect(
      await refresh('tasks.board|u=a', () async {}),
      SyncOutcome.refreshed,
    );
    final succeededAt = now;
    now = now.add(const Duration(minutes: 1));
    expect(
      await refresh('tasks.list|u=a', () async => throw StateError('down')),
      SyncOutcome.failed,
    );
    expect(
      await refresh('mail.inbox|u=a', () async => throw StateError('down')),
      SyncOutcome.failed,
    );

    final domains = summarizeSyncDomains(sync.debugSnapshot());
    expect(domains.map((d) => d.domain), ['mail', 'tasks']);
    final mail = domains.first;
    expect(mail.resources, 1);
    expect(mail.lastSuccess, isNull);
    expect(mail.failures, 1);
    expect(mail.retryAfter, now.add(const Duration(seconds: 30)));
    final tasks = domains.last;
    expect(tasks.resources, 2);
    expect(tasks.lastSuccess, succeededAt);
    expect(tasks.failures, 1);

    sync.reset();
    expect(sync.debugSnapshot(), isEmpty);
  });

  test('summary sums failures and keeps the latest timestamps', () {
    final early = DateTime.utc(2026, 11, 24, 8);
    final late = DateTime.utc(2026, 11, 24, 9);
    final [chat] = summarizeSyncDomains([
      SyncKeyStatus(
        key: 'chat.rooms|u=a',
        lastSuccess: early,
        failures: 2,
        retryAfter: late,
      ),
      SyncKeyStatus(
        key: 'chat.messages|u=a',
        lastSuccess: late,
        failures: 3,
        retryAfter: early,
      ),
    ]);
    expect(chat.domain, 'chat');
    expect(chat.failures, 5);
    expect(chat.lastSuccess, late);
    expect(chat.retryAfter, late);
  });
}
