import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';

/// Mastermind secret entry, protocol v1: the exact bytes the phone binds,
/// signs and seals. Matches `scripts/mastermind-fleet/secret-protocol.mjs`
/// and `secret-pairing.mjs` byte for byte; `secret-fixture.json` freezes
/// both. SHA-256 comes from `package:crypto`; HPKE, Ed25519, HKDF and HMAC
/// run in CryptoKit behind `FleetSecretCrypto`.
abstract final class FleetSecretBinding {
  static const requestDomain = 'tuturuuu-mm-secret-request-v1';
  static const answerDomain = 'tuturuuu-mm-secret-answer-v1';
  static const ownerDomain = 'tuturuuu-mm-secret-owner-v1';
  static const outcomeDomain = 'tuturuuu-mm-secret-outcome-v1';
  static const pairMachineDomain = 'tuturuuu-mm-secret-pair-machine-v1';
  static const pairOwnerDomain = 'tuturuuu-mm-secret-pair-owner-v1';

  /// Largest value the phone sends, in UTF-8 bytes.
  static const maxValueBytes = 4096;
  static const padBlock = 256;

  /// `B(domain, fields)`: each string as a 4-byte big-endian byte length and
  /// its UTF-8 bytes, the domain first.
  static Uint8List lengthPrefixed(String domain, List<String> values) {
    final out = BytesBuilder(copy: false);
    for (final value in [domain, ...values]) {
      final bytes = utf8.encode(value);
      out
        ..add((ByteData(4)..setUint32(0, bytes.length)).buffer.asUint8List())
        ..add(bytes);
    }
    return out.takeBytes();
  }

  /// What the machine signed.
  static Uint8List request(FleetSecretRequest request) =>
      lengthPrefixed(requestDomain, request.bindingFields);

  /// The HPKE AAD.
  static Uint8List answer(FleetSecretRequest request) =>
      lengthPrefixed(answerDomain, request.bindingFields);

  static String sha256Hex(List<int> bytes) => sha256.convert(bytes).toString();

  /// What the owner signs: the request by its binding digest, the action,
  /// the sealed payload (empty strings for a decline), when and which key.
  static Uint8List ownerTranscript(
    FleetSecretRequest request, {
    required String action,
    required String enc,
    required String ct,
    required String signedAt,
    required String keyId,
  }) => lengthPrefixed(ownerDomain, [
    request.requestId,
    sha256Hex(FleetSecretBinding.request(request)),
    action,
    enc,
    ct,
    signedAt,
    keyId,
  ]);

  /// What the machine signs to settle a request or pairing.
  static Uint8List outcome(
    String requestId,
    String outcome,
    String answerDigest,
  ) => lengthPrefixed(outcomeDomain, [requestId, outcome, answerDigest]);

  /// First 16 bytes of SHA-256 of the owner key, lowercase hex.
  static String ownerKeyId(List<int> ownerKey) =>
      sha256Hex(ownerKey).substring(0, 32);

  /// SHA-256 of the machine key, first 16 bytes as four groups of 8 hex.
  static String fingerprint(List<int> signerKey) {
    final hex = sha256Hex(signerKey).substring(0, 32).toUpperCase();
    return [for (var i = 0; i < 32; i += 8) hex.substring(i, i + 8)].join(' ');
  }

  /// SHA-256 of the request binding, first 4 bytes as `XXXX-XXXX`.
  static String requestCode(FleetSecretRequest request) {
    final hex = sha256Hex(FleetSecretBinding.request(request)).toUpperCase();
    return '${hex.substring(0, 4)}-${hex.substring(4, 8)}';
  }

  static Uint8List pairMachine(FleetSecretPairing pairing) =>
      lengthPrefixed(pairMachineDomain, [
        pairing.pairingId,
        pairing.machineId,
        pairing.machineLabel,
        pairing.signerKey,
        pairing.expiresAt,
      ]);

  static Uint8List pairOwner(FleetSecretPairing pairing, String ownerKey) =>
      lengthPrefixed(pairOwnerDomain, [
        pairing.pairingId,
        pairing.machineId,
        pairing.signerKey,
        ownerKey,
        pairing.expiresAt,
      ]);

  /// Byte `0x01`, a 2-byte big-endian length, the value, then zeros to the
  /// next multiple of [padBlock]. Throws [ArgumentError] outside 1 to
  /// [maxValueBytes] bytes. The caller zeroes [value] and the result.
  static Uint8List plaintext(Uint8List value) {
    if (value.isEmpty || value.length > maxValueBytes) {
      throw ArgumentError('secret_value_length');
    }
    final used = 3 + value.length;
    final out = Uint8List(((used + padBlock - 1) ~/ padBlock) * padBlock);
    out[0] = 0x01;
    out[1] = value.length >> 8;
    out[2] = value.length & 0xff;
    out.setRange(3, used, value);
    return out;
  }

  /// One argument in POSIX single quotes; a quote inside becomes `'\''`.
  static String shellQuote(String arg) => "'${arg.replaceAll("'", r"'\''")}'";

  /// The one line SSH receives: every remote argument quoted, joined by
  /// single spaces.
  static String sshLine(List<String> remote) =>
      remote.map(shellQuote).join(' ');

  /// A local command passes; an SSH command passes only when its last local
  /// argument is exactly [sshLine] of `remote`, so the remote shell parses
  /// the arguments the phone shows.
  static bool quotingOk(FleetSecretCommand command) {
    final remote = command.remote;
    if (remote == null) return true;
    return command.argv.length >= 2 && command.argv.last == sshLine(remote);
  }

  static final _invisible = RegExp(
    r'[\x00-\x1f\x7f-\x9f\xad\u061c\u180e\u200b-\u200f\u2028-\u202e'
    r'\u2060-\u2069\ufeff]',
  );

  /// [text] with control, bidirectional and zero-width characters shown as
  /// visible escapes (`\x1B`, `\u{202E}`), so what renders is what runs.
  static String visible(String text) => text.replaceAllMapped(_invisible, (m) {
    final code = m[0]!.codeUnitAt(0);
    return code < 0x80
        ? '\\x${code.toRadixString(16).padLeft(2, '0').toUpperCase()}'
        : '\\u{${code.toRadixString(16).padLeft(4, '0').toUpperCase()}}';
  });

  /// One command argument as the owner approves it: in double quotes, with
  /// `\\` and `\"` escaped and every character outside printable ASCII
  /// (spaces other than U+0020, controls, format characters, look-alike
  /// letters) as `\u{…}`. Distinct arguments never render the same.
  static String argument(String arg) {
    final out = StringBuffer('"');
    for (final rune in arg.runes) {
      if (rune == 0x5C) {
        out.write(r'\\');
      } else if (rune == 0x22) {
        out.write(r'\"');
      } else if (rune >= 0x20 && rune <= 0x7E) {
        out.writeCharCode(rune);
      } else {
        out.write(
          '\\u{${rune.toRadixString(16).padLeft(4, '0').toUpperCase()}}',
        );
      }
    }
    out.write('"');
    return out.toString();
  }

  /// Zeroes a buffer that held a value, a plaintext or key material.
  static void wipe(Uint8List? bytes) => bytes?.fillRange(0, bytes.length, 0);
}
