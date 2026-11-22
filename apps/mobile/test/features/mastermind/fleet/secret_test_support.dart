import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';

/// `scripts/mastermind-fleet/secret-fixture.json`, read from `apps/mobile`.
/// Disposable test values only.
final Map<String, dynamic> secretFixture =
    jsonDecode(
          File(
            '../../scripts/mastermind-fleet/secret-fixture.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

Uint8List hexBytes(String hex) => Uint8List.fromList([
  for (var i = 0; i < hex.length; i += 2)
    int.parse(hex.substring(i, i + 2), radix: 16),
]);

String bytesHex(List<int> bytes) =>
    bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

Uint8List b64(String text) => Uint8List.fromList(fleetSecretFromB64url(text)!);

const secretChannel = MethodChannel('mobile/mastermind_secret');

/// The CryptoKit plugin, in Dart, over the real Ed25519, HKDF and HMAC of
/// `package:cryptography`, so fixture signatures and MACs verify for real.
/// HPKE is replaced by a recorder: `ct` is the plaintext's length plus the
/// tag, and [sealed] keeps copies of disposable test plaintexts.
class FakeSecretPlatform {
  FakeSecretPlatform({
    this.supported = true,
    String ownerSeedHex =
        '2222222222222222222222222222222222222222222222222222222222222222',
  }) : _ownerSeed = hexBytes(ownerSeedHex);

  bool supported;
  final Uint8List _ownerSeed;
  final calls = <String>[];
  final sealed = <Uint8List>[];
  final signedMessages = <Uint8List>[];
  final deletedAccounts = <String?>[];
  bool hasOwnerKey = false;

  /// Runs before each call is answered, to interleave work with it.
  Future<void> Function(String method)? onCall;

  static final _ed = Ed25519();

  void install() => TestDefaultBinaryMessengerBinding
      .instance
      .defaultBinaryMessenger
      .setMockMethodCallHandler(secretChannel, handle);

  void uninstall() => TestDefaultBinaryMessengerBinding
      .instance
      .defaultBinaryMessenger
      .setMockMethodCallHandler(secretChannel, null);

  FleetSecretCrypto crypto() => FleetSecretCrypto(isIOS: () => true);

  Future<Uint8List> ownerPublicKey() async {
    final pair = await _ed.newKeyPairFromSeed(_ownerSeed);
    return Uint8List.fromList((await pair.extractPublicKey()).bytes);
  }

  Future<Object?> handle(MethodCall call) async {
    calls.add(call.method);
    await onCall?.call(call.method);
    final args = (call.arguments as Map<Object?, Object?>?) ?? const {};
    Uint8List bytes(String name) => args[name]! as Uint8List;
    if (!supported && call.method != 'supported') {
      throw PlatformException(code: 'unsupported');
    }
    switch (call.method) {
      case 'supported':
        return supported;
      case 'seal':
        final plaintext = bytes('plaintext');
        sealed.add(Uint8List.fromList(plaintext));
        return {
          'enc': Uint8List(32)..fillRange(0, 32, 0x33),
          'ct': Uint8List(plaintext.length + 16)
            ..fillRange(0, plaintext.length + 16, 0x44),
        };
      case 'ownerPublicKey':
        hasOwnerKey = true;
        return await ownerPublicKey();
      case 'ownerSign':
        final message = bytes('message');
        signedMessages.add(Uint8List.fromList(message));
        final pair = await _ed.newKeyPairFromSeed(_ownerSeed);
        return Uint8List.fromList(
          (await _ed.sign(message, keyPair: pair)).bytes,
        );
      case 'deleteOwnerKeys':
        deletedAccounts.add(args['accountId'] as String?);
        hasOwnerKey = false;
        return null;
      case 'verifyEd25519':
        return await _ed.verify(
          bytes('message'),
          signature: Signature(
            bytes('signature'),
            publicKey: SimplePublicKey(
              bytes('publicKey'),
              type: KeyPairType.ed25519,
            ),
          ),
        );
      case 'pairingKey':
        final key = await Hkdf(hmac: Hmac.sha256(), outputLength: 32).deriveKey(
          secretKey: SecretKey(bytes('code')),
          nonce: utf8.encode(args['pairingId']! as String),
          info: utf8.encode('tuturuuu-mm-secret-pair-v1'),
        );
        return Uint8List.fromList(await key.extractBytes());
      case 'hmac':
        final mac = await Hmac.sha256().calculateMac(
          bytes('message'),
          secretKey: SecretKey(bytes('key')),
        );
        return Uint8List.fromList(mac.bytes);
      case 'macEqual':
        final a = bytes('a');
        final b = bytes('b');
        if (a.length != b.length) return false;
        var diff = 0;
        for (var i = 0; i < a.length; i++) {
          diff |= a[i] ^ b[i];
        }
        return diff == 0;
    }
    throw MissingPluginException();
  }
}

/// Signs as the fixture machine (seed 0x11).
Future<String> machineSign(List<int> message) async {
  final ed = Ed25519();
  final pair = await ed.newKeyPairFromSeed(
    hexBytes(secretFixture['machineSeedHex'] as String),
  );
  return fleetSecretB64url((await ed.sign(message, keyPair: pair)).bytes);
}

/// The fixture request as snapshot JSON, with field overrides.
Map<String, dynamic> requestSecretJson([
  Map<String, Object?> changes = const {},
]) => {
  'mode': 'request',
  ...(secretFixture['request'] as Map<String, dynamic>),
  'sig': secretFixture['requestSig'],
  ...changes,
};

/// A request decision whose payload the fixture machine signed, with
/// [changes] applied before signing.
Future<FleetDecision> signedRequestDecision({
  Map<String, Object?> changes = const {},
  String? id,
  bool resign = true,
}) async {
  var json = requestSecretJson(changes);
  if (resign) {
    final request = FleetSecretRequest.parse(json)!;
    json = {
      ...json,
      'sig': await machineSign(FleetSecretBinding.request(request)),
    };
  }
  return FleetDecision.parse({
    'id': id ?? json['requestId'],
    'kind': 'secret',
    'title': json['purpose'],
    'urgency': 'high',
    'createdAt': '2026-11-22T10:00:00.000Z',
    'secret': json,
  })!;
}

FleetDecision pairDecision([Map<String, Object?> changes = const {}]) {
  final pairing = secretFixture['pairing'] as Map<String, dynamic>;
  final json = {
    'mode': 'pair',
    'v': '1',
    for (final key in const [
      'pairingId',
      'machineId',
      'machineLabel',
      'signerKey',
      'expiresAt',
      'machineMac',
    ])
      key: pairing[key],
    ...changes,
  };
  return FleetDecision.parse({
    'id': json['pairingId'],
    'kind': 'secret',
    'title': 'Pair',
    'urgency': 'high',
    'createdAt': '2026-11-22T10:00:00.000Z',
    'secret': json,
  })!;
}

/// Records every secret answer and replies from [replies], in order.
class RecordingSecretSource implements FleetSecretAnswerSource {
  RecordingSecretSource([List<Object?>? replies]) : replies = replies ?? [];

  final List<Object?> replies;
  final answers = <Map<String, Object?>>[];
  final keys = <String>[];

  @override
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
  }) async {
    answers.add(answer.toJson());
    keys.add(idempotencyKey);
    if (replies.isEmpty) return;
    final reply = replies.removeAt(0);
    if (reply is FleetSecretSendFailure) throw FleetSecretSendException(reply);
  }
}

