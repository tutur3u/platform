import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/mobile_client_credential.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

String jwt(Map<String, Object?> claims) {
  String part(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.sig';
}

final String accessA = jwt({'sub': 'user-a', 'session_id': 'session-1'});
final Uri origin = Uri.parse('https://tuturuuu.com/api/v1/auth/x');

void main() {
  late _Storage storage;
  late Map<String, String> values;
  late DateTime now;
  late List<(Uri, String)> solves;
  late MobileClientCredentials credentials;
  var mints = 0;

  Map<String, dynamic> issued(
    String token, {
    Duration ttl = const Duration(hours: 24),
  }) => {
    'mobile_client': {
      'token': token,
      'expires_at': now.add(ttl).toUtc().toIso8601String(),
    },
  };

  setUp(() {
    storage = _Storage();
    values = {};
    now = DateTime.utc(2026, 11, 21, 12);
    solves = [];
    mints = 0;
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => values[call.namedArguments[#key]]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      values[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      values.remove(call.namedArguments[#key]);
    });
    credentials = MobileClientCredentials(
      storage: storage,
      clock: () => now,
      turnstile: (page, binding) async {
        solves.add((page, binding));
        return 'captcha';
      },
    );
  });

  Future<String?> ensure({
    String? accessToken,
    bool force = false,
    String? rejected,
    Future<Map<String, dynamic>> Function(String)? mint,
  }) => credentials.ensure(
    userId: 'user-a',
    accessToken: accessToken ?? accessA,
    origin: origin,
    force: force,
    rejected: rejected,
    mint:
        mint ??
        (captcha) async {
          expect(captcha, 'captcha');
          return issued('token-${++mints}');
        },
  );

  test('a slow storage read times out without losing stored data', () async {
    await credentials.storeIssued(
      userId: 'user-a',
      accessToken: accessA,
      mobileClient: issued('stored')['mobile_client'],
    );
    final stored = Map<String, String>.of(values);
    final slow = _Storage();
    final read = Completer<String?>();
    when(
      () => slow.read(key: any(named: 'key')),
    ).thenAnswer((_) => read.future);
    final cold = MobileClientCredentials(
      storage: slow,
      clock: () => now,
      turnstile: (_, _) async => fail('no mint without a storage answer'),
      storageTimeout: const Duration(milliseconds: 20),
    );

    expect(await cold.current(userId: 'user-a', accessToken: accessA), isNull);
    expect(
      await cold.ensure(
        userId: 'user-a',
        accessToken: accessA,
        origin: origin,
        mint: (_) async => fail('no mint without a storage answer'),
      ),
      isNull,
    );
    // The late answer fills the cache; nothing empty replaced it meanwhile.
    read.complete(stored.values.single);
    await pumpEventQueue();
    expect(
      await cold.current(userId: 'user-a', accessToken: accessA),
      'stored',
    );
    verifyNever(
      () => slow.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    );
  });

  test('callers share one stalled storage read', () async {
    final slow = _Storage();
    when(
      () => slow.read(key: any(named: 'key')),
    ).thenAnswer((_) => Completer<String?>().future);
    final cold = MobileClientCredentials(
      storage: slow,
      clock: () => now,
      storageTimeout: const Duration(milliseconds: 20),
    );
    await Future.wait([
      cold.current(userId: 'user-a', accessToken: accessA),
      cold.current(userId: 'user-a', accessToken: accessA),
    ]);
    await cold.current(userId: 'user-a', accessToken: accessA);
    verify(() => slow.read(key: any(named: 'key'))).called(1);
  });

  test('a stalled write still returns the minted credential', () async {
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) => Completer<void>().future);
    final stalled = MobileClientCredentials(
      storage: storage,
      clock: () => now,
      turnstile: (_, _) async => 'captcha',
      storageTimeout: const Duration(milliseconds: 20),
    );
    expect(
      await stalled
          .ensure(
            userId: 'user-a',
            accessToken: accessA,
            origin: origin,
            mint: (_) async => issued('minted'),
          )
          .timeout(const Duration(seconds: 2)),
      'minted',
    );
  });

  test('binds the Turnstile solve to the session like the server', () {
    expect(supabaseSessionId(accessA, 'user-a'), 'session-1');
    expect(supabaseSessionId(accessA, 'user-b'), isNull);
    expect(supabaseSessionId('opaque-token', 'user-a'), isNull);
    // base64url SHA-256 of "session-1", as Node's digest('base64url').
    expect(
      mobileClientSessionBinding('session-1'),
      'hAl4KPwxqMjSkhDfSJAahd5_0BP2hrF7530b4py3qYs',
    );
  });

  test('mints once for concurrent callers, then reuses it', () async {
    final results = await Future.wait([ensure(), ensure()]);
    expect(results, ['token-1', 'token-1']);
    expect(mints, 1);
    final (page, binding) = solves.single;
    expect(
      page.toString(),
      'https://tuturuuu.com/native-integrity/turnstile?purpose=mobile_client_credential',
    );
    expect(binding, mobileClientSessionBinding('session-1'));
    expect(await ensure(), 'token-1');
    expect(mints, 1);
    expect(values.values.single, contains('token-1'));

    // A fresh instance reads it back from secure storage.
    final restored = MobileClientCredentials(
      storage: storage,
      clock: () => now,
    );
    expect(
      await restored.current(userId: 'user-a', accessToken: accessA),
      'token-1',
    );
  });

  test('never mints or sends without a bound Supabase session', () async {
    expect(await ensure(accessToken: 'opaque-token'), isNull);
    expect(mints, 0);
    await ensure();
    final otherSession = jwt({'sub': 'user-a', 'session_id': 'session-2'});
    expect(
      await credentials.current(userId: 'user-a', accessToken: otherSession),
      isNull,
    );
    // The stale slot is dropped, so it is never sent again.
    expect(values, isEmpty);
  });

  test(
    'refreshes ahead of expiry and keeps the old one if refresh fails',
    () async {
      await ensure();
      now = now.add(const Duration(hours: 23, minutes: 30));
      final failing = await ensure(mint: (_) async => throw StateError('down'));
      expect(failing, 'token-1');
      // Backoff: no second attempt until it elapses.
      expect(await ensure(), 'token-1');
      expect(mints, 1);
      now = now.add(MobileClientCredentials.minBackoff);
      expect(await ensure(), 'token-2');
      expect(mints, 2);
    },
  );

  test('backs off exponentially after failures, never looping', () async {
    var attempts = 0;
    Future<Map<String, dynamic>> refuse(String _) async {
      attempts++;
      throw StateError('refused');
    }

    for (var i = 0; i < 5; i++) {
      expect(await ensure(mint: refuse), isNull);
    }
    expect(attempts, 1);
    now = now.add(MobileClientCredentials.minBackoff);
    await ensure(mint: refuse);
    expect(attempts, 2);
    // The second failure doubles the wait.
    now = now.add(MobileClientCredentials.minBackoff);
    await ensure(mint: refuse);
    expect(attempts, 2);
    now = now.add(MobileClientCredentials.minBackoff);
    await ensure(mint: refuse);
    expect(attempts, 3);
  });

  test('rejects malformed or already expired mint responses', () async {
    expect(
      await ensure(
        mint: (_) async => {
          'mobile_client': {'token': ''},
        },
      ),
      isNull,
    );
    now = now.add(MobileClientCredentials.minBackoff);
    expect(
      await ensure(
        mint: (_) async => issued('t', ttl: -const Duration(seconds: 1)),
      ),
      isNull,
    );
    expect(values, isEmpty);
  });

  test('a server rejection re-mints once per interval', () async {
    await ensure();
    expect(await ensure(force: true, rejected: 'token-1'), isNull);
    // Within the interval the rejected token is gone and nothing is minted.
    expect(mints, 1);
    now = now.add(MobileClientCredentials.remintInterval);
    expect(await ensure(force: true, rejected: 'token-1'), 'token-2');
    expect(await ensure(force: true, rejected: 'token-2'), isNull);
    expect(mints, 2);
  });

  test('stores a sign-in credential and clears it on sign-out', () async {
    await credentials.storeIssued(
      userId: 'user-a',
      accessToken: accessA,
      mobileClient: issued('login')['mobile_client'],
    );
    expect(await ensure(), 'login');
    await credentials.clear('user-a');
    expect(values, isEmpty);
    expect(
      await credentials.current(userId: 'user-a', accessToken: accessA),
      isNull,
    );
  });

  test('a clear during a mint discards the minted credential', () async {
    final release = Completer<void>();
    final pending = ensure(
      mint: (_) async {
        await release.future;
        return issued('late');
      },
    );
    await Future<void>.delayed(Duration.zero);
    await credentials.clearAll();
    release.complete();
    expect(await pending, isNull);
    expect(values, isEmpty);
  });
}
