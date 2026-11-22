import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/widgets/security_check_prewarm.dart';

/// Background Turnstile tokens are one-use, short-lived and bound to the
/// account that asked; a form runs one verified submit at a time.
void main() {
  group('SecurityCheckPrewarm', () {
    tearDown(SecurityCheckPrewarm.reset);

    test('hands a ready token out once', () async {
      var solves = 0;
      SecurityCheckPrewarm.solver = () async => 'token-${++solves}';
      expect(await SecurityCheckPrewarm.background(), 'token-1');
      expect(SecurityCheckPrewarm.take(), isNull);
      expect(await SecurityCheckPrewarm.background(), 'token-2');
    });

    test('a prewarmed token waits for the action, then expires', () async {
      var now = Duration.zero;
      var solves = 0;
      SecurityCheckPrewarm.elapsed = () => now;
      SecurityCheckPrewarm.solver = () async => 'prewarmed-${++solves}';
      await SecurityCheckPrewarm.warm();
      // A fresh token is not solved twice.
      await SecurityCheckPrewarm.warm();
      expect(solves, 1);
      expect(await SecurityCheckPrewarm.background(), 'prewarmed-1');

      await SecurityCheckPrewarm.warm();
      now += SecurityCheckPrewarm.lifetime;
      // Turnstile rejects tokens after 300 seconds; never hand one out late.
      // The age is monotonic, so a wall-clock change cannot extend it.
      expect(SecurityCheckPrewarm.take(), isNull);
      expect(await SecurityCheckPrewarm.background(), 'prewarmed-3');
    });

    test(
      'a solve finishing after an account switch is not handed out',
      () async {
        String? account = 'user-a';
        final solve = Completer<String?>();
        SecurityCheckPrewarm.scope = () => account;
        SecurityCheckPrewarm.solver = () => solve.future;
        final warming = SecurityCheckPrewarm.warm();
        account = 'user-b';
        solve.complete('user-a-token');
        await warming;
        expect(SecurityCheckPrewarm.take(), isNull);
      },
    );

    test('a token never crosses to another account', () async {
      String? account = 'user-a';
      var solves = 0;
      SecurityCheckPrewarm.scope = () => account;
      SecurityCheckPrewarm.solver = () async => 'token-${++solves}';
      await SecurityCheckPrewarm.warm();
      // Sign-out or an account switch before the token is used.
      account = 'user-b';
      expect(SecurityCheckPrewarm.take(), isNull);
      expect(await SecurityCheckPrewarm.background(), 'token-2');
      // A solve started while signed out stays with the signed-out state.
      account = null;
      await SecurityCheckPrewarm.warm();
      account = 'user-a';
      expect(SecurityCheckPrewarm.take(), isNull);
    });

    test('concurrent callers never share one token', () async {
      final pending = <Completer<String?>>[];
      SecurityCheckPrewarm.solver = () {
        final next = Completer<String?>();
        pending.add(next);
        return next.future;
      };
      final first = SecurityCheckPrewarm.background();
      final second = SecurityCheckPrewarm.background();
      await Future<void>.delayed(Duration.zero);
      // Both wait on one shared solve.
      expect(pending, hasLength(1));
      pending.first.complete('shared');
      await Future<void>.delayed(Duration.zero);
      // One caller took it; the other starts its own solve.
      expect(pending, hasLength(2));
      pending.last.complete('own');
      final tokens = {await first, await second};
      expect(tokens, {'shared', 'own'});
    });

    test('a failing solver yields no token', () async {
      SecurityCheckPrewarm.solver = () async => throw StateError('webview');
      expect(await SecurityCheckPrewarm.background(), isNull);
    });
  });

  group('SecurityCheckAttempts', () {
    test('a newer submit takes the pending token; one check runs', () async {
      final attempts = SecurityCheckAttempts.prewarmed();
      final token = Completer<String?>();
      var checks = 0;
      final submitted = <String>[];
      Future<String?> verify() {
        checks++;
        return token.future;
      }

      // Password sign-in is waiting on the check...
      final password = attempts.run(
        verify: verify,
        stillCurrent: () => true,
        submit: (value) async => submitted.add('password:$value'),
      );
      // ...when the person switches to a one-time code instead.
      await attempts.run(
        verify: verify,
        stillCurrent: () => true,
        submit: (value) async => submitted.add('otp:$value'),
      );
      token.complete('t1');
      await password;
      expect(checks, 1);
      expect(submitted, ['otp:t1']);
    });

    test('a step change or a stale form drops the token', () async {
      final attempts = SecurityCheckAttempts.prewarmed();
      final submitted = <String?>[];
      var token = Completer<String?>();
      var pending = attempts.run(
        verify: () => token.future,
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      attempts.cancel();
      token.complete('late');
      await pending;

      token = Completer<String?>();
      var current = true;
      pending = attempts.run(
        verify: () => token.future,
        stillCurrent: () => current,
        submit: (value) async => submitted.add(value),
      );
      current = false;
      token.complete('stale');
      await pending;
      expect(submitted, isEmpty);
    });

    test('with Turnstile configured, no token means no submit', () async {
      final attempts = SecurityCheckAttempts.prewarmed(requireToken: true);
      final submitted = <String?>[];
      for (final token in <String?>[null, '']) {
        await attempts.run(
          verify: () async => token,
          stillCurrent: () => true,
          submit: (value) async => submitted.add(value),
        );
      }
      expect(submitted, isEmpty);
      await attempts.run(
        verify: () async => 'verified',
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      expect(submitted, ['verified']);
    });

    test('a suspended form starts nothing until it resumes', () async {
      final attempts = SecurityCheckAttempts.prewarmed();
      final token = Completer<String?>();
      final submitted = <String?>[];
      final pending = attempts.run(
        verify: () => token.future,
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      // Cancelling add-account: the pending sign-in is dropped and a new
      // one (keyboard Done, for example) cannot start meanwhile.
      attempts.suspend();
      await attempts.run(
        verify: () async => 'during',
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      token.complete('late');
      await pending;
      expect(submitted, isEmpty);
      attempts.resume();
      await attempts.run(
        verify: () async => 'after',
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      expect(submitted, ['after']);
    });

    test('a submit already sending ignores new ones', () async {
      final attempts = SecurityCheckAttempts.prewarmed();
      final sending = Completer<void>();
      final submitted = <String?>[];
      final first = attempts.run(
        verify: () async => 'first',
        stillCurrent: () => true,
        submit: (value) {
          submitted.add(value);
          return sending.future;
        },
      );
      await Future<void>.delayed(Duration.zero);
      await attempts.run(
        verify: () async => 'second',
        stillCurrent: () => true,
        submit: (value) async => submitted.add(value),
      );
      sending.complete();
      await first;
      expect(submitted, ['first']);
    });
  });
}
