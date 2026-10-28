import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late _Storage backend;
  late SupabaseSecureStorage storage;
  late Map<String, String> values;
  late String key;
  late String stage;
  var writes = 0;
  String? fail;

  setUp(() {
    backend = _Storage();
    storage = SupabaseSecureStorage(storage: backend);
    key = supabasePersistSessionKey;
    stage = '$key.persist-retry';
    values = {};
    writes = 0;
    fail = null;
    when(
      () => backend.read(key: any(named: 'key')),
    ).thenAnswer((call) async => values[call.namedArguments[#key]]);
    when(
      () => backend.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      final target = call.namedArguments[#key] as String;
      if (target == key && writes++ == 0) {
        throw PlatformException(code: '-25299');
      }
      if (fail == 'stage' && target == stage ||
          fail == 'primary' && target == key) {
        throw StateError('simulated crash');
      }
      values[target] = call.namedArguments[#value] as String;
    });
    when(() => backend.delete(key: any(named: 'key'))).thenAnswer((call) async {
      final target = call.namedArguments[#key] as String;
      if (fail == 'delete' && target == key ||
          fail == 'cleanup' && target == stage) {
        throw StateError('simulated crash');
      }
      values.remove(target);
    });
  });

  test('staging failure leaves the original item untouched', () async {
    // The legacy item is invisible to reads; its duplicate write throws -25299.
    fail = 'stage';
    await expectLater(storage.persistSession('new'), throwsStateError);
    expect(values, isEmpty);
    verifyNever(() => backend.delete(key: key));
  });

  for (final crash in ['delete', 'primary', 'cleanup']) {
    test('recovers after $crash failure', () async {
      fail = crash;
      await expectLater(storage.persistSession('new'), throwsStateError);
      expect(values[stage], 'new');
      fail = null;
      final restarted = SupabaseSecureStorage(storage: backend);
      expect(await restarted.hasAccessToken(), isTrue);
      expect(await restarted.accessToken(), 'new');
      expect(values, {key: 'new'});
    });
  }

  test('staging wins over a primary left by a failed delete', () async {
    values.addAll({key: 'old', stage: 'new'});
    writes = 1;
    expect(await storage.accessToken(), 'new');
    expect(values, {key: 'new'});
  });

  for (final failure in ['primary', 'cleanup']) {
    test('returns staging despite promotion $failure failure', () async {
      values[stage] = 'new';
      writes = 1;
      fail = failure;
      expect(await storage.accessToken(), 'new');
      expect(values[stage], 'new');
    });
  }

  test('hasAccessToken only reads primary and staging', () async {
    for (final seeded in [key, stage]) {
      values
        ..clear()
        ..[seeded] = 'token';
      expect(await storage.hasAccessToken(), isTrue);
      expect(values, {seeded: 'token'});
    }
    verifyNever(() => backend.delete(key: any(named: 'key')));
    verifyNever(
      () => backend.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    );
  });

  test('sign-out waits for an in-flight retry and ends signed out', () async {
    final entered = Completer<void>();
    final release = Completer<void>();
    when(() => backend.write(key: stage, value: 'new')).thenAnswer((_) async {
      entered.complete();
      await release.future;
      values[stage] = 'new';
    });
    final persist = storage.persistSession('new');
    await entered.future;
    final signOut = storage.removePersistedSession();
    release.complete();
    await persist;
    await signOut;
    expect(values, isEmpty);
    expect(await storage.accessToken(), isNull);
  });

  test('successful retry clears staging', () async {
    await storage.persistSession('new');
    expect(values, {key: 'new'});
  });

  test('sign-out clears staging and cannot resurrect the session', () async {
    fail = 'primary';
    await expectLater(storage.persistSession('new'), throwsStateError);
    fail = null;
    await storage.removePersistedSession();
    expect(values, isEmpty);
    expect(await storage.accessToken(), isNull);
    expect(await storage.hasAccessToken(), isFalse);
  });
}
