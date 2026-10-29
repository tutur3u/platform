import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';

/// GET /v1/capabilities: `{schema_versions, replies, push}`. The Worker flips
/// these without a store release, so the client reads them instead of probing.
final class MastermindCapabilities {
  MastermindCapabilities({
    required List<String> schemaVersions,
    required this.replies,
    required this.push,
  }) : schemaVersions = List.unmodifiable(schemaVersions);

  final List<String> schemaVersions;
  final bool replies;
  final bool push;

  bool get supportsSchema14 => schemaVersions.contains('1.4');

  /// Closed body; null for anything else so a drifting Worker fails closed.
  static MastermindCapabilities? parse(Uint8List bytes) {
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map<String, dynamic> ||
          decoded.length != 3 ||
          decoded['replies'] is! bool ||
          decoded['push'] is! bool) {
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
