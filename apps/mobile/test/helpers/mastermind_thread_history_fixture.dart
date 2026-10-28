import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';

/// `item-` + 20 hex for [i].
String threadRef(int i) => 'item-${i.toRadixString(16).padLeft(20, '0')}';

/// `m-` + 16 hex for [i].
String msgRef(int i) => 'm-${i.toRadixString(16).padLeft(16, '0')}';

/// A 64-hex digest made of [c].
String digestOf(String c) => c * 64;

Uint8List jsonBytes(Object json) =>
    Uint8List.fromList(utf8.encode(jsonEncode(json)));

Map<String, dynamic> capsJson({bool read = true, int pageMax = 50}) => {
  'schema': 'threads-1',
  'read': read,
  'send': false,
  'model_select': false,
  'limits': {'text_max': 1000, 'lines_max': 20, 'page_max': pageMax},
  'policy_version': 'threads-policy-1',
};

Map<String, dynamic> indexRow({
  int i = 1,
  String title = '[Ops] Release Desk',
  String role = 'Release Desk',
  String history = 'redacted',
  String? digest,
}) => {
  'thread_ref': threadRef(i),
  'title': title,
  'role': role,
  'kind': 'role',
  'parent_ref': null,
  'product': 'Tuturuuu',
  'area': 'release',
  'state': 'waiting',
  'state_age_seconds': 720,
  'provider_model': 'claude / claude-opus-5-5',
  'history': history,
  'send': 'off',
  'model_select': 'off',
  'allowed_models': <String>[],
  'last_msg_ref': msgRef(99),
  'history_digest': history == 'none' ? null : (digest ?? digestOf('a')),
  'message_count': 3,
  'preview': 'Ready for review',
};

Map<String, dynamic> indexJson(List<Map<String, dynamic>> rows) => {
  'schema': 'threads-1',
  'publisher_epoch': '0f8fad5b-d9cb-469f-a165-70867728950e',
  'generated_at': '2026-10-28T13:00:00Z',
  'index_seq': 12,
  'models': [
    {
      'model_id': 'claude/claude-sonnet-5-5',
      'provider': 'claude',
      'label': 'Sonnet 5.5',
      'tier': 'standard',
    },
  ],
  'threads': rows,
};

Map<String, dynamic> messageJson(
  int i, {
  String? text,
  String author = 'agent',
  String label = 'Release Desk',
  bool withheld = false,
  bool truncated = false,
  Map<String, int>? activity,
}) => {
  'msg_ref': msgRef(i),
  'author': author,
  'author_label': label,
  'created_at': '2026-10-28T07:${(i % 60).toString().padLeft(2, '0')}:00Z',
  'text': text ?? 'Message $i',
  'truncated': truncated,
  'withheld': withheld,
  'redactions': {
    'path': 0,
    'url': 0,
    'secret': 0,
    'id': 0,
    'email': 0,
    'number': 0,
  },
  'activity': activity,
};

Map<String, dynamic> pageJson({
  int i = 1,
  String? digest,
  List<Map<String, dynamic>> messages = const [],
  String? nextBefore,
}) => {
  'thread_ref': threadRef(i),
  'history_digest': digest ?? digestOf('a'),
  'messages': messages,
  'more': nextBefore != null,
  'next_before': nextBefore,
};

final class FakeThreadTokens implements AccessTokenProvider {
  FakeThreadTokens({this.current = 'token-1', this.refreshed = 'token-2'});
  String? current;
  String? refreshed;
  int refreshes = 0;

  @override
  Future<String?> currentAccessToken() async => current;

  @override
  Future<String?> refreshAccessToken() async {
    refreshes++;
    return current = refreshed;
  }
}

/// A scripted hub: [handle] answers each request; [requests] records them.
final class FakeThreadsHub {
  FakeThreadsHub(this.handle, {FakeThreadTokens? tokens})
    : tokens = tokens ?? FakeThreadTokens();

  http.Response Function(http.Request request) handle;
  final FakeThreadTokens tokens;
  final requests = <http.Request>[];

  HubThreadHistorySource source() => HubThreadHistorySource(
    baseUrl: Uri.parse('https://hub.example'),
    tokens: tokens,
    client: MockClient((request) async {
      requests.add(request);
      return handle(request);
    }),
  );

  List<String> get paths => [for (final r in requests) r.url.path];

  /// A hub that serves [caps], [index] and pages from [pages] by `before`.
  static http.Response Function(http.Request) serving({
    Object? caps,
    Object? index,
    Map<String?, Object> pages = const {},
  }) => (request) {
    final path = request.url.path;
    if (path == '/v1/threads/capabilities') {
      return http.Response.bytes(jsonBytes(caps ?? capsJson()), 200);
    }
    if (path == '/v1/threads') {
      return http.Response.bytes(
        jsonBytes(index ?? indexJson([indexRow()])),
        200,
      );
    }
    final page = pages[request.url.queryParameters['before']];
    if (page == null) return http.Response('{"error":"not_found"}', 404);
    if (page is http.Response) return page;
    return http.Response.bytes(jsonBytes(page), 200);
  };
}
