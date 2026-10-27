import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/strict_json.dart';

part 'parse_items_0.dart';
part 'parse_items_1.dart';
part 'parse_observability_delivery_0.dart';
part 'parse_observability_delivery_1.dart';
part 'parse_observability_fleet_0.dart';
part 'parse_observability_fleet_1.dart';
part 'parse_observability_fleet_2.dart';
part 'parse_observability_models_0.dart';
part 'parse_observability_usage_0.dart';
part 'parse_observability_usage_1.dart';
part 'parse_products_0.dart';
part 'parse_products_1.dart';
part 'parse_products_2.dart';
part 'parse_products_3.dart';
part 'parse_snapshot_0.dart';
part 'parse_snapshot_1.dart';
part 'parse_variants.dart';

enum RejectionReason {
  tooLarge,
  malformedJson,
  unsupportedVersion,
  schemaViolation,
}

sealed class ParseOutcome {
  const ParseOutcome();
  const factory ParseOutcome.accepted(MastermindSnapshot snapshot) =
      ParseAccepted;
  const factory ParseOutcome.rejected(RejectionReason reason, [String path]) =
      ParseRejected;
}

final class ParseAccepted extends ParseOutcome {
  const ParseAccepted(this.snapshot);
  final MastermindSnapshot snapshot;
}

final class ParseRejected extends ParseOutcome {
  const ParseRejected(this.reason, [this.path = '']);
  final RejectionReason reason;

  /// Debug/test pointer only; never surface or log it in release builds.
  final String path;
}

/// Isolate entrypoint returning categories without external input on failure.
ParseOutcome parseMastermindSnapshot(Uint8List bytes) {
  if (bytes.length > 600000) {
    return const ParseOutcome.rejected(RejectionReason.tooLarge);
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(utf8.decode(bytes));
  } on FormatException {
    return const ParseOutcome.rejected(RejectionReason.malformedJson);
  }
  try {
    final reader = JsonReader(decoded);
    final root = reader.object();
    if (root.containsKey('schema_version') && root['schema_version'] != '1.4') {
      return const ParseOutcome.rejected(RejectionReason.unsupportedVersion);
    }
    return ParseOutcome.accepted(parseRootSnapshot(reader));
  } on SchemaViolation catch (error) {
    return ParseOutcome.rejected(RejectionReason.schemaViolation, error.path);
  }
}
