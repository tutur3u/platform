import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Synthetic Iris data only: the committed fixture, plus builders for relay
/// JSON in the fixed shapes (IRIS-API-SHAPES).
const irisFixturePath = 'assets/dev/mastermind/iris_fixture.json';
const irisThreadRef = 'item-0123456789abcdef0123';
const irisSendId = '0123456789abcdef0123456789abcdef';
const fixedId = '01234567-89ab-4cde-8f01-23456789abcd';

Map<String, dynamic> irisFixtureJson() =>
    jsonDecode(File(irisFixturePath).readAsStringSync())
        as Map<String, dynamic>;

/// Serves the committed fixture from disk, as the development bundle would.
final class IrisFixtureBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async {
    final bytes = File(key).readAsBytesSync();
    return ByteData.sublistView(bytes);
  }
}

FixtureIrisRelay irisFixtureRelay({
  IrisFixtureFaults? faults,
  DateTime Function()? clock,
}) => FixtureIrisRelay(
  bundle: IrisFixtureBundle(),
  faults: faults,
  enabled: true,
  clock: clock ?? () => DateTime.utc(2026, 10, 31, 12),
);

String irisMsgRef(int n) => 'm-${n.toRadixString(16).padLeft(16, '0')}';

Map<String, Object?> irisMessageJson(
  int n, {
  String author = 'agent',
  String label = 'Atlas',
  String text = 'Synthetic message',
  bool withheld = false,
}) => {
  'msg_ref': irisMsgRef(n),
  'author': author,
  'author_label': label,
  'created_at':
      '2026-10-31T${(n ~/ 60 % 24).toString().padLeft(2, '0')}:'
      '${(n % 60).toString().padLeft(2, '0')}:00Z',
  'text': withheld ? '' : '$text $n',
  'truncated': false,
  'withheld': withheld,
  'redactions': {
    'path': 0,
    'url': 0,
    'secret': 0,
    'id': 0,
    'email': 0,
    'number': 0,
  },
  'activity': null,
};

/// The daemon's `history_digest`: sha256 hex over the page's `msg_ref`s
/// joined by LF (the empty page hashes the empty string).
String irisHistoryDigest(List<Map<String, Object?>> messages) => sha256
    .convert(utf8.encode(messages.map((m) => m['msg_ref']).join('\n')))
    .toString();

Map<String, Object?> irisPageJson(
  List<Map<String, Object?>> messages, {
  String? nextBefore,
  String? nextAfter,
  bool forward = false,
}) => {
  'thread_ref': irisThreadRef,
  'history_digest': irisHistoryDigest(messages),
  'messages': messages,
  'more': nextBefore != null,
  'next_before': nextBefore,
  if (forward) 'next_after': nextAfter,
};

/// Tests only: the relay's headers and canonical string, but the "signature"
/// is a sha256 of it, not a P-256 signature, so a real relay refuses it. It
/// lives under test/ so no app build can reach it.
final class FakeIrisRequestSigner implements IrisRequestSigner {
  FakeIrisRequestSigner({
    this.deviceId = '00000000-0000-4000-8000-0000000000fe',
    DateTime Function()? clock,
    Random? random,
  }) : _clock = clock ?? DateTime.now,
       _random = random;

  final String deviceId;
  final DateTime Function() _clock;
  final Random? _random;

  @override
  Future<Map<String, String>> sign(
    String method,
    String path,
    List<int> body, {
    String? idempotencyKey,
  }) async {
    final ts = '${_clock().toUtc().millisecondsSinceEpoch ~/ 1000}';
    final nonce = newIrisNonce(_random);
    final canonical = irisCanonicalRequest(
      method: method,
      path: path,
      body: body,
      ts: ts,
      nonce: nonce,
      deviceId: deviceId,
      idempotencyKey: irisIsReadMethod(method) ? null : idempotencyKey,
    );
    return {
      IrisHeaders.device: deviceId,
      IrisHeaders.ts: ts,
      IrisHeaders.nonce: nonce,
      IrisHeaders.sig: sha256.convert(utf8.encode(canonical)).toString(),
    };
  }
}

/// Records every signing call and returns fixed synthetic headers.
final class RecordingSigner implements IrisRequestSigner {
  final calls = <({String method, String path, List<int> body, String? key})>[];

  @override
  Future<Map<String, String>> sign(
    String method,
    String path,
    List<int> body, {
    String? idempotencyKey,
  }) async {
    calls.add((method: method, path: path, body: body, key: idempotencyKey));
    return {
      IrisHeaders.device: 'dev_synthetic',
      IrisHeaders.ts: '1793000000',
      IrisHeaders.nonce: '00112233445566778899aabbccddeeff',
      IrisHeaders.sig: 'sig-${calls.length}',
    };
  }
}

/// The fixture's 12 synthetic asks as open Needs-you rows, for card tests.
/// `soon` maps onto the hub's `high` urgency; `fyi` asks carry no urgency.
List<NeedsYou> irisFixtureAsks() => [
  for (final ask
      in (irisFixtureJson()['asks'] as List).cast<Map<String, dynamic>>())
    NeedsYou(
      id: ask['id'] as String,
      title: ask['title'] as String,
      body: ask['text'] as String,
      options: (ask['options'] as List).cast<String>(),
      recommendedOption: ask['recommended'] as String?,
      state: ItemState.open,
      versionHash: 'v-${ask['id']}',
      kind: ItemKind.values.firstWhere((k) => k.wireName == ask['kind']),
      createdAt: DateTime.parse(ask['created_at'] as String),
      deadline: AskDeadline.fromWire(ask['deadline']),
      urgency: switch (ask['urgency']) {
        'urgent' => AskUrgency.urgent,
        'soon' => AskUrgency.high,
        _ => null,
      },
    ),
];
