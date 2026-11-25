import 'package:flutter/foundation.dart';

/// Bumped after an item is saved, adjusted or deleted from its detail, so
/// an items list that pushed the detail reloads only when something
/// changed and otherwise keeps its loaded pages and scroll position.
final ValueNotifier<int> inventoryCatalogRevision = ValueNotifier<int>(0);
