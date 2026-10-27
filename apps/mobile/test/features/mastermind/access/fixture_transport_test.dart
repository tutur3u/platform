import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import '../../../helpers/mastermind_snapshot_builder.dart';

class _Bundle extends CachingAssetBundle {
  _Bundle(this.bytes);
  Uint8List bytes;
  @override
  Future<ByteData> load(String key) async {
    expect(key, FixtureSnapshotSource.assetPath);
    return ByteData.sublistView(bytes);
  }
}

void main() {
  const enabled =
      appFlavor == 'development' && bool.fromEnvironment('MASTERMIND_FIXTURE');
  late _Bundle bundle;
  late MastermindSnapshotSource source;
  final receivedAt = DateTime.utc(2026, 2);
  setUp(() {
    final root = MastermindSnapshotBuilder.defaults().toJson();
    final now = root['now'] as Map<String, dynamic>;
    final template =
        (now['digest'] as List<dynamic>).first as Map<String, dynamic>;
    now['after_seq'] = 10;
    now['latest_seq'] = 260;
    now['cursor_gap'] = true;
    now['digest'] = [
      for (var seq = 11; seq <= 260; seq++) {...template, 'seq': seq},
    ];
    bundle = _Bundle(Uint8List.fromList(utf8.encode(jsonEncode(root))));
    source = FixtureSnapshotSource(bundle: bundle, clock: () => receivedAt);
  });
  group('configured fixture contract', () {
    test(
      'snapshot exposes an opaque export identity and quoted ETag',
      () async {
        final result = await source.fetchSnapshot() as SnapshotFetchOk;
        expect(result.bytes, bundle.bytes);
        expect(RegExp(r'^[a-f0-9]{64}$').hasMatch(result.digest), isTrue);
        final repeated = await source.fetchSnapshot() as SnapshotFetchOk;
        expect(result.digest, repeated.digest);
        expect(result.etag, '"${result.digest}"');
        expect(result.receivedAt, receivedAt);
        expect(result.origin, SnapshotOrigin.fixture);
        expect(() => result.bytes[0] = 0, throwsUnsupportedError);
      },
    );
    test('matching digest and ETag return notModified', () async {
      final first = await source.fetchSnapshot() as SnapshotFetchOk;
      for (final condition in [first.digest, first.etag, '*']) {
        final result = await source.fetchSnapshot(ifNoneMatch: condition);
        expect(result, isA<SnapshotFetchNotModified>());
        expect((result as SnapshotFetchNotModified).digest, first.digest);
        expect(result.receivedAt, receivedAt);
      }
      expect(
        await source.fetchSnapshot(ifNoneMatch: '"${'b' * 64}"'),
        isA<SnapshotFetchOk>(),
      );
    });
    test(
      'events are pinned, default to 100, retain cursor gap and sequences',
      () async {
        final snapshot = await source.fetchSnapshot() as SnapshotFetchOk;
        final result =
            await source.fetchEvents(digest: snapshot.digest, afterSeq: 10)
                as EventsFetchOk;
        expect(result.digest, snapshot.digest);
        expect(result.receivedAt, receivedAt);
        expect(result.feed.afterSeq, 10);
        expect(result.feed.latestSeq, 260);
        expect(result.feed.cursorGap, isTrue);
        expect(result.feed.events.length, 100);
        expect(result.feed.events.first.seq, 11);
        expect(result.feed.events.last.seq, 110);
        expect(result.feed.events.clear, throwsUnsupportedError);
      },
    );
    test(
      'explicit pagination never renumbers events and maximum is 200',
      () async {
        final snapshot = await source.fetchSnapshot() as SnapshotFetchOk;
        final result =
            await source.fetchEvents(
                  digest: snapshot.digest,
                  afterSeq: 60,
                  limit: 200,
                )
                as EventsFetchOk;
        expect(result.feed.events.length, 200);
        expect(result.feed.events.first.seq, 61);
        expect(result.feed.events.last.seq, 260);
        final end =
            await source.fetchEvents(digest: snapshot.digest, afterSeq: 260)
                as EventsFetchOk;
        expect(end.feed.events, isEmpty);
        expect(end.feed.cursorGap, isTrue);
      },
    );
    test(
      'older cursor makes retention gap explicit even if flag is false',
      () async {
        final root =
            jsonDecode(utf8.decode(bundle.bytes)) as Map<String, dynamic>;
        (root['now'] as Map<String, dynamic>)['cursor_gap'] = false;
        bundle.bytes = Uint8List.fromList(utf8.encode(jsonEncode(root)));
        final snapshot = await source.fetchSnapshot() as SnapshotFetchOk;
        final gap =
            await source.fetchEvents(digest: snapshot.digest, afterSeq: 0)
                as EventsFetchOk;
        expect(gap.feed.cursorGap, isTrue);
        final contiguous =
            await source.fetchEvents(digest: snapshot.digest, afterSeq: 10)
                as EventsFetchOk;
        expect(contiguous.feed.cursorGap, isFalse);
      },
    );
    test('digest mismatch cannot silently move to a newer export', () async {
      final old = await source.fetchSnapshot() as SnapshotFetchOk;
      final root =
          jsonDecode(utf8.decode(bundle.bytes)) as Map<String, dynamic>;
      (root['now'] as Map<String, dynamic>)['cursor_gap'] = false;
      bundle.bytes = Uint8List.fromList(utf8.encode(jsonEncode(root)));
      final result = await source.fetchEvents(digest: old.digest, afterSeq: 0);
      expect(result, isA<EventsFetchUnavailable>());
      expect(
        (result as EventsFetchUnavailable).kind,
        SnapshotUnavailableKind.digestNotFound,
      );
    });
  }, skip: !enabled);
  test('event cursor and limits are bounded before asset reads', () async {
    for (final limit in [0, 201]) {
      await expectLater(
        source.fetchEvents(digest: 'a' * 64, afterSeq: 0, limit: limit),
        throwsRangeError,
      );
    }
    await expectLater(
      source.fetchEvents(digest: 'a' * 64, afterSeq: -1),
      throwsRangeError,
    );
  });
  test('digest headers normalize without exposing rejected input', () {
    final a = 'a' * 64;
    expect(snapshotDigestFromHeaders(hubDigest: a), a);
    expect(snapshotDigestFromHeaders(etag: '"$a"'), a);
    expect(snapshotDigestFromHeaders(hubDigest: a, etag: '"$a"'), a);
    expect(
      snapshotDigestFromHeaders(hubDigest: a, etag: '"${'b' * 64}"'),
      isNull,
    );
    expect(snapshotDigestFromHeaders(etag: 'W/"$a"'), isNull);
    expect(snapshotDigestFromHeaders(hubDigest: '$a\n'), isNull);
    expect(snapshotDigestFromHeaders(hubDigest: 'not a digest'), isNull);
  });
}
