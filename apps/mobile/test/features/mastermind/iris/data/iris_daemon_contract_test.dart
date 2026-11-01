import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/iris/cubit/iris_feed_cubit.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/view/iris_message_tile.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

import '../../../../helpers/mastermind_hub_harness.dart';
import '../../../../helpers/mastermind_iris_fixture.dart';
import '../../../../helpers/pump_app.dart';

/// The exact bytes Forge's iris-relayd emits (synthetic content), parsed by
/// the app's relay client. A change on either side breaks these first.
const _ref = 'm-4a45d989c47be267';
const _newer = 'm-4a45d989c47be268';
const _emptyDigest =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
String _digest(List<String> refs) =>
    sha256.convert(utf8.encode(refs.join('\n'))).toString();

String _row(String ref, {bool withheld = true}) =>
    '{"msg_ref":"$ref","author":"user","author_label":"Owner",'
    '"created_at":"2027-01-15T08:00:01Z",'
    '"text":"${withheld ? '' : 'Synthetic reply'}","truncated":false,'
    '"withheld":$withheld,"redactions":{"path":0,"url":0,"secret":0,'
    '"id":0,"email":0,"number":0},"activity":null}';

final _latestPage =
    '{"thread_ref":"item-119bd60f4cc24a03ad3b",'
    '"history_digest":"${_digest([_ref])}",'
    '"messages":[${_row(_ref)}],"more":false,"next_before":null}';

const _forwardEmpty =
    '{"thread_ref":"item-119bd60f4cc24a03ad3b",'
    '"history_digest":"$_emptyDigest",'
    '"messages":[],"more":false,"next_before":null,"next_after":"$_ref"}';

final _forwardNewer =
    '{"thread_ref":"item-119bd60f4cc24a03ad3b",'
    '"history_digest":"${_digest([_newer])}",'
    '"messages":[${_row(_newer, withheld: false)}],"more":false,'
    '"next_before":null,"next_after":"$_newer"}';

