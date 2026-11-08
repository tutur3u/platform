import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/event_feed.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

/// The native flavor and explicit opt-in must both be present.
final class FixtureSnapshotSource implements MastermindSnapshotSource {
  FixtureSnapshotSource({AssetBundle? bundle, DateTime Function()? clock})
    : _bundle = bundle ?? rootBundle,
      _clock = clock ?? DateTime.now;

  final AssetBundle _bundle;
  final DateTime Function() _clock;
  static const assetPath = 'assets/dev/mastermind/sample_snapshot.json';

  @override
  bool get isConfigured =>
      appFlavor == 'development' &&
      const bool.fromEnvironment('MASTERMIND_FIXTURE');

  Future<_FixtureExport?> _export() async {
    final data = await _bundle.load(assetPath);
    final bytes = data.buffer.asUint8List(
      data.offsetInBytes,
      data.lengthInBytes,
    );
    final parsed = parseMastermindSnapshot(bytes);
    if (parsed is! ParseAccepted) return null;
    final snapshot = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    final now = snapshot['now'] as Map<String, dynamic>;
    final events = {
      'schema_version': '1.4',
      'after_seq': now['after_seq'],
      'latest_seq': now['latest_seq'],
      'cursor_gap': now['cursor_gap'],
      'events': now['digest'],
    };
    final envelope = {
      'transport_version': 1,
      'publisher_epoch': '00000000-0000-4000-8000-000000000023',
      'snapshot': snapshot,
      'events': events,
    };
    // Only this synthetic publisher creates an identity. Consumers preserve it.
    final digest = sha256
        .convert(utf8.encode(jsonEncode(_sorted(envelope))))
        .toString();
    return _FixtureExport(bytes, parsed.snapshot, digest);
  }

  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) async {
    if (!isConfigured) {
      return const SnapshotFetch.unavailable(
        SnapshotUnavailableKind.notConfigured,
      );
    }
    try {
      final export = await _export();
      if (export == null) {
        return const SnapshotFetch.unavailable(
          SnapshotUnavailableKind.unavailable,
        );
      }
      final digest = export.digest;
      final receivedAt = _clock().toUtc();
      if (ifNoneMatch == digest ||
          ifNoneMatch == '"$digest"' ||
          ifNoneMatch == '*') {
        return SnapshotFetch.notModified(digest, receivedAt);
      }
      return SnapshotFetch.ok(
        export.bytes,
        receivedAt,
        digest: digest,
        origin: SnapshotOrigin.fixture,
      );
    } on Exception {
      return const SnapshotFetch.unavailable(
        SnapshotUnavailableKind.unavailable,
      );
    }
  }

  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async {
    RangeError.checkNotNegative(afterSeq, 'afterSeq');
    RangeError.checkValueInInterval(limit, 1, 200, 'limit');
    if (!isConfigured) {
      return const EventsFetch.unavailable(
        SnapshotUnavailableKind.notConfigured,
      );
    }
    try {
      final export = await _export();
      if (export == null) {
        return const EventsFetch.unavailable(
          SnapshotUnavailableKind.unavailable,
        );
      }
      if (export.digest != digest) {
        return const EventsFetch.unavailable(
          SnapshotUnavailableKind.digestNotFound,
        );
      }
      final now = export.snapshot.now;
      if (afterSeq > now.latestSeq) {
        return const EventsFetch.unavailable(
          SnapshotUnavailableKind.cursorAhead,
        );
      }
      // Mirrors the Worker's GET /v1/events: `after_seq` is the cursor after
      // the page, and a join that is not exactly `cursor + 1` is a gap.
      var cursor = max(afterSeq, now.afterSeq);
      final events = now.digest
          .where((event) => event.seq > cursor)
          .take(limit)
          .toList();
      var gap =
          afterSeq < now.afterSeq ||
          (now.cursorGap && afterSeq <= now.afterSeq);
      for (final event in events) {
        if (event.seq != cursor + 1) gap = true;
        cursor = event.seq;
      }
      if (events.isEmpty && cursor < now.latestSeq) gap = true;
      return EventsFetch.ok(
        MastermindEventFeed(
          afterSeq: cursor,
          latestSeq: now.latestSeq,
          cursorGap: gap,
          events: events,
        ),
        digest,
        _clock().toUtc(),
      );
    } on Exception {
      return const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
    }
  }
}

Object? _sorted(Object? value) {
  if (value is Map<String, dynamic>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _sorted(value[key])};
  }
  if (value is List) return value.map(_sorted).toList();
  return value;
}

final class _FixtureExport {
  const _FixtureExport(this.bytes, this.snapshot, this.digest);
  final Uint8List bytes;
  final MastermindSnapshot snapshot;
  final String digest;
}
