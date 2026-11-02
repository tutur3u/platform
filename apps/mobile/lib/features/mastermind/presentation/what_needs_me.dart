import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';

/// "What needs me": open asks by how soon they need an answer. Each ask is
/// counted once, in its most pressing bucket: urgent, then soon (high
/// urgency), then FYI, then the rest.
final class WhatNeedsMeCounts {
  const WhatNeedsMeCounts({
    this.urgent = 0,
    this.soon = 0,
    this.fyi = 0,
    this.other = 0,
  });

  factory WhatNeedsMeCounts.from(Iterable<NeedsYou> open) {
    var urgent = 0;
    var soon = 0;
    var fyi = 0;
    var other = 0;
    for (final item in open) {
      if (item.state != ItemState.open) continue;
      switch (askPressure(item)) {
        case AskPressure.urgent:
          urgent++;
        case AskPressure.soon:
          soon++;
        case AskPressure.fyi:
          fyi++;
        case AskPressure.other:
          other++;
      }
    }
    return WhatNeedsMeCounts(
      urgent: urgent,
      soon: soon,
      fyi: fyi,
      other: other,
    );
  }

  final int urgent;
  final int soon;
  final int fyi;
  final int other;

  int get total => urgent + soon + fyi + other;
}

enum AskPressure { urgent, soon, fyi, other }

AskPressure askPressure(NeedsYou item) => switch (item.urgency) {
  AskUrgency.urgent => AskPressure.urgent,
  AskUrgency.high => AskPressure.soon,
  _ when item.kind == ItemKind.fyi => AskPressure.fyi,
  _ => AskPressure.other,
};

/// The option "Use recommendations" would send for [item]: its recommended
/// selectable option, as `(option_index, label)`. Null when it has none.
(int, String)? recommendedChoice(NeedsYou item) {
  if (item.state != ItemState.open) return null;
  for (final option in selectableOptions(item)) {
    if (item.optionRecommended(option.$1)) return option;
  }
  return null;
}
