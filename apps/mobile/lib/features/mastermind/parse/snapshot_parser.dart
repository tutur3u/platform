import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/strict_json.dart';
import 'package:mobile/features/mastermind/presentation/hub_companion_adapter.dart';
import 'package:mobile/features/mastermind/presentation/hub_contract_adapter.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';

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
part 'parse_resolved_history.dart';
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

/// Largest snapshot accepted on the wire, in the cache and by this parser.
///
/// Schema 1.4 carries a 7-day observability window at 15-minute resolution
/// (673 points per series). Usage points alone run about 360 bytes, so seven
/// instances need about 1.7 MB before models, fleet and delivery series; the
/// former 600 KB cap refused real exports. The HTTP drain stops at this cap
/// before anything is decoded, and decoding runs off the UI isolate.
const mastermindSnapshotMaxBytes = 4000000;

/// Isolate entrypoint returning categories without external input on failure.
ParseOutcome parseMastermindSnapshot(Uint8List bytes) {
  if (bytes.length > mastermindSnapshotMaxBytes) {
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
