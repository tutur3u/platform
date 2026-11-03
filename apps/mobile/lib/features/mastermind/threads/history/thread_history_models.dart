import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/parse/strict_json.dart';

/// The `threads-1` hub contract (D §2) as the phone reads it for P1b history.
///
/// Every parser here is closed: an unknown key, a missing key, a wrong type or
/// an oversized value is drift. Drift in an envelope refuses the whole body
/// (null). Drift in one index row or one message skips only that row, so a
/// single bad row never hides the rest and never throws out of a parser.
const threadsSchema = 'threads-1';

/// `item-` + 20 hex: a hashed lane id, never a raw T3 thread id.
final threadRefPattern = RegExp(r'^item-[0-9a-f]{20}$');

/// `m-` + 16 hex: an HMAC of the message id, not linkable across hubs.
final _msgRef = RegExp(r'^m-[0-9a-f]{16}$');
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);
final _modelId = RegExp(r'^[a-z0-9][a-z0-9._/-]{0,79}$');
final _rfc3339Utc = RegExp(
  r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$',
);

/// Body caps, checked by the client before a byte is decoded.
const int threadsCapabilitiesMaxBytes = 4096;
const int threadsIndexMaxBytes = 96 * 1024;
const int threadsPageMaxBytes = 256 * 1024 + 4096;

/// Rows the phone keeps per thread: the hub's per-thread history object.
const threadHistoryMaxMessages = 200;

enum ThreadHistoryTier { none, redacted }

enum ThreadAuthor { ownerMac, ownerPhone, agent, system }

final class ThreadsCapabilities {
  const ThreadsCapabilities({required this.read, required this.pageMax});
  final bool read;
  final int pageMax;
}

/// One `/v1/threads` row, reduced to what history needs.
final class ThreadIndexEntry {
  const ThreadIndexEntry({
    required this.ref,
    required this.title,
    required this.role,
    required this.history,
    required this.digest,
  });

  final String ref;
  final String title;
  final String role;
  final ThreadHistoryTier history;

  /// Pins every history page; null when nothing is published.
  final String? digest;

  bool get readable => history == ThreadHistoryTier.redacted && digest != null;
}

final class ThreadActivity {
  const ThreadActivity({
    required this.commands,
    required this.edits,
    required this.searches,
    required this.subagents,
  });
  final int commands;
  final int edits;
  final int searches;
  final int subagents;

  bool get isEmpty =>
      commands == 0 && edits == 0 && searches == 0 && subagents == 0;
}

final class ThreadMessage {
  const ThreadMessage({
    required this.ref,
    required this.author,
    required this.authorLabel,
    required this.createdAt,
    required this.text,
    required this.truncated,
    required this.withheld,
    required this.activity,
  });

  final String ref;
  final ThreadAuthor author;
  final String authorLabel;
  final DateTime createdAt;
  final String text;
  final bool truncated;
  final bool withheld;
  final ThreadActivity? activity;
}

final class ThreadHistoryPage {
  const ThreadHistoryPage({
    required this.ref,
    required this.digest,
    required this.messages,
    required this.nextBefore,
  });

  final String ref;
  final String digest;

  /// Oldest first, as the hub orders them.
  final List<ThreadMessage> messages;

  /// The cursor for the next older page; null when there is none.
  final String? nextBefore;
}

Map<String, dynamic>? _decode(Uint8List bytes, int maxBytes) {
  if (bytes.length > maxBytes) return null;
  try {
    final decoded = jsonDecode(utf8.decode(bytes));
    return decoded is Map<String, dynamic> ? decoded : null;
  } on FormatException {
    return null;
  }
}

T? _closed<T>(Uint8List bytes, int maxBytes, T Function(JsonReader) read) {
  final json = _decode(bytes, maxBytes);
  if (json == null) return null;
  try {
    return read(JsonReader(json));
  } on SchemaViolation {
    return null;
  }
}

/// Reads [read] for every element, dropping the ones that drift.
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

String? _ref(JsonReader r, RegExp pattern) =>
    r.nullable((v) => v.string(pattern: pattern));

const _capabilityKeys = [
  'schema',
  'read',
  'send',
  'model_select',
  'limits',
  'policy_version',
];

/// GET /v1/threads/capabilities.
ThreadsCapabilities? parseThreadsCapabilities(Uint8List bytes) =>
    _closed(bytes, threadsCapabilitiesMaxBytes, (r) {
      r.keys(_capabilityKeys, _capabilityKeys);
      r.field('schema').string(constant: threadsSchema);
      r.field('send').boolean();
      r.field('model_select').boolean();
      r.field('policy_version').string(maxLength: 40);
      final limits = r.field('limits')
        ..keys(
          const ['text_max', 'lines_max', 'page_max'],
          const ['text_max', 'lines_max', 'page_max'],
        );
      limits.field('text_max').integer(min: 1, max: 100000);
      limits.field('lines_max').integer(min: 1, max: 10000);
      return ThreadsCapabilities(
        read: r.field('read').boolean(),
        pageMax: limits.field('page_max').integer(min: 1, max: 50),
      );
    });