void main() {
  late List<http.Request> requests;

  HttpIrisRelay relay(http.Response Function(http.Request) respond) =>
      HttpIrisRelay(
        baseUrl: hubBase,
        tokens: FakeTokens(),
        signer: RecordingSigner(),
        client: MockClient((request) async {
          requests.add(request);
          return respond(request);
        }),
      );

  http.Response bytes(String body, [int status = 200]) => http.Response(
    body,
    status,
    headers: {'content-type': 'application/json'},
  );

  setUp(() => requests = []);

  group('feed', () {
    test('the latest page parses, a withheld row kept in place', () async {
      final page = (await relay((_) => bytes(_latestPage)).feed()).valueOrNull!;
      final row = page.messages.single;
      expect(row.ref, _ref);
      expect(row.author, ThreadAuthor.ownerPhone);
      expect(row.authorLabel, 'Owner');
      expect(row.withheld, isTrue);
      expect(row.text, isEmpty);
      expect(row.createdAt, DateTime.utc(2027, 1, 15, 8, 0, 1));
      expect(page.nextBefore, isNull);
      expect(page.nextAfter, isNull);
    });

    test('an empty forward poll keeps the same cursor', () async {
      expect(_emptyDigest, _digest(const []));
      final page = (await relay(
        (_) => bytes(_forwardEmpty),
      ).feed(after: _ref)).valueOrNull!;
      expect(page.messages, isEmpty);
      expect(page.nextAfter, _ref);
      expect(requests.single.url.queryParameters['after'], _ref);
    });

    test('a forward poll with newer rows moves to the newest', () async {
      final page = (await relay(
        (_) => bytes(_forwardNewer),
      ).feed(after: _ref)).valueOrNull!;
      expect(page.messages.single.text, 'Synthetic reply');
      expect(page.nextAfter, _newer);
    });

    test('before and after together never reach the relay', () {
      expect(
        () => relay((_) => bytes('{}', 400)).feed(before: _ref, after: _ref),
        throwsArgumentError,
      );
      expect(requests, isEmpty);
    });

    test('an unknown cursor is notFound', () async {
      final result = await relay(
        (_) => bytes('{"error":"not_found"}', 404),
      ).feed(after: _ref);
      expect(result.failureOrNull!.kind, IrisFailureKind.notFound);
    });

    test('the cubit resets a forward cursor the relay lost', () async {
      var calls = 0;
      final cubit = IrisFeedCubit(
        relay: relay((request) {
          if (request.url.path != '/v1/iris/feed') return bytes('{}', 404);
          calls++;
          if (calls == 2) return bytes('{"error":"not_found"}', 404);
          return bytes(_latestPage);
        }),
      );
      await cubit.poll();
      await cubit.poll();
      final feeds = [
        for (final r in requests)
          if (r.url.path == '/v1/iris/feed') r.url.queryParameters,
      ];
      expect(feeds, hasLength(3));
      expect(feeds[1]['after'], _ref);
      expect(feeds[2].containsKey('after'), isFalse);
      expect(cubit.state.messages.single.ref, _ref);
      expect(cubit.state.failure, isNull);
      await cubit.close();
    });

    test('the cubit drops a history cursor the relay lost', () async {
      final older =
          '{"thread_ref":"item-119bd60f4cc24a03ad3b",'
          '"history_digest":"${_digest([_newer])}",'
          '"messages":[${_row(_newer, withheld: false)}],"more":true,'
          '"next_before":"$_ref"}';
      final cubit = IrisFeedCubit(
        relay: relay(
          (request) => request.url.queryParameters.containsKey('before')
              ? bytes('{"error":"not_found"}', 404)
              : bytes(older),
        ),
      );
      await cubit.poll();
      expect(cubit.state.nextBefore, _ref);
      await cubit.loadOlder();
      expect(cubit.state.nextBefore, isNull);
      expect(cubit.state.failure, isNull);
      expect(cubit.state.messages, hasLength(1));
      await cubit.close();
    });
  });

  group('send', () {
    test('POST answers 202 received', () async {
      final receipt = (await relay(
        (_) => bytes('{"id":"$irisSendId","state":"received"}', 202),
      ).send('Synthetic', idempotencyKey: fixedId)).valueOrNull!;
      expect(receipt.id, irisSendId);
      expect(receipt.state, IrisReceiptState.received);
      expect(receipt.delivery, isNull);
      expect(jsonDecode(requests.single.body), {
        'target': 'atlas',
        'text': 'Synthetic',
      });
    });

    test('each receipt state parses; delivery only when carried', () async {
      const cases = {
        '"received","delivery":null': (IrisReceiptState.received, null),
        '"failed","delivery":null': (IrisReceiptState.failed, null),
        '"delivered","delivery":"queue"': (
          IrisReceiptState.delivered,
          IrisDelivery.queue,
        ),
        '"acked","delivery":"unknown"': (
          IrisReceiptState.acked,
          IrisDelivery.unknown,
        ),
      };
      for (final MapEntry(:key, :value) in cases.entries) {
        final receipt = (await relay(
          (_) => bytes('{"id":"$irisSendId","state":$key}'),
        ).receipt(irisSendId)).valueOrNull!;
        expect(receipt.state, value.$1, reason: key);
        expect(receipt.delivery, value.$2, reason: key);
      }
      final drift = await relay(
        (_) =>
            bytes('{"id":"$irisSendId","state":"received","delivery":"start"}'),
      ).receipt(irisSendId);
      expect(drift.failureOrNull!.kind, IrisFailureKind.malformed);
    });
  });

  group('enrol', () {
    // A real P-256 SPKI (the published v3 vector key) and its fingerprint.
    const spki =
        'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEbH9vDKIn6yy6vTEjjPntHMvjv0RuCzTe'
        'BYmqbvO0hYlI3twDIjo6NglAtzWszMm340VcS_BH_bwafn_LK3ymYQ';
    final fingerprint = sha256
        .convert(base64Url.decode(base64Url.normalize(spki)))
        .toString();
    const device = '0f1e2d3c-4b5a-8978-8695-a4b3c2d1e0f0';

    String accepted({bool command = false}) =>
        '{"state":"pending","pending_id":"$device",'
        '"fingerprint_prefix":"${fingerprint.substring(0, 8)}",'
        '"device_name":"Phone","code":"042917"'
        '${command ? ',"command":"iris enroll 042917"' : ''}}';

    Future<IrisResult<IrisEnrollment>> enrol(http.Response reply) => relay(
      (_) => reply,
    ).enroll(spki, fingerprint, deviceId: device, code: '042917');

    test('the request is the relay contract, byte for byte', () async {
      await enrol(bytes(accepted(), 202));
      final request = requests.single;
      expect(request.method, 'POST');
      expect(request.url.path, '/v1/iris/enrol');
      expect(request.url.hasQuery, isFalse);
      expect(
        request.body,
        '{"public_key":"$spki","fingerprint":"$fingerprint",'
        '"code":"042917"}',
      );
      expect(request.headers['Authorization'], startsWith('Bearer '));
      expect(request.headers['Content-Type'], startsWith('application/json'));
      expect(request.headers['X-Device-Id'], device);
      expect(
        request.headers['Idempotency-Key'],
        matches(RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-')),
      );
      for (final name in ['X-Iris-Ts', 'X-Iris-Nonce', 'X-Iris-Sig']) {
        expect(request.headers.containsKey(name), isFalse, reason: name);
      }
    });

    test('the 202 parses with and without the retired command', () async {
      for (final body in [accepted(), accepted(command: true)]) {
        final enrolment = (await enrol(bytes(body, 202))).valueOrNull!;
        expect(enrolment.deviceId, device);
        expect(enrolment.code, '042917');
        expect(enrolment.fingerprintPrefix, fingerprint.substring(0, 8));
      }
    });

    test('a drifted 202 is refused', () async {
      for (final body in [
        accepted().replaceFirst('"code":"042917"', '"code":"111111"'),
        accepted().replaceFirst('"state":"pending"', '"state":"confirmed"'),
        accepted().replaceFirst('}', ',"confirm_on_mac":true}'),
        accepted().replaceFirst(fingerprint.substring(0, 8), 'deadbeef'),
      ]) {
        expect(
          (await enrol(bytes(body, 202))).failureOrNull!.kind,
          IrisFailureKind.malformed,
          reason: body,
        );
      }
    });

    test('relay errors map to what the panel says', () async {
      Future<IrisFailureKind> kind(int status, String error) async =>
          (await enrol(
            bytes('{"error":"$error"}', status),
          )).failureOrNull!.kind;
      expect(await kind(409, 'code_conflict'), IrisFailureKind.codeConflict);
      expect(
        await kind(409, 'device_conflict'),
        IrisFailureKind.deviceConflict,
      );
      expect(await kind(409, 'pending_limit'), IrisFailureKind.rateLimited);
      expect(await kind(429, 'rate_limited'), IrisFailureKind.rateLimited);
      expect(
        await kind(401, 'assertion_required'),
        IrisFailureKind.relayStopped,
      );
      expect(await kind(400, 'bad_request'), IrisFailureKind.badRequest);
    });
  });

  group('devices', () {
    const row =
        '{"id":"0f1e2d3c-4b5a-8978-8695-a4b3c2d1e0f0","device_name":"Phone",'
        '"fingerprint_prefix":"1a2b3c4d","created_at":"2027-01-15T08:00:01Z",'
        '"revoked":false,"current":true}';

    test('the list parses strictly', () async {
      final devices = (await relay(
        (_) => bytes('{"devices":[$row]}'),
      ).devices()).valueOrNull!;
      final d = devices.single;
      expect(d.label, 'Phone');
      expect(d.status, IrisDeviceStatus.confirmed);
      expect(d.current, isTrue);
      expect(d.createdAt, DateTime.utc(2027, 1, 15, 8, 0, 1));
      expect(requests.single.url.hasQuery, isFalse);
    });

    test('a revoked row reads as revoked; a drifted row is skipped', () async {
      final revoked = row
          .replaceFirst('"revoked":false', '"revoked":true')
          .replaceFirst('"current":true', '"current":false');
      final extra = row.replaceFirst('}', ',"label":"x"}');
      final devices = (await relay(
        (_) => bytes('{"devices":[$revoked,$extra]}'),
      ).devices()).valueOrNull!;
      expect(devices.single.status, IrisDeviceStatus.revoked);
    });

    test('a Worker without the route is notFound', () async {
      final result = await relay(
        (_) => bytes('{"error":"not_found"}', 404),
      ).devices();
      expect(result.failureOrNull!.kind, IrisFailureKind.notFound);
    });
  });

  test('capabilities parse with and without iris', () {
    MastermindCapabilities? parse(String body) =>
        MastermindCapabilities.parse(Uint8List.fromList(utf8.encode(body)));
    final on = parse(
      '{"schema_versions":["1.4"],"replies":true,"push":false,"iris":true}',
    )!;
    expect(on.iris, isTrue);
    expect(on.replies, isTrue);
    final off = parse(
      '{"schema_versions":["1.4"],"replies":false,"push":false,"iris":false}',
    )!;
    expect(off.iris, isFalse);
    expect(off.replies, isFalse);
    expect(
      parse('{"schema_versions":["1.4"],"replies":true,"push":false}')!.iris,
      isFalse,
    );
  });

  test('the committed fixture digest follows the daemon rule', () {
    final json = irisFixtureJson();
    final refs = [
      for (final m in (json['messages'] as List).cast<Map<String, dynamic>>())
        m['msg_ref'] as String,
    ];
    expect(json['history_digest'], _digest(refs));
    expect(File(irisFixturePath).existsSync(), isTrue);
  });

  testWidgets('a withheld daemon row reads as hidden', (tester) async {
    final page = (await relay((_) => bytes(_latestPage)).feed()).valueOrNull!;
    await tester.pumpApp(
      Material(child: IrisMessageTile(message: page.messages.single)),
    );
    expect(find.text('Hidden message'), findsOneWidget);
  });
}
