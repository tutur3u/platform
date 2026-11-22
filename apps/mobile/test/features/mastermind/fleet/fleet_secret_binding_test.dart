import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';

import 'secret_test_support.dart';

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#wire-format
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final request = FleetSecretRequest.parse(requestSecretJson())!;
  final answer = secretFixture['answer'] as Map<String, dynamic>;
  final pairingJson = secretFixture['pairing'] as Map<String, dynamic>;

  group('fixture bytes', () {
    test('request and answer bindings', () {
      expect(
        bytesHex(FleetSecretBinding.request(request)),
        secretFixture['requestBindingHex'],
      );
      expect(
        bytesHex(FleetSecretBinding.answer(request)),
        secretFixture['answerBindingHex'],
      );
    });

    test('owner and decline transcripts, and the answer digest', () {
      final transcript = FleetSecretBinding.ownerTranscript(
        request,
        action: 'secret',
        enc: answer['enc'] as String,
        ct: answer['ct'] as String,
        signedAt: answer['signedAt'] as String,
        keyId: answer['keyId'] as String,
      );
      expect(bytesHex(transcript), secretFixture['ownerTranscriptHex']);
      expect(
        FleetSecretBinding.sha256Hex(transcript),
        secretFixture['answerDigest'],
      );
      final decline = FleetSecretBinding.ownerTranscript(
        request,
        action: 'decline',
        enc: '',
        ct: '',
        signedAt: answer['signedAt'] as String,
        keyId: answer['keyId'] as String,
      );
      expect(bytesHex(decline), secretFixture['declineTranscriptHex']);
    });

    test('outcome bytes, request code, fingerprint and owner key id', () {
      final outcome = secretFixture['outcome'] as Map<String, dynamic>;
      expect(
        bytesHex(
          FleetSecretBinding.outcome(
            request.requestId,
            outcome['outcome'] as String,
            outcome['answerDigest'] as String,
          ),
        ),
        outcome['bytesHex'],
      );
      expect(
        FleetSecretBinding.requestCode(request),
        secretFixture['requestCode'],
      );
      expect(
        FleetSecretBinding.fingerprint(b64(request.signerKey)),
        secretFixture['machineFingerprint'],
      );
      expect(
        FleetSecretBinding.ownerKeyId(b64(secretFixture['ownerKey'] as String)),
        secretFixture['ownerKeyId'],
      );
    });

    test('the fixture signatures verify over the Dart bindings', () async {
      final platform = FakeSecretPlatform()..install();
      addTearDown(platform.uninstall);
      final crypto = platform.crypto();
      expect(
        await crypto.verifyEd25519(
          publicKey: b64(request.signerKey),
          message: FleetSecretBinding.request(request),
          signature: b64(secretFixture['requestSig'] as String),
        ),
        isTrue,
      );
      expect(
        await crypto.ownerPublicKey('user-1'),
        b64(secretFixture['ownerKey'] as String),
      );
      final signature = await crypto.ownerSign(
        'user-1',
        hexBytes(secretFixture['ownerTranscriptHex'] as String),
      );
      expect(fleetSecretB64url(signature), secretFixture['ownerSig']);
    });

    test('plaintext encoding pads to 256-byte buckets', () {
      final plaintext = secretFixture['plaintext'] as Map<String, dynamic>;
      final value = Uint8List.fromList(
        utf8.encode(plaintext['value'] as String),
      );
      expect(bytesHex(FleetSecretBinding.plaintext(value)), plaintext['hex']);
      expect(FleetSecretBinding.plaintext(Uint8List(253)).length, 256);
      expect(FleetSecretBinding.plaintext(Uint8List(254)).length, 512);
      expect(FleetSecretBinding.plaintext(Uint8List(4096)).length, 17 * 256);
      expect(
        () => FleetSecretBinding.plaintext(Uint8List(0)),
        throwsArgumentError,
      );
      expect(
        () => FleetSecretBinding.plaintext(Uint8List(4097)),
        throwsArgumentError,
      );
    });

    test('pairing key and both MACs', () async {
      final platform = FakeSecretPlatform()..install();
      addTearDown(platform.uninstall);
      final crypto = platform.crypto();
      final pairing = FleetSecretPairing.parse(pairingJson)!;
      final code = parseFleetPairingCode(pairingJson['code'] as String)!;
      expect(bytesHex(code), pairingJson['codeHex']);
      final key = await crypto.pairingKey(
        code: code,
        pairingId: pairing.pairingId,
      );
      expect(bytesHex(key), pairingJson['keyHex']);
      final machineMac = await crypto.hmac(
        key: key,
        message: FleetSecretBinding.pairMachine(pairing),
      );
      expect(fleetSecretB64url(machineMac), pairingJson['machineMac']);
      final ownerMac = await crypto.hmac(
        key: key,
        message: FleetSecretBinding.pairOwner(
          pairing,
          pairingJson['ownerKey'] as String,
        ),
      );
      expect(fleetSecretB64url(ownerMac), pairingJson['ownerMac']);
    });
  });

  group('SSH quoting', () {
    test('the fixture command quotes an empty argument and a quote', () {
      expect(request.parsedCommand.remote, contains(''));
      expect(request.parsedCommand.remote, contains("it's"));
      expect(FleetSecretBinding.quotingOk(request.parsedCommand), isTrue);
    });

    test('quotes each argument and joins with single spaces', () {
      expect(
        FleetSecretBinding.sshLine(['a b', '', "it's"]),
        r"'a b' '' 'it'\''s'",
      );
    });

    test('refuses a last argument that differs from the quoted remote', () {
      for (final last in [
        "'sudo' '-S'",
        'sudo -S -p',
        "'sudo'  '-S' '-p' ''",
        "'sudo' '-S' '-p' \"\"",
      ]) {
        final command = FleetSecretCommand(
          argv: ['/usr/bin/ssh', 'host', '--', last],
          remote: const ['sudo', '-S', '-p', ''],
        );
        expect(FleetSecretBinding.quotingOk(command), isFalse, reason: last);
      }
      expect(
        FleetSecretBinding.quotingOk(
          const FleetSecretCommand(argv: ['/usr/bin/true']),
        ),
        isTrue,
      );
    });
  });

  group('display', () {
    test('control, bidi and zero-width characters render as escapes', () {
      expect(FleetSecretBinding.visible('a\u0000b\u001b'), r'a\x00b\x1B');
      expect(FleetSecretBinding.visible('x\u202Ey'), r'x\u{202E}y');
      expect(FleetSecretBinding.visible('x\u200By\u007f'), r'x\u{200B}y\x7F');
      expect(FleetSecretBinding.visible('Mật khẩu'), 'Mật khẩu');
    });

    test('command arguments render quoted and one-to-one', () {
      String show(String arg) => FleetSecretBinding.argument(arg);
      expect(show(''), '""');
      expect(show("''"), '"\'\'"');
      expect(show(' a '), '" a "');
      expect(show(r'C:\x1B'), r'"C:\\x1B"');
      expect(show('\u001b'), r'"\u{001B}"');
      expect(show('say "hi"'), r'"say \"hi\""');
      expect(show('a\u00a0b'), r'"a\u{00A0}b"');
      expect(show('\u0430dmin'), r'"\u{0430}dmin"');
      expect(show('\u{1F511}'), r'"\u{1F511}"');
      final args = [
        '',
        "''",
        '""',
        r'\',
        r'\\',
        r'\x1B',
        '\u001b',
        r'\u{001B}',
        '\u202e',
        r'\u{202E}',
        ' ',
        '\u00a0',
        'a',
        '\u0430',
        '"',
        r'\"',
      ];
      expect(args.map(show).toSet(), hasLength(args.length));
    });
  });

  group('pairing code', () {
    test('parses like parsePairingCode, look-alikes and all', () {
      final expected = pairingJson['codeHex'];
      for (final text in [
        '008J-4CT4-ANK7-F24S',
        '008j4ct4ank7f24s',
        ' 008J 4CT4 ANK7 F24S ',
        'OO8J-4CT4-ANK7-F24S',
      ]) {
        expect(bytesHex(parseFleetPairingCode(text)!), expected, reason: text);
      }
      expect(parseFleetPairingCode('008J-4CT4-ANK7-F24'), isNull);
      expect(parseFleetPairingCode('008J-4CT4-ANK7-F24SX'), isNull);
      expect(parseFleetPairingCode('008U-4CT4-ANK7-F24S'), isNull);
    });
  });
}
