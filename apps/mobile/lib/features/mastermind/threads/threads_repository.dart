import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';

class ThreadsFailure implements Exception {
  const ThreadsFailure(this.status, {this.retryAt});
  final int status;
  final DateTime? retryAt;
}

/// Session-owned, memory-only cache. Never persisted or shared between users.
class ThreadsRepository {
  ThreadsRepository({
    required Uri? base,
    required this.tokens,
    http.Client? client,
  }) : base = base == null
           ? null
           : MastermindHubConfig.parseBaseUrl(base.toString()),
       client = client ?? http.Client();
  final Uri? base;
  final AccessTokenProvider tokens;
  final http.Client client;
  List<ThreadEntry> index = [];
  final pages = <String, ThreadPage>{};
  bool _closed = false;
  void close() {
    _closed = true;
    index = [];
    pages.clear();
    client.close();
  }

  Future<Map<String, dynamic>> get(
    String path, [
    Map<String, String>? query,
  ]) async {
    if (_closed || base == null) throw const ThreadsFailure(503);
    final token = await tokens.currentAccessToken();
    if (_closed || token == null) throw const ThreadsFailure(401);
    final abort = Completer<void>();
    try {
      return await (() async {
        final request =
            http.AbortableRequest(
                'GET',
                base!.replace(path: path, queryParameters: query),
                abortTrigger: abort.future,
              )
              ..followRedirects = false
              ..headers.addAll({
                'Authorization': 'Bearer $token',
                'Accept': 'application/json',
              });
        final response = await client.send(request);
        if (response.statusCode != 200) {
          if (response.statusCode == 401 || response.statusCode == 403) {
            index = [];
            pages.clear();
          }
          final retry = response.headers['retry-after'];
          final seconds = int.tryParse(retry ?? '');
          DateTime? at;
          if (seconds != null && seconds >= 0) {
            at = DateTime.now().add(Duration(seconds: seconds));
          } else if (retry != null) {
            try {
              at = HttpDate.parse(retry);
            } on Object {
              /* absent */
            }
          }
          await response.stream.listen((_) {}).cancel();
          throw ThreadsFailure(response.statusCode, retryAt: at);
        }
        final bytes = <int>[];
        await for (final chunk in response.stream) {
          bytes.addAll(chunk);
          if (bytes.length > 300000) throw const ThreadsFailure(503);
        }
        if (_closed) throw const ThreadsFailure(401);
        return object(jsonDecode(utf8.decode(bytes)));
      })().timeout(const Duration(seconds: 20));
    } finally {
      if (!abort.isCompleted) abort.complete();
    }
  }

  Future<bool> capabilities() async {
    try {
      final json = await get('/v1/threads/capabilities');
      return json['schema'] == 'threads-1' && json['read'] == true;
    } on ThreadsFailure catch (e) {
      if (e.status == 404) return false;
      rethrow;
    }
  }

  Future<List<ThreadEntry>> loadIndex() async {
    final json = await get('/v1/threads');
    if (json['schema'] != 'threads-1') throw const ThreadsFailure(503);
    return index = array(json['threads'])
        .map((v) => ThreadEntry.fromJson(object(v)))
        .where((t) => t.ref.isNotEmpty)
        .toList();
  }

  Future<ThreadPage> history(ThreadEntry thread, {String? before}) async {
    final page = ThreadPage.fromJson(
      await get('/v1/threads/${Uri.encodeComponent(thread.ref)}/messages', {
        'digest': thread.digest,
        'limit': '30',
        if (before != null) 'before': before,
      }),
    );
    if (page.digest != thread.digest) throw const ThreadsFailure(410);
    pages[thread.ref] = page;
    return page;
  }
}
