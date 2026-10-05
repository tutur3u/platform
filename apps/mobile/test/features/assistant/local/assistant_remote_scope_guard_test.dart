import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_remote_scope_guard.dart';

void main() {
  test(
    'local selection during remote history refresh prevents opening the drawer',
    () async {
      final scope = Object();
      var version = 1;
      var remote = true;
      final guard = AssistantRemoteScopeGuard(
        scope: () => scope,
        version: () => version,
        remote: () => remote,
      );
      final refreshing = Completer<void>();
      final canOpen = guard.run(() => refreshing.future);
      remote = false;
      version++;
      refreshing.complete();
      expect(await canOpen, isFalse);
      var remoteCalls = 0;
      expect(
        await guard.run(() async {
          remoteCalls++;
        }),
        isFalse,
      );
      expect(remoteCalls, 0);
    },
  );

  test('account ABA and switching back to remote do not revive old '
      'drawer callbacks', () async {
    var scope = Object();
    var version = 1;
    final guard = AssistantRemoteScopeGuard(
      scope: () => scope,
      version: () => version,
      remote: () => true,
    );
    final pending = Completer<void>();
    final dismissing = guard.run(() => pending.future);
    scope = Object();
    version += 2;
    pending.complete();
    expect(await dismissing, isFalse);
    expect(guard.current, isFalse);
  });

  test('unchanged remote scope allows each awaited phase', () async {
    final scope = Object();
    final guard = AssistantRemoteScopeGuard(
      scope: () => scope,
      version: () => 1,
      remote: () => true,
    );
    var calls = 0;
    expect(
      await guard.run(() async {
        calls++;
      }),
      isTrue,
    );
    expect(guard.current, isTrue);
    expect(calls, 1);
  });
}
