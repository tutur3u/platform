import 'package:mobile/features/mastermind/model/snapshot.dart';

/// Only unique open asks; hub-answered identities take precedence.
List<NeedsYou> openAsks(MastermindSnapshot snapshot) {
  final closed = {
    for (final item in snapshot.resolvedItems) item.id,
    for (final item in snapshot.now.needsYou.whereType<NeedsYou>())
      if (item.state != ItemState.open) item.id,
  };
  final items = <String, NeedsYou>{};
  for (final item in snapshot.now.needsYou.whereType<NeedsYou>()) {
    if (item.state == ItemState.open && !closed.contains(item.id)) {
      items[item.id] = item;
    }
  }
  return items.values.toList(growable: false);
}
