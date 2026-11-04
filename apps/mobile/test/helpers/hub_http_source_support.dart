import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import 'mastermind_hub_harness.dart';

HubHttpSnapshotSource hubSource(
  FakeHub hub,
  FakeTokens tokens, {
  Duration timeout = const Duration(seconds: 5),
  List<String>? diagnostics,
}) => HubHttpSnapshotSource(
  baseUrl: hubBase,
  tokens: tokens,
  client: hub.client,
  timeout: timeout,
  clock: () => DateTime.utc(2026, 10, 28, 7),
  diagnostics: diagnostics?.add,
);

SnapshotUnavailableKind snapshotKind(SnapshotFetch fetch) =>
    (fetch as SnapshotFetchUnavailable).kind;

const Map<String, Object> hubEmptyFeed = {
  'schema_version': '1.4',
  'after_seq': 5,
  'latest_seq': 5,
  'cursor_gap': false,
  'events': <Object>[],
};

final class ThrowingTokens implements AccessTokenProvider {
  @override
  Future<String?> currentAccessToken() async => throw StateError('no session');
  @override
  Future<String?> refreshAccessToken() async => throw StateError('no session');
}

final class CountingClient extends http.BaseClient {
  CountingClient(this._inner);
  final http.Client _inner;
  int closed = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _inner.send(request);

  @override
  void close() => closed++;
}
