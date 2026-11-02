import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

/// GET /v1/capabilities: `{schema_versions, replies, push}` plus an optional
/// last `iris` key. The Worker flips these without a store release, so the
/// client reads them instead of probing.
final class MastermindCapabilities {
  MastermindCapabilities({
    required List<String> schemaVersions,
    required this.replies,
    required this.push,
    this.iris = false,
    this.replyHold = false,
  }) : schemaVersions = List.unmodifiable(schemaVersions);

  final List<String> schemaVersions;
  final bool replies;
  final bool push;

  /// The Iris relay is on (`IRIS_ENABLED` on the Worker). Never a statement
  /// about this device's enrolment.
  final bool iris;

  /// Forge F2 honours `not_before` on POST /v1/replies (`reply_hold`). Absent
  /// means off. Nothing sends `not_before` yet: the 30 s hold is client-side.
  final bool replyHold;

  bool get supportsSchema14 => schemaVersions.contains('1.4');

  /// Closed body; null for anything else so a drifting Worker fails closed.
  static MastermindCapabilities? parse(Uint8List bytes) {
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map<String, dynamic>) return null;
      final hasIris = decoded.containsKey('iris');
      final hasHold = decoded.containsKey('reply_hold');
      if (decoded.length != 3 + (hasIris ? 1 : 0) + (hasHold ? 1 : 0) ||
          (hasHold && decoded['reply_hold'] is! bool) ||
          decoded['replies'] is! bool ||
          decoded['push'] is! bool ||
          (hasIris && decoded['iris'] is! bool)) {
        return null;
      }
      final versions = decoded['schema_versions'];
      if (versions is! List ||
          versions.length > 8 ||
          versions.any((v) => v is! String || v.isEmpty || v.length > 16)) {
        return null;
      }
      return MastermindCapabilities(
        schemaVersions: versions.cast<String>(),
        replies: decoded['replies'] as bool,
        push: decoded['push'] as bool,
        iris: hasIris && decoded['iris'] as bool,
        replyHold: hasHold && decoded['reply_hold'] as bool,
      );
    } on FormatException {
      return null;
    }
  }
}

sealed class CapabilitiesFetch {
  const CapabilitiesFetch();
}

final class CapabilitiesFetchOk extends CapabilitiesFetch {
  const CapabilitiesFetchOk(this.capabilities);
  final MastermindCapabilities capabilities;
}

final class CapabilitiesFetchUnavailable extends CapabilitiesFetch {
  const CapabilitiesFetchUnavailable(this.kind);
  final SnapshotUnavailableKind kind;
}
