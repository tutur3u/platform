/// Mastermind secret entry, protocol v1: the `secret` payload of a fleet
/// decision. A request asks the owner for a value that only one command on
/// one machine receives; a pairing introduces a machine's key to this phone.
/// Every bound field stays the exact string the machine signed, so the
/// phone rebuilds the binding bytes from it. A payload that does not match
/// the frozen shapes parses as null and its decision is dropped.
/// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
library;

import 'dart:convert';

const fleetSecretProtocolVersion = '1';

final _requestId = RegExp(r'^secret-[0-9a-f]{24}$');
final _pairingId = RegExp(r'^pair-[0-9a-f]{24}$');
final _slug = RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$');
final _requester = RegExp(r'^(lane-[0-9a-f]{16}|terminal)$');
final _isoMillis = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$');
final _audience = RegExp(r'^[0-9a-f]{32}(,[0-9a-f]{32}){0,3}$');
final _digest = RegExp(r'^([0-9a-f]{64}|[0-9a-f]{32})?$');
final _b64url = RegExp(r'^[A-Za-z0-9_-]*$');
final _control = RegExp('[\u0000-\u001f\u007f]');

/// Decodes canonical unpadded base64url of exactly [length] bytes, or null.
/// Canonical: re-encoding gives the same text, so a key has one spelling.
List<int>? fleetSecretFromB64url(String text, {int? length}) {
  if (!_b64url.hasMatch(text) || text.length % 4 == 1) return null;
  final List<int> bytes;
  try {
    bytes = base64Url.decode(base64Url.normalize(text));
  } on FormatException {
    return null;
  }
  if (length != null && bytes.length != length) return null;
  return fleetSecretB64url(bytes) == text ? bytes : null;
}

/// Unpadded base64url.
String fleetSecretB64url(List<int> bytes) =>
    base64Url.encode(bytes).replaceAll('=', '');

String? _field(Map<String, dynamic> json, String key) {
  final value = json[key];
  return value is String ? value : null;
}

String? _key(Map<String, dynamic> json, String key, int length) {
  final value = _field(json, key);
  return value != null && fleetSecretFromB64url(value, length: length) != null
      ? value
      : null;
}

/// A bound UTC time with milliseconds and `Z`, or null.
DateTime? fleetSecretTime(String? raw) {
  if (raw == null || !_isoMillis.hasMatch(raw)) return null;
  final time = DateTime.tryParse(raw)?.toUtc();
  return time != null && time.toIso8601String() == raw ? time : null;
}

/// Display text the machine signed: present, bounded, one line.
String? _text(Map<String, dynamic> json, String key, int max) {
  final value = _field(json, key);
  return value != null &&
          value.trim().isNotEmpty &&
          value.length <= max &&
          !_control.hasMatch(value)
      ? value
      : null;
}

/// The parsed `command`: [argv] runs locally; [remote], when present, is the
/// argument list an SSH operation's remote command receives.
class FleetSecretCommand {
  const FleetSecretCommand({required this.argv, this.remote});

  static FleetSecretCommand? parse(String text) {
    if (text.isEmpty || text.length > 8192) return null;
    final Object? json;
    try {
      json = jsonDecode(text);
    } on FormatException {
      return null;
    }
    if (json is! Map<String, dynamic>) return null;
    if (json.keys.any((key) => key != 'argv' && key != 'remote')) return null;
    final argv = _args(json['argv']);
    if (argv == null) return null;
    if (!json.containsKey('remote')) return FleetSecretCommand(argv: argv);
    final remote = _args(json['remote']);
    return remote == null
        ? null
        : FleetSecretCommand(argv: argv, remote: remote);
  }

  static List<String>? _args(Object? raw) {
    if (raw is! List || raw.isEmpty || raw.length > 64) return null;
    final args = <String>[];
    for (final arg in raw) {
      if (arg is! String) return null;
      args.add(arg);
    }
    return List.unmodifiable(args);
  }

  final List<String> argv;
  final List<String>? remote;
}

sealed class FleetSecret {
  const FleetSecret({
    required this.machineId,
    required this.signerKey,
    required this.expiresAt,
  });

  /// The request or pairing payload, or null when any field is off-shape.
  static FleetSecret? parse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    if (raw['v'] != fleetSecretProtocolVersion) return null;
    return switch (raw['mode']) {
      'request' => FleetSecretRequest.parse(raw),
      'pair' => FleetSecretPairing.parse(raw),
      _ => null,
    };
  }

  /// The id the machine signed; the decision id must equal it.
  String get signedId;

  final String machineId;

  /// The machine's Ed25519 key, base64url, as signed.
  final String signerKey;

  /// As signed, e.g. `2026-11-22T10:10:00.000Z`.
  final String expiresAt;

  DateTime get expiresAtTime => fleetSecretTime(expiresAt)!;
}

class FleetSecretRequest extends FleetSecret {
  const FleetSecretRequest({
    required this.requestId,
    required super.machineId,
    required this.requester,
    required this.operation,
    required this.command,
    required this.output,
    required this.purpose,
    required super.expiresAt,
    required this.publicKey,
    required super.signerKey,
    required this.audience,
    required this.sig,
    required this.parsedCommand,
  });

