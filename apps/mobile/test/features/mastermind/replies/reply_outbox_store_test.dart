import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/file_snapshot_store.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';

import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

OutboxEntry _entry({
  String key = '11111111-1111-4111-8111-111111111111',
  int item = 1,
  DateTime? createdAt,
  String? text,
}) => OutboxEntry(
  idempotencyKey: key,
  itemId: inboxItemId(item),
  versionHash: inboxHash('a'),
  createdAt: createdAt ?? DateTime.utc(2026, 1, 31, 17),
  optionIndex: text == null ? 0 : null,
  optionLabel: text == null ? 'Approve' : null,
  text: text,
);

void main() {
  late Directory base;
  String? user;
  late FileOutboxStore store;
  final now = DateTime.utc(2026, 1, 31, 18);

  Directory root() => Directory('${base.path}/mastermind');
  List<File> outboxFiles() => [
    for (final dir in root().existsSync() ? root().listSync() : <Object>[])
      if (dir is Directory)
        for (final file in dir.listSync())
          if (file is File && file.path.contains('outbox')) file,
  ];

  setUp(() {
    base = Directory.systemTemp.createTempSync('mastermind_outbox_');
    user = 'user-a';
    store = FileOutboxStore(
      baseDirectory: () async => base,
      userId: () => user,
      clock: () => now,
    );
  });

  tearDown(() {
    if (base.existsSync()) base.deleteSync(recursive: true);
  });

  test('persists queued replies, key included, across a new store', () async {
    await store.write([_entry(), _entry(key: _k2, item: 2, text: 'Thanks')]);
    final reopened = FileOutboxStore(
      baseDirectory: () async => base,
      userId: () => user,
      clock: () => now,
    );
    final entries = await reopened.read();
    expect(entries.map((e) => e.idempotencyKey), [
      '11111111-1111-4111-8111-111111111111',
      _k2,
    ]);
    expect(entries.last.text, 'Thanks');
    expect(entries.first.status, OutboxStatus.pending);
  });

  test('writes are atomic and the directory never carries the user id', () {
    return store.write([_entry()]).then((_) {
      final names = outboxFiles().map((f) => f.uri.pathSegments.last).toSet();
      expect(names, {'outbox.json'});
      expect(outboxFiles().single.path.contains('user-a'), isFalse);
    });
  });

  test('is per user: another account never reads this outbox', () async {
    await store.write([_entry()]);
    user = 'user-b';
    expect(await store.read(), isEmpty);
    user = 'user-a';
    expect(await store.read(), hasLength(1));
  });

  test('without a signed-in user nothing is read or written', () async {
    user = null;
    await store.write([_entry()]);
    expect(outboxFiles(), isEmpty);
    expect(await store.read(), isEmpty);
  });

  test('an empty list removes the file', () async {
    await store.write([_entry()]);
    await store.write(const []);
    expect(outboxFiles(), isEmpty);
  });

  test('entries older than seven days are dropped on read', () async {
    await store.write([
      _entry(createdAt: now.subtract(const Duration(days: 8))),
      _entry(key: _k2, item: 2),
    ]);
    expect((await store.read()).map((e) => e.itemId), [inboxItemId(2)]);
  });

  test('corrupt, wrong-schema and oversized files are discarded', () async {
    await store.write([_entry()]);
    final file = outboxFiles().single;
    for (final content in [
      '{not json',
      jsonEncode({'schema': 9, 'entries': <Object>[]}),
      jsonEncode({'schema': 1, 'entries': 'x'}),
      'x' * 300000,
    ]) {
      file.writeAsStringSync(content);
      expect(await store.read(), isEmpty, reason: content.length.toString());
      expect(file.existsSync(), isFalse);
      await store.write([_entry()]);
    }
  });

  test('one bad entry does not poison the others', () async {
    await store.write([_entry(), _entry(key: _k2, item: 2)]);
    final file = outboxFiles().single;
    final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    (json['entries'] as List<dynamic>).insert(0, {'key': 'broken'});
    file.writeAsStringSync(jsonEncode(json));
    expect(await store.read(), hasLength(2));
  });

  test('clear erases every user outbox, even with no user signed in', () async {
    await store.write([_entry()]);
    user = 'user-b';
    await store.write([_entry(item: 3)]);
    user = null;
    await store.clear();
    expect(outboxFiles(), isEmpty);
  });

  test('the snapshot cache clear (logout, switch) erases the outbox', () async {
    await store.write([_entry()]);
    final snapshots = FileSnapshotStore(
      baseDirectory: () async => base,
      userId: () => user,
    );
    await snapshots.clear();
    expect(outboxFiles(), isEmpty);
    expect(await store.read(), isEmpty);
  });

  test('a write queued behind a clear for a signed-out user is a no-op', () {
    user = null;
    return store.write([_entry()]).then((_) => expect(outboxFiles(), isEmpty));
  });

  test('snapshot writes leave the outbox beside them untouched', () async {
    await store.write([_entry()]);
    final snapshots = FileSnapshotStore(
      baseDirectory: () async => base,
      userId: () => user,
    );
    await snapshots.write(
      utf8.encode('{}').buffer.asUint8List(),
      now,
      digest: hubDigest,
    );
    expect(await store.read(), hasLength(1));
  });
}

const _k2 = '22222222-2222-4222-8222-222222222222';
