import 'dart:async';
import 'dart:math';

import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_state.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

import 'mastermind_home_fixture.dart';

String inboxItemId(int n) => 'item-${n.toRadixString(16).padLeft(20, '0')}';

String inboxHash(String digit) => List.filled(64, digit).join();

/// One synthetic open Needs-you row.
Map<String, dynamic> inboxItem(
  int n, {
  String kind = 'decision',
  String title = 'Choose a plan',
  String body = 'A short question for the owner.',
  List<String> options = const ['Approve', 'Defer'],
  String? recommended = 'Approve',
  String? product = 'Tuturuuu',
  String hash = 'a',
}) => {
  'id': inboxItemId(n),
  'title': title,
  'body': body,
  'options': options,
  'recommended_option': recommended,
  'state': 'open',
  'version_hash': inboxHash(hash),
  'kind': kind,
  'product': ?product,
};

const _securityRow = <String, dynamic>{
  'title': 'Security issue',
  'state': 'open',
  'product': 'Mastermind',
};

/// A synthetic export whose `needs_you` is exactly [items] (plus one security
/// row when [security]).
Map<String, dynamic> inboxJson(
  List<Map<String, dynamic>> items, {
  bool security = true,
}) {
  final root = homeJson(needsYou: false, security: false);
  (root['now'] as Map<String, dynamic>)['needs_you'] = [
    ...items,
    if (security) _securityRow,
  ];
  return root;
}

MastermindSnapshotReady readySnapshot(
  Map<String, dynamic> json, {
  SnapshotOrigin origin = SnapshotOrigin.live,
}) => MastermindSnapshotReady(
  snapshot: parsedSnapshot(json),
  digest: 'a' * 64,
  origin: origin,
  receivedAt: DateTime.utc(2026, 1, 31, 17, 32),
);

/// Answers from a script (the last outcome repeats) and records every send,
/// optionally into a shared [log] so tests can assert ordering.
final class FakeReplyTransport implements MastermindReplyTransport {
  FakeReplyTransport([List<ReplyOutcome>? script, this.log])
    : _script = script ?? const [ReplyAccepted()];

  final List<ReplyOutcome> _script;
  final List<String>? log;
  final sent = <OutboxEntry>[];

  /// When set, a send waits for it before answering.
  Completer<void>? gate;
  int _next = 0;

  @override
  Future<ReplyOutcome> send(OutboxEntry entry) async {
    sent.add(entry);
    log?.add('send');
    if (gate case final gate?) await gate.future;
    final outcome = _script[min(_next, _script.length - 1)];
    _next++;
    return outcome;
  }
}

/// A memory outbox that logs its writes and can be made to fail.
final class SpyOutboxStore implements MastermindOutboxStore {
  SpyOutboxStore([this.log]);

  final List<String>? log;
  final inner = MemoryOutboxStore();
  bool failWrites = false;

  /// When set, a write waits for it before it is stored.
  Completer<void>? writeGate;

  @override
  Future<List<OutboxEntry>> read() => inner.read();

  @override
  Future<void> write(List<OutboxEntry> entries) async {
    log?.add('write:${entries.length}');
    if (failWrites) throw StateError('disk full');
    if (writeGate case final gate?) await gate.future;
    await inner.write(entries);
  }

  @override
  Future<void> clear() async {
    log?.add('clear');
    await inner.clear();
  }
}

Future<CapabilitiesFetch> Function() capabilities({
  bool replies = true,
  List<String> versions = const ['1.4'],
}) =>
    () async => CapabilitiesFetchOk(
      MastermindCapabilities(
        schemaVersions: versions,
        replies: replies,
        push: false,
      ),
    );

/// A replies cubit over fakes. [clock] defaults to a fixed instant.
MastermindRepliesCubit repliesCubit({
  FakeReplyTransport? transport,
  MastermindOutboxStore? store,
  Future<CapabilitiesFetch> Function()? fetchCapabilities,
  Future<void> Function()? refreshSnapshot,
  AccessLostCallback? onAccessLost,
  bool Function(String itemId)? isAnsweredElsewhere,
  DateTime Function()? clock,
  Duration optionUndoWindow = MastermindRepliesCubit.defaultOptionUndoWindow,
}) => MastermindRepliesCubit(
  store: store ?? MemoryOutboxStore(),
  transport: transport ?? FakeReplyTransport(),
  fetchCapabilities: fetchCapabilities ?? capabilities(),
  refreshSnapshot: refreshSnapshot,
  onAccessLost: onAccessLost,
  isAnsweredElsewhere: isAnsweredElsewhere,
  clock: clock ?? () => DateTime.utc(2026, 1, 31, 17, 32),
  random: Random(7),
  optionUndoWindow: optionUndoWindow,
);

NeedsYou parsedItem(Map<String, dynamic> item) {
  final snapshot = parsedSnapshot(inboxJson([item]));
  return snapshot.now.needsYou.whereType<NeedsYou>().single;
}
