import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

import '../../../../helpers/mastermind_iris_device.dart';
import '../../../../helpers/mastermind_iris_fixture.dart';

void main() {
  test('the fixture holds 12 synthetic asks and 40 messages', () {
    final json = irisFixtureJson();
    final asks = (json['asks'] as List).cast<Map<String, dynamic>>();
    expect(asks, hasLength(12));
    expect(asks.map((a) => a['urgency']).toSet(), {'urgent', 'soon', 'fyi'});
    expect(asks.where((a) => a['expires_at'] != null), hasLength(1));
    expect(asks.where((a) => (a['options'] as List).isEmpty), isNotEmpty);
    expect(asks.where((a) => (a['options'] as List).isNotEmpty), isNotEmpty);
    expect(json['messages'], hasLength(40));
  });

  test('the fixture contains only synthetic safe values', () {
    final text = File(irisFixturePath).readAsStringSync();
    for (final pattern in [
      r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',
      '[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}',
      'https?://',
      'gh[a-z]*_',
      r'eyJ[A-Za-z0-9_-]+\.',
      r'\b(?:\d{1,3}\.){3}\d{1,3}\b',
      r'(?:/Users/|/home/|~[/\\])',
    ]) {
      expect(RegExp(pattern).hasMatch(text), isFalse, reason: pattern);
    }
  });

  test('serves the feed newest last, pages back and polls forward', () async {
    final relay = irisFixtureRelay();
    final latest = (await relay.feed(limit: 10)).valueOrNull!;
    expect(latest.messages, hasLength(10));
    final all = (await relay.feed(limit: 200)).valueOrNull!.messages;
    expect(all, hasLength(40));
    expect(latest.messages.last.ref, all.last.ref);
    expect(latest.nextBefore, latest.messages.first.ref);
    final older = (await relay.feed(
      before: latest.nextBefore,
      limit: 10,
    )).valueOrNull!;
    expect(older.messages.last.ref, all[29].ref);
    final withheld = all.where((m) => m.withheld);
    expect(withheld.single.text, isEmpty);
    expect(all.map((m) => m.author).toSet(), {
      ThreadAuthor.agent,
      ThreadAuthor.ownerPhone,
    });

    final quiet = (await relay.feed(after: all.last.ref)).valueOrNull!;
    expect(quiet.messages, isEmpty);
    expect(quiet.nextAfter, all.last.ref);
  });

  test('an unknown cursor is 404 and before+after is 400', () async {
    final relay = irisFixtureRelay();
    expect(
      (await relay.feed(after: irisMsgRef(1))).failureOrNull!.kind,
      IrisFailureKind.notFound,
    );
    final ref = (await relay.feed()).valueOrNull!.messages.last.ref;
    expect(
      (await relay.feed(before: ref, after: ref)).failureOrNull!.kind,
      IrisFailureKind.badRequest,
    );
  });

  test('a send joins the feed and walks received, delivered, acked', () async {
    final relay = irisFixtureRelay();
    final sent = (await relay.send(
      'Hello',
      idempotencyKey: fixedId,
    )).valueOrNull!;
    expect(sent.id, matches(RegExp(r'^[0-9a-f]{32}$')));
    expect(sent.state, IrisReceiptState.received);
    // The same key is the same message.
    final again = (await relay.send(
      'Hello',
      idempotencyKey: fixedId,
    )).valueOrNull!;
    expect(again.id, sent.id);
    final feed = (await relay.feed(limit: 200)).valueOrNull!.messages;
    expect(feed, hasLength(41));
    expect(feed.last.text, 'Hello');

    final delivered = (await relay.receipt(sent.id)).valueOrNull!;
    expect(delivered.state, IrisReceiptState.delivered);
    expect(delivered.delivery, IrisDelivery.steer);
    final acked = (await relay.receipt(sent.id)).valueOrNull!;
    expect(acked.state, IrisReceiptState.acked);
  });

  test('slow ack lingers as delivered via queue', () async {
    final faults = IrisFixtureFaults()..slowAck = true;
    final relay = irisFixtureRelay(faults: faults);
    final sent = (await relay.send(
      'Later',
      idempotencyKey: fixedId,
    )).valueOrNull!;
    for (var i = 0; i < 4; i++) {
      final receipt = (await relay.receipt(sent.id)).valueOrNull!;
      expect(receipt.state, IrisReceiptState.delivered);
      expect(receipt.delivery, IrisDelivery.queue);
    }
    expect(
      (await relay.receipt(sent.id)).valueOrNull!.state,
      IrisReceiptState.acked,
    );
  });

  test('fault toggles: offline, 429 and kill', () async {
    final faults = IrisFixtureFaults();
    final relay = irisFixtureRelay(faults: faults);
    faults.offline = true;
    expect((await relay.feed()).failureOrNull!.kind, IrisFailureKind.offline);
    faults
      ..offline = false
      ..rateLimited = true;
    final limited = (await relay.summary()).failureOrNull!;
    expect(limited.kind, IrisFailureKind.rateLimited);
    expect(limited.retryAfter, const Duration(seconds: 30));
    faults
      ..rateLimited = false
      ..killed = true;
    expect(
      (await relay.send('x', idempotencyKey: fixedId)).failureOrNull!.kind,
      IrisFailureKind.killed,
    );
    faults.killed = false;
    expect((await relay.summary()).valueOrNull, isNotNull);
  });

  test(
    'summary counts open asks by urgency, skipping the expired one',
    () async {
      final summary = (await irisFixtureRelay().summary()).valueOrNull!;
      expect(summary.urgent, 4);
      expect(summary.soon, 3);
      expect(summary.fyi, 4);
      expect(
        summary.roles.map((r) => r.status),
        contains(IrisRoleStatus.stalled),
      );
      expect(summary.usage, isNotEmpty);
    },
  );

  group('enrolment follows the relay contract', () {
    // A base64url SPKI per device, and the sha256 of its DER bytes.
    ({String key, String fingerprint, String id}) device(int n) {
      final spki = [...irisSyntheticSpki]..[irisSyntheticSpki.length - 1] = n;
      final fingerprint = sha256.convert(spki).toString();
      return (
        key: irisBase64Url(spki),
        fingerprint: fingerprint,
        id: irisDeviceIdFor(fingerprint),
      );
    }

    Future<IrisResult<IrisEnrollment>> enrol(
      FixtureIrisRelay relay,
      int n, {
      String code = '123456',
    }) {
      final d = device(n);
      return relay.enroll(d.key, d.fingerprint, deviceId: d.id, code: code);
    }

    test('pending under the device id until confirmed', () async {
      final relay = irisFixtureRelay();
      final d = device(1);
      final enrolment = (await enrol(relay, 1)).valueOrNull!;
      expect(enrolment.deviceId, d.id);
      expect(enrolment.code, '123456');
      expect(enrolment.fingerprintPrefix, d.fingerprint.substring(0, 8));
      expect(
        (await relay.device(d.id)).valueOrNull!.status,
        IrisDeviceStatus.pending,
      );
      relay.confirmDevice(d.id);
      expect(
        (await relay.device(d.id)).valueOrNull!.status,
        IrisDeviceStatus.confirmed,
      );
      // A known device needs a new key.
      expect(
        (await enrol(relay, 1, code: '999999')).failureOrNull!.kind,
        IrisFailureKind.deviceConflict,
      );
      await relay.revoke(d.id);
      expect(
        (await relay.devices()).valueOrNull!.first.status,
        IrisDeviceStatus.revoked,
      );
    });

    test('a fingerprint of anything but the SPKI bytes is refused', () async {
      final relay = irisFixtureRelay();
      final d = device(1);
      final wrong = sha256.convert(utf8.encode(d.key)).toString();
      expect(
        (await relay.enroll(
          d.key,
          wrong,
          deviceId: d.id,
          code: '123456',
        )).failureOrNull!.kind,
        IrisFailureKind.badRequest,
      );
      expect(
        (await relay.enroll(
          d.key,
          d.fingerprint,
          deviceId: d.id.toUpperCase(),
          code: '123456',
        )).failureOrNull!.kind,
        IrisFailureKind.badRequest,
      );
    });

    test('a held code conflicts; at most 3 pending', () async {
      final relay = irisFixtureRelay();
      await enrol(relay, 1, code: '111111');
      expect(
        (await enrol(relay, 2, code: '111111')).failureOrNull!.kind,
        IrisFailureKind.codeConflict,
      );
      await enrol(relay, 2, code: '222222');
      await enrol(relay, 3, code: '333333');
      expect(
        (await enrol(relay, 4, code: '444444')).failureOrNull!.kind,
        IrisFailureKind.rateLimited,
      );
      // The same device may re-enrol its own pending key.
      expect((await enrol(relay, 1, code: '555555')).valueOrNull, isNotNull);
    });
  });

  test('a build without the fixture define is not configured', () async {
    final relay = FixtureIrisRelay(enabled: false);
    expect(
      (await relay.feed()).failureOrNull!.kind,
      IrisFailureKind.notConfigured,
    );
  });
}
