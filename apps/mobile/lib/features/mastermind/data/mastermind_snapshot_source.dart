import 'dart:typed_data';

import 'package:mobile/features/mastermind/model/event_feed.dart';

/// Inject into the HTTP adapter; read the current session per request.
/// Never persist or log the returned token. No publisher/static key is accepted.
abstract interface class AccessTokenProvider {
  Future<String?> currentAccessToken();

  /// One silent session refresh after a 401. Null only when the session is
  /// truly gone (no session, or an invalid refresh token), which the adapter
  /// reports as lost access. A transient failure (offline, server error,
  /// client not ready) must throw instead: the adapter then reports the hub
  /// as unavailable and the cached data stays.
  Future<String?> refreshAccessToken();
}

abstract interface class MastermindSnapshotSource {
  bool get isConfigured;

  /// GET /v1/snapshot. Authenticate before reads and conditional 304 responses.
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch});

  /// GET /v1/events from the same immutable export. Never follow a newer digest.
  /// Invalid cursors or limits outside 1..200 throw [RangeError].
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  });
}

enum SnapshotOrigin { fixture, live, cache }

enum SnapshotUnavailableKind {
  notConfigured,
  unavailable,
  digestNotFound,

  /// 409 `cursor_ahead`: the cursor is past the export's `latest_seq`. Adopt a
  /// fresh snapshot and restart from its cursor, as for [EventFeedResync].
  cursorAhead,

  /// 401 after one silent session refresh. Access is lost; clear the cache.
  unauthorized,

  /// 403: the account is not an allowed reader. Clear the cache.
  forbidden,

  /// 404 on the snapshot route: nothing has been published yet.
  noSnapshot;

  /// The reader lost access, so cached data must not stay on the device.
  bool get isAccessLost => this == unauthorized || this == forbidden;
}

sealed class SnapshotFetch {
  const SnapshotFetch();
  factory SnapshotFetch.ok(
    Uint8List bytes,
    DateTime receivedAt, {
    required String digest,
    SnapshotOrigin origin,
  }) = SnapshotFetchOk;
  const factory SnapshotFetch.notModified(String digest, DateTime receivedAt) =
      SnapshotFetchNotModified;
  const factory SnapshotFetch.unavailable(SnapshotUnavailableKind kind) =
      SnapshotFetchUnavailable;
}

final class SnapshotFetchOk extends SnapshotFetch {
  SnapshotFetchOk(
    Uint8List bytes,
    this.receivedAt, {
    required this.digest,
    this.origin = SnapshotOrigin.live,
  }) : bytes = Uint8List.fromList(bytes).asUnmodifiableView();
  final Uint8List bytes;
  final DateTime receivedAt;

  /// Opaque export identity from X-Hub-Digest or the quoted ETag.
  /// It identifies the full envelope, never the snapshot bytes.
  final String digest;
  String get etag => '"$digest"';
  final SnapshotOrigin origin;
}

final class SnapshotFetchNotModified extends SnapshotFetch {
  const SnapshotFetchNotModified(this.digest, this.receivedAt);
  final String digest;
  final DateTime receivedAt;
}

final class SnapshotFetchUnavailable extends SnapshotFetch {
  const SnapshotFetchUnavailable(this.kind);
  final SnapshotUnavailableKind kind;
}

sealed class EventsFetch {
  const EventsFetch();
  const factory EventsFetch.ok(
    MastermindEventFeed feed,
    String digest,
    DateTime receivedAt,
  ) = EventsFetchOk;
  const factory EventsFetch.unavailable(SnapshotUnavailableKind kind) =
      EventsFetchUnavailable;
}

final class EventsFetchOk extends EventsFetch {
  const EventsFetchOk(this.feed, this.digest, this.receivedAt);
  final MastermindEventFeed feed;
  final String digest;
  final DateTime receivedAt;
}

final class EventsFetchUnavailable extends EventsFetch {
  const EventsFetchUnavailable(this.kind);
  final SnapshotUnavailableKind kind;

  bool get needsResync => kind == SnapshotUnavailableKind.cursorAhead;
}

/// Header normalization for the HTTP adapter, without retaining raw headers.
///
/// `X-Hub-Digest` is the hub's own header and wins when it is valid; an absent
/// or malformed ETag never invalidates it (a CDN may rewrite or weaken the
/// ETag when it compresses). A malformed `X-Hub-Digest`, or two valid headers
/// that disagree, is refused.
String? snapshotDigestFromHeaders({String? hubDigest, String? etag}) {
  final fromEtag = etag == null ? null : snapshotDigestFromEtag(etag);
  if (hubDigest == null) return fromEtag;
  if (!_isDigest(hubDigest)) return null;
  if (fromEtag != null && fromEtag != hubDigest) return null;
  return hubDigest;
}

/// The digest inside a strong `"<64 hex>"` or weak `W/"<64 hex>"` entity tag.
String? snapshotDigestFromEtag(String etag) {
  final opaque = etag.startsWith('W/') ? etag.substring(2) : etag;
  if (opaque.length != 66 || !opaque.startsWith('"') || !opaque.endsWith('"')) {
    return null;
  }
  final digest = opaque.substring(1, 65);
  return _isDigest(digest) ? digest : null;
}

final _digestPattern = RegExp(r'^[a-f0-9]{64}$');
bool _isDigest(String value) =>
    _digestPattern.matchAsPrefix(value)?.end == value.length;
