import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

import 'mastermind_snapshot_builder.dart';

const hubDigest =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const otherDigest =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

final hubBase = Uri.parse('https://hub.example.test');

/// Synthetic bearer tokens only; nothing here is a real credential.
final class FakeTokens implements AccessTokenProvider {
  FakeTokens({this.current = 'synthetic-token-1', this.refreshed});

  String? current;
  String? refreshed;

  /// When set, refreshing throws it (a retryable failure) instead of
  /// answering null (the session is gone).
  Exception? refreshError;
  int reads = 0;
  int refreshes = 0;

  @override
  Future<String?> currentAccessToken() async {
    reads++;
    return current;
  }

  @override
  Future<String?> refreshAccessToken() async {
    refreshes++;
    if (refreshError case final error?) throw error;
    return refreshed;
  }
}

final class RecordedRequest {
  RecordedRequest(http.BaseRequest request)
    : method = request.method,
      url = request.url,
      headers = Map.of(request.headers),
      followRedirects = request.followRedirects {
    if (request case http.Abortable(:final abortTrigger?)) {
      abortable = true;
      unawaited(abortTrigger.whenComplete(() => aborted = true));
    }
  }

  /// Whether the request carried an abort trigger, and whether it has fired.
  bool abortable = false;
  bool aborted = false;
  final String method;
  final Uri url;
  final Map<String, String> headers;
  final bool followRedirects;
}

typedef HubHandler =
    FutureOr<http.StreamedResponse> Function(RecordedRequest request);

/// A fake hub: every request is recorded, then answered by [handler].
final class FakeHub {
  FakeHub(this.handler) {
    client = MockClient.streaming((request, _) async {
      final recorded = RecordedRequest(request);
      requests.add(recorded);
      return handler(recorded);
    });
  }

  HubHandler handler;
  late final http.Client client;
  final requests = <RecordedRequest>[];
}

http.StreamedResponse hubReply(
  int status, {
  List<int> body = const [],
  Map<String, String> headers = const {},
  int? contentLength,
}) => http.StreamedResponse(
  Stream.value(Uint8List.fromList(body)),
  status,
  headers: headers,
  contentLength: contentLength ?? (body.isEmpty ? null : body.length),
);

http.StreamedResponse hubSnapshot({
  String digest = hubDigest,
  Map<String, dynamic>? json,
}) {
  final body = json == null
      ? MastermindSnapshotBuilder.defaults().bytes()
      : Uint8List.fromList(utf8.encode(jsonEncode(json)));
  return hubReply(
    200,
    body: body,
    headers: {'x-hub-digest': digest, 'etag': '"$digest"'},
  );
}

http.StreamedResponse hubError(int status, String error) =>
    hubReply(status, body: utf8.encode(jsonEncode({'error': error})));

Map<String, dynamic> snapshotJson({String? schemaVersion}) {
  final json = MastermindSnapshotBuilder.defaults().toJson();
  if (schemaVersion != null) json['schema_version'] = schemaVersion;
  return json;
}
