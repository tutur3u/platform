import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/parse/strict_json.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

/// Closed parsers for `/v1/iris/*`. An envelope that drifts (unknown or
/// missing key, wrong type, oversized value) is refused whole (null); one bad
/// feed message or device row is skipped so the rest still render.

/// Body caps, checked before a byte is decoded.
const int irisFeedMaxBytes = 256 * 1024 + 4096;
const int irisSmallMaxBytes = 16 * 1024;

/// Rows one feed page may carry (`limit` is 1..200).
const int irisFeedPageMaxMessages = 200;

final irisThreadRefPattern = RegExp(r'^item-[0-9a-f]{20}$');
final irisMessageRefPattern = RegExp(r'^m-[0-9a-f]{16}$');

/// A send id: 32 lowercase hex.
final irisSendIdPattern = RegExp(r'^[0-9a-f]{32}$');

/// The Idempotency-Key on a send: a lowercase UUID.
final irisIdempotencyKeyPattern = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

/// Receipt and device ids: opaque, URL-safe, never interpolated unchecked.
final irisIdPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _rfc3339Utc = RegExp(
  r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$',
);

T? _closed<T>(Uint8List bytes, int maxBytes, T Function(JsonReader) read) {
  if (bytes.length > maxBytes) return null;
  try {
    final decoded = jsonDecode(utf8.decode(bytes));
    if (decoded is! Map<String, dynamic>) return null;
    return read(JsonReader(decoded));
  } on FormatException {
    return null;
  } on SchemaViolation {
    return null;
  }
}

List<T> _rows<T>(JsonReader list, int maxItems, T Function(JsonReader) read) {
  final value = list.value;
  if (value is! List || value.length > maxItems) list.fail();
  final rows = <T>[];
  for (var i = 0; i < value.length; i++) {
    try {
      rows.add(read(JsonReader(value[i], '${list.path}/$i')));
    } on SchemaViolation {
      // One bad row is skipped; the rest still render.
    }
  }
  return List.unmodifiable(rows);
}

DateTime _timestamp(JsonReader r) {
  final text = r.string(maxLength: 40, pattern: _rfc3339Utc);
  final parsed = DateTime.tryParse(text);
  if (parsed == null) r.fail();
  // DateTime.parse rolls 02-30 over to March; the contract does not.
  if (parsed.toUtc().toIso8601String().substring(0, 19) !=
      text.substring(0, 19)) {
    r.fail();
  }
  return parsed.toUtc();
}

const _pageKeys = [
  'thread_ref',
  'history_digest',
  'messages',
  'more',
  'next_before',
];

/// `GET /v1/iris/feed`: the `threads-1` page, plus `next_after` on a forward
/// poll. `thread_ref` is opaque (the strict `item-` pattern). A page that says
/// `more` without a cursor is drift.
IrisFeedPage? parseIrisFeedPage(Uint8List bytes) =>
    _closed(bytes, irisFeedMaxBytes, (r) {
      r.keys(const [..._pageKeys, 'next_after'], _pageKeys);
      final more = r.field('more').boolean();
      final before = r
          .field('next_before')
          .nullable((v) => v.string(pattern: irisMessageRefPattern));
      if (more != (before != null)) r.fail();
      r.field('thread_ref').string(pattern: irisThreadRefPattern);
      r.field('history_digest').string(pattern: _digest);
      final after = r.has('next_after')
          ? r
                .field('next_after')
                .nullable((v) => v.string(pattern: irisMessageRefPattern))
          : null;
      return IrisFeedPage(
        messages: _rows(r.field('messages'), irisFeedPageMaxMessages, _message),
        nextBefore: before,
        nextAfter: after,
      );
    });

const _messageKeys = [
  'msg_ref',
  'author',
  'author_label',
  'created_at',
  'text',
  'truncated',
  'withheld',
  'redactions',
  'activity',
];
const _redactionKeys = ['path', 'url', 'secret', 'id', 'email', 'number'];
const _activityKeys = ['commands', 'edits', 'searches', 'subagents'];

/// The relay words authors `user` / `agent` (with `system` for notices);
/// `threads-1` hubs say `owner_mac` / `owner_phone`. Both map onto the
/// `threads-1` model, and both are display-only: no authority follows from it.
const Map<String, ThreadAuthor> _authors = {
  'user': ThreadAuthor.ownerPhone,
  'owner_phone': ThreadAuthor.ownerPhone,
  'owner_mac': ThreadAuthor.ownerMac,
  'agent': ThreadAuthor.agent,
  'system': ThreadAuthor.system,
};

ThreadMessage _message(JsonReader r) {
  r.keys(_messageKeys, _messageKeys);
  final redactions = r.field('redactions')
    ..keys(_redactionKeys, _redactionKeys);
  for (final key in _redactionKeys) {
    redactions.field(key).integer(min: 0, max: 10000);
  }
  final withheld = r.field('withheld').boolean();
  final text = r.field('text').string(maxLength: 16000);
  // A withheld row carries no text; one that still does has drifted.
  if (withheld && text.isNotEmpty) r.fail();
  return ThreadMessage(
    ref: r.field('msg_ref').string(pattern: irisMessageRefPattern),
    author: _authors[r.field('author').stringIn(_authors.keys.toSet())]!,
    authorLabel: r.field('author_label').string(maxLength: 40),
    createdAt: _timestamp(r.field('created_at')),
    text: text,
    truncated: r.field('truncated').boolean(),
    withheld: withheld,
    activity: r.field('activity').nullable((a) {
      a.keys(_activityKeys, _activityKeys);
      int count(String key) => a.field(key).integer(min: 0, max: 100000);
      return ThreadActivity(
        commands: count('commands'),
        edits: count('edits'),
        searches: count('searches'),
        subagents: count('subagents'),
      );
    }),
  );
}