/// A snapshot with [decisions] open and [resolved] closed.
FleetSnapshot secretSnapshot({
  List<Map<String, dynamic>> decisions = const [],
  List<Map<String, dynamic>> resolved = const [],
  Map<String, dynamic> answers = const {},
}) => FleetSnapshot.parse({
  'receivedAt': '2026-11-22T10:01:00.000Z',
  'answers': answers,
  'state': {
    'version': 1,
    'generatedAt': '2026-11-22T10:01:00.000Z',
    'decisions': decisions,
    'resolved': resolved,
  },
});

Map<String, dynamic> decisionJson(FleetDecision decision) => {
  'id': decision.id,
  'kind': 'secret',
  'title': decision.title,
  'urgency': 'high',
  'createdAt': '2026-11-22T10:00:00.000Z',
  'secret': switch (decision.secret!) {
    final FleetSecretRequest r => {
      'mode': 'request',
      'v': '1',
      'requestId': r.requestId,
      'machineId': r.machineId,
      'requester': r.requester,
      'operation': r.operation,
      'command': r.command,
      'output': r.output,
      'purpose': r.purpose,
      'expiresAt': r.expiresAt,
      'publicKey': r.publicKey,
      'signerKey': r.signerKey,
      'audience': r.audience,
      'sig': r.sig,
    },
    final FleetSecretPairing p => {
      'mode': 'pair',
      'v': '1',
      'pairingId': p.pairingId,
      'machineId': p.machineId,
      'machineLabel': p.machineLabel,
      'signerKey': p.signerKey,
      'expiresAt': p.expiresAt,
      'machineMac': p.machineMac,
    },
  },
};

/// A resolved entry carrying an outcome the fixture machine signed.
Future<Map<String, dynamic>> signedResolved(
  String id,
  String outcome,
  String answerDigest,
) async => {
  'id': id,
  'kind': 'secret',
  'title': 'Settled',
  'outcome': outcome,
  'resolvedAt': '2026-11-22T10:06:00.000Z',
  'secretOutcome': {
    'outcome': outcome,
    'answerDigest': answerDigest,
    'sig': await machineSign(
      FleetSecretBinding.outcome(id, outcome, answerDigest),
    ),
  },
};
