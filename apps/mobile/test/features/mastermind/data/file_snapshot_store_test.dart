import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/file_snapshot_store.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_hub_harness.dart';

Uint8List _bytes(String text) => Uint8List.fromList(utf8.encode(text));

void main() {
  late Directory base;
  String? user;
  late FileSnapshotStore store;
  final receivedAt = DateTime.utc(2026, 10, 28, 7);

  Directory root() => Directory('${base.path}/mastermind');
  List<FileSystemEntity> userDirectories() =>
      root().existsSync() ? root().listSync() : const [];

  setUp(() {
    base = Directory.systemTemp.createTempSync('mastermind_store_');
    user = 'user-a';
    store = FileSnapshotStore(
      baseDirectory: () async => base,
      userId: () => user,
    );
  });

  tearDown(() {
    if (base.existsSync()) base.deleteSync(recursive: true);
  });

  test('round-trips bytes, digest and received time', () async {
    expect(await store.read(), isNull);
    await store.write(_bytes('{"a":1}'), receivedAt, digest: hubDigest);
    final stored = await store.read();
    expect(utf8.decode(stored!.bytes), '{"a":1}');
    expect(stored.digest, hubDigest);
    expect(stored.receivedAt, receivedAt);
  });

  test(
    'writes are atomic: no temp file survives and the hash is kept',
    () async {
      await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
      final dir = userDirectories().single as Directory;
      final names = dir.listSync().map((e) => e.uri.pathSegments.last).toSet();
      expect(names, {'snapshot.json', 'meta.json'});
    },
  );

  test('the directory name never carries the user id', () async {
    await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
    expect(userDirectories().single.path.contains('user-a'), isFalse);
  });

  test('without a signed-in user nothing is read or written', () async {
    user = null;
    await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
    expect(await store.read(), isNull);
    expect(root().existsSync(), isFalse);
  });

  test('an invalid digest or an oversize body is not stored', () async {
    await store.write(_bytes('{}'), receivedAt, digest: 'nope');
    await store.write(
      Uint8List(mastermindSnapshotMaxBytes + 1),
      receivedAt,
      digest: hubDigest,
    );
    expect(await store.read(), isNull);
  });

  group('corrupt caches are discarded', () {
    Future<Directory> seeded() async {
      await store.write(_bytes('{"ok":true}'), receivedAt, digest: hubDigest);
      return userDirectories().single as Directory;
    }

    test('tampered snapshot bytes', () async {
      final dir = await seeded();
      File('${dir.path}/snapshot.json').writeAsStringSync('{"ok":false}');
      expect(await store.read(), isNull);
      expect(dir.existsSync(), isFalse);
    });

    test('garbage metadata', () async {
      final dir = await seeded();
      File('${dir.path}/meta.json').writeAsStringSync('not json');
      expect(await store.read(), isNull);
      expect(dir.existsSync(), isFalse);
    });

    test('metadata with the wrong shape', () async {
      final dir = await seeded();
      File(
        '${dir.path}/meta.json',
      ).writeAsStringSync(jsonEncode({'schema': 2, 'digest': hubDigest}));
      expect(await store.read(), isNull);
      expect(dir.existsSync(), isFalse);
    });

    test('a missing snapshot file', () async {
      final dir = await seeded();
      File('${dir.path}/snapshot.json').deleteSync();
      expect(await store.read(), isNull);
      expect(dir.existsSync(), isFalse);
    });
  });

  test('accounts are isolated and a switch drops the other cache', () async {
    await store.write(_bytes('{"u":"a"}'), receivedAt, digest: hubDigest);
    user = 'user-b';
    expect(await store.read(), isNull);
    await store.write(_bytes('{"u":"b"}'), receivedAt, digest: otherDigest);
    expect(userDirectories(), hasLength(1));
    expect((await store.read())!.digest, otherDigest);
    user = 'user-a';
    expect(await store.read(), isNull);
  });

  test('clear erases every account on logout', () async {
    await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
    await store.clear();
    expect(root().existsSync(), isFalse);
    expect(await store.read(), isNull);
    // Clearing an empty store is not an error.
    await store.clear();
  });

  group('event cursor meta', () {
    test(
      'persists beside the snapshot and survives a newer snapshot',
      () async {
        expect(await store.readCursor(), isNull);
        await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
        await store.writeCursor(
          StoredEventCursor(lastSeenSeq: 7, rebaselinedAt: receivedAt),
        );
        await store.write(_bytes('{"n":2}'), receivedAt, digest: otherDigest);
        final cursor = (await store.readCursor())!;
        expect(cursor.lastSeenSeq, 7);
        expect(cursor.rebaselinedAt, receivedAt);
        expect((await store.read())!.digest, otherDigest);
      },
    );

    test('is a no-op without a cached snapshot', () async {
      await store.writeCursor(const StoredEventCursor(lastSeenSeq: 3));
      expect(await store.readCursor(), isNull);
      expect(root().existsSync(), isFalse);
    });

    test('is cleared with the snapshot', () async {
      await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
      await store.writeCursor(const StoredEventCursor(lastSeenSeq: 3));
      await store.clear();
      expect(await store.readCursor(), isNull);
    });

    test('rejects a negative cursor', () async {
      expect(
        () => store.writeCursor(const StoredEventCursor(lastSeenSeq: -1)),
        throwsRangeError,
      );
    });
  });

  group('serial queue', () {
    test('a cursor write queued behind a snapshot write is applied', () async {
      final write = store.write(_bytes('{}'), receivedAt, digest: hubDigest);
      final cursor = store.writeCursor(const StoredEventCursor(lastSeenSeq: 7));
      await Future.wait([write, cursor]);
      expect((await store.readCursor())!.lastSeenSeq, 7);
    });

    test('a clear queued behind writes leaves nothing behind', () async {
      final pending = [
        store.write(_bytes('{}'), receivedAt, digest: hubDigest),
        store.writeCursor(const StoredEventCursor(lastSeenSeq: 2)),
        store.clear(),
        store.writeCursor(const StoredEventCursor(lastSeenSeq: 3)),
      ];
      await Future.wait(pending);
      expect(root().existsSync(), isFalse);
      expect(await store.readCursor(), isNull);
    });

    test('a read queued behind a write sees the whole snapshot', () async {
      final write = store.write(
        _bytes('{"n":1}'),
        receivedAt,
        digest: hubDigest,
      );
      final read = store.read();
      await write;
      expect((await read)!.digest, hubDigest);
    });
  });

  test('a snapshot file that outgrew its meta is discarded', () async {
    await store.write(_bytes('{}'), receivedAt, digest: hubDigest);
    final dir = userDirectories().single as Directory;
    File(
      '${dir.path}/snapshot.json',
    ).writeAsBytesSync(Uint8List(mastermindSnapshotMaxBytes + 1));
    expect(await store.read(), isNull);
    expect(dir.existsSync(), isFalse);
  });
}
