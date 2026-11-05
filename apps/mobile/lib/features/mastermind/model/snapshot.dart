import 'package:mobile/features/mastermind/asks/ask_v2_fields.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/model/enums.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/usage_gaps.dart';

export 'package:mobile/features/mastermind/asks/ask_v2_fields.dart';
export 'package:mobile/features/mastermind/model/enums.dart';

part 'items_types_0.dart';
part 'items_types_1.dart';
part 'observability_delivery_types_0.dart';
part 'observability_delivery_types_1.dart';
part 'observability_fleet_types_0.dart';
part 'observability_fleet_types_1.dart';
part 'observability_fleet_types_2.dart';
part 'observability_models_types_0.dart';
part 'observability_usage_types_0.dart';
part 'observability_usage_types_1.dart';
part 'products_types_0.dart';
part 'products_types_1.dart';
part 'products_types_2.dart';
part 'products_types_3.dart';
part 'snapshot_types_0.dart';
part 'snapshot_types_1.dart';

sealed class EventPayload {
  const EventPayload();
}

sealed class NeedsYouItem implements EventPayload {
  const NeedsYouItem();
  String get title;
}

sealed class LaneItem implements EventPayload {
  const LaneItem();
  String get title;
}

sealed class BacklogEntry implements EventPayload {
  const BacklogEntry();
  String get title;
}

sealed class Decision {
  const Decision();
  String get id;
  DateTime get at;
  String get title;
  Risk get risk;
  Product? get product;
}
