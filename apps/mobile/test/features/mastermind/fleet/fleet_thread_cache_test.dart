import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_cache.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mocktail/mocktail.dart';

FleetThreadPage _page(String title, {int threads = 1}) => FleetThreadPage(
  machineId: 'skr-m4',
  threads: [
    for (var n = 0; n < threads; n++)
      FleetThread(
        threadId: 'thread:$n',
        title: title,
        projectId: 'p1',
        project: 'Platform',
        state: FleetThreadState.waiting,
        updatedAt: DateTime.utc(2026, 11, 21, 5),
        itemCount: 12,
        seenItemCount: 10,
        lastOwnerReplyAt: DateTime.utc(2026, 11, 21, 4, 30),
      ),
  ],
  nextCursor: 50,
  total: 76,
);

class _Storage extends Mock implements FlutterSecureStorage {}

/// A keystore whose first read fails, as when the device has just woken.
FlutterSecureStorage _flakyStorage(FlutterSecureStorage real) {
  final storage = _Storage();
  var reads = 0;
  when(() => storage.read(key: any(named: 'key'))).thenAnswer((invocation) {
    if (reads++ == 0) throw PlatformException(code: 'locked');
    return real.read(key: invocation.namedArguments[#key] as String);
  });
  when(
    () => storage.write(
      key: any(named: 'key'),
      value: any(named: 'value'),
    ),
  ).thenAnswer(
    (invocation) => real.write(
      key: invocation.namedArguments[#key] as String,
      value: invocation.namedArguments[#value] as String?,
    ),
  );
  return storage;
}

/// A keystore that cannot be reached, as when the device is locked.
FlutterSecureStorage _lockedStorage() {
  final storage = _Storage();
  final locked = PlatformException(code: 'locked');
  when(() => storage.read(key: any(named: 'key'))).thenThrow(locked);
  when(
    () => storage.write(
      key: any(named: 'key'),
      value: any(named: 'value'),
    ),
  ).thenThrow(locked);
  when(() => storage.delete(key: any(named: 'key'))).thenThrow(locked);
  return storage;
}

// Product rule: apps/docs/platform/features/mastermind-thread-replies.mdx
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory directory;
  late String? user;
  late DateTime now;
  const keys = FlutterSecureStorage();

  EncryptedFleetThreadCache cache() => EncryptedFleetThreadCache(
    userId: () => user,
    baseDirectory: () async => directory,
    keyStore: keys,
    now: () => now,
  );

  List<File> files() => directory
      .listSync(recursive: true)
      .whereType<File>()
      .toList(growable: false);

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    directory = Directory.systemTemp.createTempSync('fleet-thread-cache');
    user = 'user-a';
    now = DateTime.utc(2026, 11, 21, 5);
  });

  tearDown(() => directory.deleteSync(recursive: true));

  final list = fleetThreadListKey(machineId: 'skr-m4');

  test('names a list by machine, environment, project and state', () {
    expect(list, 'skr-m4|||');
    expect(
      fleetThreadListKey(
        machineId: 'skr-m4',
        environmentId: 'env-2',
        projectId: 'p1',
        state: FleetThreadState.failed,
      ),
      'skr-m4|env-2|p1|failed',
    );
  });

  test(
    'returns the list as it was saved, with when, across restarts',
    () async {
      await cache().write(list, _page('Rotate the signing value'));
      now = now.add(const Duration(hours: 3));
      final cached = await cache().read(list);
      expect(cached!.savedAt, DateTime.utc(2026, 11, 21, 5));
      expect(cached.page.total, 76);
      expect(cached.page.nextCursor, 50);
      final thread = cached.page.threads.single;
      expect(thread.title, 'Rotate the signing value');
      expect(thread.state, FleetThreadState.waiting);
      expect(thread.unreadCount, 2);
      expect(thread.lastOwnerReplyAt, DateTime.utc(2026, 11, 21, 4, 30));
      expect(await cache().read('skr-m4|||failed'), isNull);
    },
  );

  test('keeps nothing readable on disk', () async {
    await cache().write(list, _page('Rotate the signing value'));
    final file = files().single;
    final raw = file.readAsStringSync();
    expect(raw, isNot(contains('Rotate')));
    expect(raw, isNot(contains('thread:0')));
    expect(raw, isNot(contains('Platform')));
    // The folder is named after a digest of the account, never the account.
    expect(file.path, isNot(contains('user-a')));
    expect((jsonDecode(raw) as Map<String, dynamic>).keys, ['v', 'n', 'c']);
  });

  test('opens for the account it was saved for only', () async {
    await cache().write(list, _page('Mine'));
    final mine = files().single;
    user = 'user-b';
    expect(await cache().read(list), isNull);
    await cache().write(list, _page('Theirs'));
    // A file copied into another account's folder does not open there, and
    // is removed rather than kept around.
    final theirs = files().firstWhere((file) => file.path != mine.path);
    mine.copySync(theirs.path);
    expect(await cache().read(list), isNull);
    expect(theirs.existsSync(), isFalse);
    user = 'user-a';
    expect((await cache().read(list))!.page.threads.single.title, 'Mine');
    // Signed out: nothing is read and nothing is written.
    user = null;
    expect(await cache().read(list), isNull);
    await cache().write(list, _page('Nobody'));
    expect(files(), hasLength(1));
  });

  test('reads as empty, and removes the file, when it is damaged, oversized '
      'or its key is gone', () async {
    Future<void> expectDropped() async {
      expect(await cache().read(list), isNull);
      expect(files(), isEmpty);
    }

    await cache().write(list, _page('One'));
    final path = files().single.path;
    final envelope =
        jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
    final sealed = base64Decode(envelope['c'] as String);
    sealed[0] ^= 1;
    File(
      path,
    ).writeAsStringSync(jsonEncode({...envelope, 'c': base64Encode(sealed)}));
    await expectDropped();

    await cache().write(list, _page('Two'));
    File(path).writeAsStringSync('not json');
    await expectDropped();

    await cache().write(list, _page('Three'));
    File(path).writeAsStringSync('x' * (1024 * 1024 + 1));
    await expectDropped();

    await cache().write(list, _page('Four'));
    FlutterSecureStorage.setMockInitialValues({});
    await expectDropped();
    // A new key is made for the next write.
    await cache().write(list, _page('Five'));
    expect((await cache().read(list))!.page.threads.single.title, 'Five');
  });

  test('keeps the six lists saved last and the first fifty threads', () async {
    final store = cache();
    for (var n = 0; n < 8; n++) {
      now = now.add(const Duration(minutes: 1));
      await store.write('skr-m4||p$n|', _page('List $n', threads: 60));
    }
    expect(await store.read('skr-m4||p0|'), isNull);
    expect(await store.read('skr-m4||p1|'), isNull);
    for (var n = 2; n < 8; n++) {
      final cached = await store.read('skr-m4||p$n|');
      expect(cached!.page.threads, hasLength(50), reason: 'list $n');
    }
    // Saving a list again replaces it and keeps its place among the newest.
    now = now.add(const Duration(minutes: 1));
    await store.write('skr-m4||p2|', _page('Again'));
    expect(
      (await store.read('skr-m4||p2|'))!.page.threads.single.title,
      'Again',
    );
  });

  test('clears the lists and the key of the account it is given', () async {
    final store = cache();
    await store.write(list, _page('One'));
    expect(await keys.readAll(), hasLength(1));
    // Signed out already when the clearing runs.
    user = null;
    await store.clear('user-a');
    expect(files(), isEmpty);
    expect(await keys.readAll(), isEmpty);
  });

  test('clears one account on a cache two accounts used, whoever is signed '
      'in', () async {
    // One cache object serves every account, as in the app.
    final store = cache();
    await store.write(list, _page('Mine'));
    final mine = files().single.path;
    user = 'user-b';
    await store.write(list, _page('Theirs'));
    // The sign-out of the first account is handled late.
    await store.clear('user-a');
    expect(File(mine).existsSync(), isFalse);
    expect(files(), hasLength(1));
    expect(await keys.readAll(), hasLength(1));
    expect((await store.read(list))!.page.threads.single.title, 'Theirs');

    // And the other way round: B never used the cache in this run, A did.
    final next = cache();
    user = 'user-a';
    await next.write(list, _page('Mine again'));
    user = 'user-b';
    await next.clear('user-b');
    expect(await next.read(list), isNull);
    user = 'user-a';
    expect((await next.read(list))!.page.threads.single.title, 'Mine again');
  });

  test('hands a list only to the account still signed in when the read '
      'finishes', () async {
    await cache().write(list, _page('Mine'));
    // A read that waits behind slow storage while the account changes.
    final gate = Completer<void>();
    final slow = EncryptedFleetThreadCache(
      userId: () => user,
      baseDirectory: () async {
        await gate.future;
        return directory;
      },
      keyStore: keys,
    );
    final pending = slow.read(list);
    user = 'user-b';
    gate.complete();
    expect(await pending, isNull);
    // It was not theirs to see, and it is still there for its owner.
    user = 'user-a';
    expect((await cache().read(list))!.page.threads.single.title, 'Mine');
  });

  test('neither removes nor replaces what is stored while storage cannot be '
      'reached', () async {
    final good = cache();
    await good.write(list, _page('Kept'));
    await good.write('skr-m4|||failed', _page('Also kept'));
    final blocked = EncryptedFleetThreadCache(
      userId: () => user,
      baseDirectory: () async => directory,
      keyStore: _lockedStorage(),
    );
    expect(await blocked.read(list), isNull);
    await blocked.write(list, _page('Not saved'));
    expect(files(), hasLength(1));

    final nowhere = EncryptedFleetThreadCache(
      userId: () => user,
      baseDirectory: () async => throw const FileSystemException('no cache'),
      keyStore: keys,
    );
    expect(await nowhere.read(list), isNull);
    await nowhere.write(list, _page('Not saved'));

    // The keystore fails once, then answers: the write that met the failure
    // saves nothing, so the two lists are not replaced by its one.
    final flaky = EncryptedFleetThreadCache(
      userId: () => user,
      baseDirectory: () async => directory,
      keyStore: _flakyStorage(keys),
    );
    await flaky.write('skr-m4|||idle', _page('Lost race'));
    expect((await good.read(list))!.page.threads.single.title, 'Kept');
    expect(
      (await good.read('skr-m4|||failed'))!.page.threads.single.title,
      'Also kept',
    );
    expect(await good.read('skr-m4|||idle'), isNull);
    // Once the keystore answers, the same cache saves again.
    await flaky.write('skr-m4|||idle', _page('Saved'));
    expect(
      (await good.read('skr-m4|||idle'))!.page.threads.single.title,
      'Saved',
    );

    // Clearing does not throw without a directory, and still removes the
    // file when the key cannot be deleted.
    await nowhere.clear('user-a');
    expect(files(), hasLength(1));
    await blocked.clear('user-a');
    expect(files(), isEmpty);
  });

  test(
    'drops one list that does not fit the contract and keeps the others',
    () async {
      await cache().write(list, _page('Good'));
      final file = files().single;
      final owner = file.parent.path.split('/').last;
      final key = SecretKey(base64Decode((await keys.readAll()).values.single));
      final box = await AesGcm.with256bits().encrypt(
        utf8.encode(
          jsonEncode({
            list: {
              'savedAt': '2026-11-21T05:00:00.000Z',
              'page': _page('Good').toJson(),
            },
            'old': {
              'savedAt': '2026-11-21T05:00:00.000Z',
              'page': {'threads': 'none'},
            },
            'undated': {'page': _page('No date').toJson()},
          }),
        ),
        secretKey: key,
        nonce: List<int>.filled(12, 7),
        aad: utf8.encode('mastermind-fleet-threads-v1\n$owner'),
      );
      file.writeAsStringSync(
        jsonEncode({
          'v': 1,
          'n': base64Encode(box.nonce),
          'c': base64Encode([...box.cipherText, ...box.mac.bytes]),
        }),
      );
      expect((await cache().read(list))!.page.threads.single.title, 'Good');
      expect(await cache().read('old'), isNull);
      expect(await cache().read('undated'), isNull);
      expect(files(), hasLength(1));
    },
  );

  test('the in-memory cache keeps a separate set of lists per account, with '
      'the same limits', () async {
    final memory = MemoryFleetThreadCache(userId: () => user, now: () => now);
    expect(await memory.read(list), isNull);
    await memory.write(list, _page('Mine'));
    expect((await memory.read(list))!.savedAt, now);
    user = 'user-b';
    expect(await memory.read(list), isNull);
    await memory.write(list, _page('Theirs'));
    user = null;
    expect(await memory.read(list), isNull);
    await memory.write(list, _page('Nobody'));
    user = 'user-a';
    expect((await memory.read(list))!.page.threads.single.title, 'Mine');
    await memory.clear('user-a');
    expect(await memory.read(list), isNull);
    user = 'user-b';
    expect((await memory.read(list))!.page.threads.single.title, 'Theirs');

    // The six lists saved last, the first fifty threads of each.
    for (var n = 0; n < 8; n++) {
      now = now.add(const Duration(minutes: 1));
      await memory.write('skr-m4||p$n|', _page('List $n', threads: 60));
    }
    expect(await memory.read(list), isNull);
    expect(await memory.read('skr-m4||p1|'), isNull);
    expect((await memory.read('skr-m4||p2|'))!.page.threads, hasLength(50));
    expect((await memory.read('skr-m4||p7|'))!.page.threads, hasLength(50));
  });
}