  static FleetSecretRequest? parse(Map<String, dynamic> json) {
    final requestId = _field(json, 'requestId');
    final machineId = _field(json, 'machineId');
    final requester = _field(json, 'requester');
    final operation = _field(json, 'operation');
    final command = _field(json, 'command');
    final output = _field(json, 'output');
    final purpose = _text(json, 'purpose', 120);
    final expiresAt = _field(json, 'expiresAt');
    final publicKey = _key(json, 'publicKey', 32);
    final signerKey = _key(json, 'signerKey', 32);
    final audience = _field(json, 'audience');
    final sig = _key(json, 'sig', 64);
    final parsedCommand = command == null
        ? null
        : FleetSecretCommand.parse(command);
    if (requestId == null ||
        !_requestId.hasMatch(requestId) ||
        machineId == null ||
        !_slug.hasMatch(machineId) ||
        requester == null ||
        !_requester.hasMatch(requester) ||
        operation == null ||
        !_slug.hasMatch(operation) ||
        command == null ||
        parsedCommand == null ||
        (output != 'withheld' && output != 'agent') ||
        purpose == null ||
        fleetSecretTime(expiresAt) == null ||
        publicKey == null ||
        signerKey == null ||
        audience == null ||
        !_sortedAudience(audience) ||
        sig == null) {
      return null;
    }
    return FleetSecretRequest(
      requestId: requestId,
      machineId: machineId,
      requester: requester,
      operation: operation,
      command: command,
      output: output!,
      purpose: purpose,
      expiresAt: expiresAt!,
      publicKey: publicKey,
      signerKey: signerKey,
      audience: audience,
      sig: sig,
      parsedCommand: parsedCommand,
    );
  }

  static bool _sortedAudience(String audience) {
    if (!_audience.hasMatch(audience)) return false;
    final ids = audience.split(',');
    for (var i = 1; i < ids.length; i++) {
      if (ids[i - 1].compareTo(ids[i]) >= 0) return false;
    }
    return true;
  }

  final String requestId;
  final String requester;
  final String operation;

  /// JSON text, bound verbatim; [parsedCommand] is for display and checks.
  final String command;
  final String output;
  final String purpose;

  /// The one-use X25519 key of the requesting helper.
  final String publicKey;
  final String audience;
  final String sig;
  final FleetSecretCommand parsedCommand;

  @override
  String get signedId => requestId;

  /// The child's output reaches the agent instead of `/dev/null`.
  bool get outputToAgent => output == 'agent';

  /// The fields after the domain, in protocol order.
  List<String> get bindingFields => [
    fleetSecretProtocolVersion,
    requestId,
    machineId,
    requester,
    operation,
    command,
    output,
    purpose,
    expiresAt,
    publicKey,
    signerKey,
    audience,
  ];

  List<String> get audienceIds => audience.split(',');
}

class FleetSecretPairing extends FleetSecret {
  const FleetSecretPairing({
    required this.pairingId,
    required super.machineId,
    required this.machineLabel,
    required super.signerKey,
    required super.expiresAt,
    required this.machineMac,
  });

  static FleetSecretPairing? parse(Map<String, dynamic> json) {
    final pairingId = _field(json, 'pairingId');
    final machineId = _field(json, 'machineId');
    final machineLabel = _text(json, 'machineLabel', 40);
    final signerKey = _key(json, 'signerKey', 32);
    final expiresAt = _field(json, 'expiresAt');
    final machineMac = _key(json, 'machineMac', 32);
    if (pairingId == null ||
        !_pairingId.hasMatch(pairingId) ||
        machineId == null ||
        !_slug.hasMatch(machineId) ||
        machineLabel == null ||
        signerKey == null ||
        fleetSecretTime(expiresAt) == null ||
        machineMac == null) {
      return null;
    }
    return FleetSecretPairing(
      pairingId: pairingId,
      machineId: machineId,
      machineLabel: machineLabel,
      signerKey: signerKey,
      expiresAt: expiresAt!,
      machineMac: machineMac,
    );
  }

  final String pairingId;
  final String machineLabel;
  final String machineMac;

  @override
  String get signedId => pairingId;
}

enum FleetSecretOutcomeKind {
  delivered,
  failed,
  declined,
  expired,
  cancelled,
  paired,
}

/// The machine-signed outcome of a resolved secret decision. Unverified as
/// parsed: the flow checks [sig] against the pinned machine key.
class FleetSecretOutcome {
  const FleetSecretOutcome({
    required this.outcome,
    required this.answerDigest,
    required this.sig,
  });

  static FleetSecretOutcome? parse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final outcome = FleetSecretOutcomeKind.values
        .where((kind) => kind.name == raw['outcome'])
        .firstOrNull;
    final digest = _field(raw, 'answerDigest');
    final sig = _key(raw, 'sig', 64);
    if (outcome == null ||
        digest == null ||
        !_digest.hasMatch(digest) ||
        sig == null) {
      return null;
    }
    return FleetSecretOutcome(outcome: outcome, answerDigest: digest, sig: sig);
  }

  final FleetSecretOutcomeKind outcome;
  final String answerDigest;
  final String sig;
}