const _indexKeys = [
  'schema',
  'publisher_epoch',
  'generated_at',
  'index_seq',
  'models',
  'threads',
];

const _rowKeys = [
  'thread_ref',
  'title',
  'role',
  'kind',
  'parent_ref',
  'product',
  'area',
  'state',
  'state_age_seconds',
  'provider_model',
  'history',
  'send',
  'model_select',
  'allowed_models',
  'last_msg_ref',
  'history_digest',
  'message_count',
  'preview',
];

const _states = {
  'running',
  'queued',
  'waiting',
  'idle',
  'failed',
  'completed',
  'stale',
  'cancelled',
};

/// GET /v1/threads. Null when the envelope drifts; bad rows are skipped.
List<ThreadIndexEntry>? parseThreadIndex(Uint8List bytes) =>
    _closed(bytes, threadsIndexMaxBytes, (r) {
      r.keys(_indexKeys, _indexKeys);
      r.field('schema').string(constant: threadsSchema);
      r.field('publisher_epoch').string(pattern: _uuid);
      _timestamp(r.field('generated_at'));
      r.field('index_seq').integer(min: 0);
      _rows(r.field('models'), 16, (m) {
        const keys = ['model_id', 'provider', 'label', 'tier'];
        m.keys(keys, keys);
        m.field('model_id').string(pattern: _modelId);
        m.field('provider').string(maxLength: 40);
        m.field('label').string(maxLength: 40);
        m.field('tier').stringIn(const {'standard', 'premium'});
      });
      return _rows(r.field('threads'), 200, _indexRow);
    });

ThreadIndexEntry _indexRow(JsonReader r) {
  r.keys(_rowKeys, _rowKeys);
  r.field('kind').stringIn(const {'role', 'child'});
  _ref(r.field('parent_ref'), threadRefPattern);
  r.field('product').string(maxLength: 40);
  r.field('area').string(maxLength: 40);
  r.field('state').stringIn(_states);
  r.field('state_age_seconds').integer(min: 0);
  r.field('provider_model').string(maxLength: 80);
  r.field('send').stringIn(const {'off', 'on'});
  r.field('model_select').stringIn(const {'off', 'on'});
  r
      .field('allowed_models')
      .list((m) => m.string(pattern: _modelId), maxItems: 16, unique: true);
  _ref(r.field('last_msg_ref'), _msgRef);
  r.field('message_count').integer(min: 0);
  r.field('preview').nullable((v) => v.string(maxLength: 120));
  final history = r
      .field('history')
      .enumOf(ThreadHistoryTier.values, (t) => t.name);
  return ThreadIndexEntry(
    ref: r.field('thread_ref').string(pattern: threadRefPattern),
    title: r.field('title').string(maxLength: 100),
    role: r.field('role').string(maxLength: 40),
    history: history,
    digest: _ref(r.field('history_digest'), _digest),
  );
}

const _pageKeys = [
  'thread_ref',
  'history_digest',
  'messages',
  'more',
  'next_before',
];

/// GET /v1/threads/{ref}/messages. Null when the envelope drifts, including a
/// page that says `more` without a cursor; bad messages are skipped.
ThreadHistoryPage? parseThreadHistoryPage(Uint8List bytes) =>
    _closed(bytes, threadsPageMaxBytes, (r) {
      r.keys(_pageKeys, _pageKeys);
      final more = r.field('more').boolean();
      final before = _ref(r.field('next_before'), _msgRef);
      if (more != (before != null)) r.fail();
      return ThreadHistoryPage(
        ref: r.field('thread_ref').string(pattern: threadRefPattern),
        digest: r.field('history_digest').string(pattern: _digest),
        messages: _rows(r.field('messages'), 50, _message),
        nextBefore: before,
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

ThreadMessage _message(JsonReader r) {
  r.keys(_messageKeys, _messageKeys);
  final redactions = r.field('redactions')
    ..keys(_redactionKeys, _redactionKeys);
  for (final key in _redactionKeys) {
    redactions.field(key).integer(min: 0, max: 10000);
  }
  return ThreadMessage(
    ref: r.field('msg_ref').string(pattern: _msgRef),
    author: r.field('author').enumOf(ThreadAuthor.values, _authorWire),
    authorLabel: r.field('author_label').string(maxLength: 40),
    createdAt: _timestamp(r.field('created_at')),
    text: r.field('text').string(maxLength: 2000),
    truncated: r.field('truncated').boolean(),
    withheld: r.field('withheld').boolean(),
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

String _authorWire(ThreadAuthor author) => switch (author) {
  ThreadAuthor.ownerMac => 'owner_mac',
  ThreadAuthor.ownerPhone => 'owner_phone',
  ThreadAuthor.agent => 'agent',
  ThreadAuthor.system => 'system',
};