/// `POST /v1/iris/send` (202, `{"id","state":"received"}`) and
/// `GET /v1/iris/send/<id>`. `delivery` is non-null only on delivered and
/// acked receipts; received and failed always carry null.
IrisReceipt? parseIrisReceipt(Uint8List bytes) => _closed(
  bytes,
  irisSmallMaxBytes,
  (r) {
    r.keys(const ['id', 'state', 'delivery'], const ['id', 'state']);
    final state = r.field('state').enumOf(const [
      IrisReceiptState.received,
      IrisReceiptState.delivered,
      IrisReceiptState.acked,
      IrisReceiptState.failed,
    ], (s) => s.name);
    final delivery = r.has('delivery')
        ? r
              .field('delivery')
              .nullable((d) => d.enumOf(IrisDelivery.values, (v) => v.name))
        : null;
    final carries =
        state == IrisReceiptState.delivered || state == IrisReceiptState.acked;
    if (delivery != null && !carries) r.fail();
    return IrisReceipt(
      id: r.field('id').string(pattern: irisSendIdPattern),
      state: state,
      delivery: delivery,
    );
  },
);

/// `GET /v1/iris/summary`.
IrisSummary? parseIrisSummary(Uint8List bytes) => _closed(
  bytes,
  irisSmallMaxBytes,
  (r) {
    r.keys(const ['asks', 'roles', 'usage'], const ['asks', 'roles', 'usage']);
    final asks = r.field('asks')
      ..keys(const ['urgent', 'soon', 'fyi'], const ['urgent', 'soon', 'fyi']);
    int count(String key) => asks.field(key).integer(min: 0, max: 10000);
    return IrisSummary(
      urgent: count('urgent'),
      soon: count('soon'),
      fyi: count('fyi'),
      roles: _rows(r.field('roles'), 24, (row) {
        row.keys(const ['role', 'status'], const ['role', 'status']);
        return IrisRoleLine(
          role: row.field('role').string(maxLength: 40),
          status: row
              .field('status')
              .enumOf(IrisRoleStatus.values, (s) => s.name),
        );
      }),
      usage: r.field('usage').nullable((u) => u.string(maxLength: 120)),
    );
  },
);

const _deviceKeys = [
  'id',
  'device_name',
  'fingerprint_prefix',
  'created_at',
  'revoked',
  'current',
];

/// One row of `GET /v1/iris/devices`: every key required, nothing else.
IrisDevice _device(JsonReader r) {
  r.keys(_deviceKeys, _deviceKeys);
  final revoked = r.field('revoked').boolean();
  return IrisDevice(
    id: r.field('id').string(pattern: irisIdPattern),
    label: r.field('device_name').string(maxLength: 80),
    status: revoked ? IrisDeviceStatus.revoked : IrisDeviceStatus.confirmed,
    fingerprintPrefix: r
        .field('fingerprint_prefix')
        .string(pattern: RegExp(r'^[0-9a-f]{8}$')),
    createdAt: _timestamp(r.field('created_at')),
    current: r.field('current').boolean(),
  );
}

/// `GET /v1/iris/devices` (device-signed, no query): confirmed and revoked
/// devices. A Worker without the route answers 404, which the devices page
/// shows as "list unavailable".
List<IrisDevice>? parseIrisDevices(Uint8List bytes) =>
    _closed(bytes, irisSmallMaxBytes, (r) {
      r.keys(const ['devices'], const ['devices']);
      return _rows(r.field('devices'), 64, _device);
    });

/// `GET /v1/iris/devices/<id>`.
IrisDevice? parseIrisDevice(Uint8List bytes) =>
    _closed(bytes, irisSmallMaxBytes, _device);

/// The relay's `202` to `POST /v1/iris/enrol`: `{state: "pending",
/// pending_id, fingerprint_prefix, device_name, code}`. `command` is being
/// retired: it may still be present and is never read. `pending_id` is the
/// device id, the prefix the first 8 hex of the [fingerprint] that was sent,
/// and the code the [code] that was sent; anything else is refused. The
/// pending record lives 15 minutes from [now]; the relay sends no expiry.
/// The prefix stays in the relay's lowercase form so it reads the same as the
/// enrol page.
IrisEnrollment? parseIrisRelayEnrolment(
  Uint8List bytes, {
  required String deviceId,
  required String fingerprint,
  required String code,
  required DateTime now,
}) => _closed(bytes, irisSmallMaxBytes, (r) {
  const required = [
    'state',
    'pending_id',
    'fingerprint_prefix',
    'device_name',
    'code',
  ];
  r.keys(const [...required, 'command'], required);
  r.field('state').string(constant: 'pending');
  r.field('pending_id').string(constant: deviceId);
  r.field('device_name').string(maxLength: 80);
  final prefix = r
      .field('fingerprint_prefix')
      .string(pattern: RegExp(r'^[0-9a-f]{8}$'));
  if (!fingerprint.startsWith(prefix)) r.fail();
  return IrisEnrollment(
    deviceId: deviceId,
    code: r.field('code').string(constant: code),
    fingerprintPrefix: prefix,
    expiresAt: now.toUtc().add(const Duration(minutes: 15)),
  );
});

/// The `error` class of a non-2xx reply (`{"error":"<class>"}`; a
/// `clock_skew` body also carries `server_time`, which is never read).
String? irisErrorClass(Uint8List bytes) {
  if (bytes.length > 1024) return null;
  try {
    final decoded = jsonDecode(utf8.decode(bytes));
    final value = decoded is Map<String, dynamic> ? decoded['error'] : null;
    return value is String && RegExp(r'^[a-z_]{1,40}$').hasMatch(value)
        ? value
        : null;
  } on FormatException {
    return null;
  }
}
