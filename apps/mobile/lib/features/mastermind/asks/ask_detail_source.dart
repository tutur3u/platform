import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show appFlavor;
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';

const _askDetailsDefine = bool.fromEnvironment('MASTERMIND_ASK_DETAILS');
bool? _askDetailsOverride;

/// Whether the detail page may request the optional full ask
/// (`MASTERMIND_ASK_DETAILS`, default off). `GET /v1/asks/<id>` is a pending
/// hub security decision; until it ships, the page uses snapshot fields only.
bool get mastermindAskDetailsEnabled =>
    _askDetailsOverride ?? _askDetailsDefine;

/// Forces the flag on or off, or restores the build default with `null`.
/// Tests only.
@visibleForTesting
void debugOverrideMastermindAskDetails({required bool? enabled}) =>
    _askDetailsOverride = enabled;

/// The outcome of one optional full-ask read.
sealed class AskDetailFetch {
  const AskDetailFetch();
}

final class AskDetailFound extends AskDetailFetch {
  const AskDetailFound(this.detail);
  final AskDetail detail;
}

/// 404: the hub withholds this ask (sensitive) or no longer has it. The page
/// shows the neutral "Details are on the Mac" card.
final class AskDetailWithheld extends AskDetailFetch {
  const AskDetailWithheld();
}

/// Anything else (offline, 401/403, 5xx, a malformed body): the page keeps its
/// snapshot-only view.
final class AskDetailUnavailable extends AskDetailFetch {
  const AskDetailUnavailable();
}

/// The optional full-ask read, approved for non-sensitive items only.
abstract interface class MastermindAskDetailSource {
  Future<AskDetailFetch> fetch(String itemId);
}

/// The source for this build: none unless the flag is on and a live hub is
/// configured. A fixture build never fetches.
MastermindAskDetailSource? createMastermindAskDetailSource({
  AccessTokenProvider? tokens,
  http.Client? client,
  Uri? hubUrl,
  bool? enabled,
}) {
  if (!(enabled ?? mastermindAskDetailsEnabled)) return null;
  if (FixtureSnapshotSource().isConfigured) return null;
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  final base = hubUrl ?? MastermindHubConfig.resolve(flavor: appFlavor);
  if (base == null) return null;
  final live = HubAskDetailSource(
    baseUrl: base,
    tokens: tokens ?? const SupabaseAccessTokenProvider(),
    client: client,
  );
  return live.isConfigured ? live : null;
}

/// `GET /v1/asks/<item_id>` over the same owner-only transport and token
/// provider as POST /v1/replies: the bearer token lives only in the request
/// headers, redirects are not followed, the body is size-capped, and nothing
/// from the request or the response is logged. A 401 earns one silent refresh.
final class HubAskDetailSource implements MastermindAskDetailSource {
  HubAskDetailSource({
    required Uri? baseUrl,
    required AccessTokenProvider tokens,
    http.Client? client,
    this.timeout = const Duration(seconds: 15),
  }) : _base = baseUrl == null
           ? null
           : MastermindHubConfig.parseBaseUrl(baseUrl.toString()),
       _tokens = tokens,
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  static const int maxBytes = 64 * 1024;
  static final _itemId = RegExp(r'^item-[a-f0-9]{20}$');

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  bool get isConfigured => _base != null;

  void close() {
    if (_ownsClient) _client.close();
  }

  @override
  Future<AskDetailFetch> fetch(String itemId) async {
    const unavailable = AskDetailUnavailable();
    final base = _base;
    if (base == null || !_itemId.hasMatch(itemId)) return unavailable;
    try {
      final uri = base.replace(pathSegments: ['v1', 'asks', itemId]);
      var token = await _usable(_tokens.currentAccessToken());
      var refreshed = false;
      if (token == null) {
        token = await _usable(_tokens.refreshAccessToken());
        refreshed = true;
        if (token == null) return unavailable;
      }
      var reply = await _get(uri, token);
      if (reply.status == 401 && !refreshed) {
        final fresh = await _usable(_tokens.refreshAccessToken());
        if (fresh != null && fresh != token) reply = await _get(uri, fresh);
      }
      if (reply.status == 404) return const AskDetailWithheld();
      final bytes = reply.bytes;
      if (reply.status != 200 || bytes == null) return unavailable;
      final detail = parseAskDetail(jsonDecode(utf8.decode(bytes)));
      return detail != null && detail.id == itemId
          ? AskDetailFound(detail)
          : unavailable;
    } on Object {
      return unavailable;
    }
  }

  Future<String?> _usable(Future<String?> token) async {
    final value = await token;
    return value == null || value.isEmpty ? null : value;
  }

  Future<_Reply> _get(Uri uri, String token) async {
    final abort = Completer<void>();
    try {
      return await _exchange(uri, token, abort.future).timeout(
        timeout,
        onTimeout: () {
          if (!abort.isCompleted) abort.complete();
          throw TimeoutException(null);
        },
      );
    } on Object {
      if (!abort.isCompleted) abort.complete();
      rethrow;
    }
  }

  Future<_Reply> _exchange(Uri uri, String token, Future<void> aborted) async {
    final request = http.AbortableRequest('GET', uri, abortTrigger: aborted)
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        'Cache-Control': 'no-store',
      });
    final response = await _client.send(request);
    final bytes = <int>[];
    await for (final chunk in response.stream) {
      bytes.addAll(chunk);
      // An oversized body is dropped whole rather than parsed in part.
      if (bytes.length > maxBytes) return _Reply(response.statusCode);
    }
    return _Reply(response.statusCode, bytes: bytes);
  }
}

final class _Reply {
  const _Reply(this.status, {this.bytes});
  final int status;
  final List<int>? bytes;
}
