import 'dart:collection';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/utils/tiptap_description_parser.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_to_quill_converter.dart';

/// How many descriptions each cache keeps, most recently read first. A
/// board session reopens a handful of tasks; this bounds memory to a few
/// documents.
const int _taskDescriptionCacheSize = 24;

/// Read-only description renders keyed by the stored payload, so a task
/// that reopens, or a sheet that rebuilds on every board change, reuses
/// its parse instead of decoding and converting the JSON again.
///
/// The payload is the key, so an edited description is a new entry and a
/// stale render can never show.
class _LruCache<V> {
  final LinkedHashMap<String, V> _entries = LinkedHashMap<String, V>();

  V putIfAbsent(String key, V Function() create) {
    if (_entries.containsKey(key)) {
      // Re-insert to mark it most recently read.
      final value = _entries.remove(key) as V;
      _entries[key] = value;
      return value;
    }
    final created = create();
    _entries[key] = created;
    if (_entries.length > _taskDescriptionCacheSize) {
      _entries.remove(_entries.keys.first);
    }
    return created;
  }

  bool contains(String key) => _entries.containsKey(key);

  void clear() => _entries.clear();
}

final _LruCache<ParsedTipTapDescription?> _parsedDescriptions =
    _LruCache<ParsedTipTapDescription?>();
final _LruCache<Delta> _viewerDeltas = _LruCache<Delta>();

/// [parseTipTapTaskDescription], remembered per payload.
ParsedTipTapDescription? parseTipTapTaskDescriptionCached(
  String? rawDescription,
) {
  if (rawDescription == null) return null;
  return _parsedDescriptions.putIfAbsent(
    rawDescription,
    () => parseTipTapTaskDescription(rawDescription),
  );
}

/// The read-only viewer's Quill delta for [payload], with horizontal rules
/// as divider embeds and theme colours as palette keys. Callers must treat
/// the delta as immutable.
Delta taskDescriptionViewerDelta(String payload) => _viewerDeltas.putIfAbsent(
  payload,
  () => tipTapJsonToQuillDelta(
    payload,
    dividerEmbeds: true,
    themeColorKeys: true,
  ),
);

/// Whether [payload] already has a converted viewer delta.
bool hasTaskDescriptionViewerDelta(String payload) =>
    _viewerDeltas.contains(payload);

/// Clears both caches.
@visibleForTesting
void clearTaskDescriptionRenderCaches() {
  _parsedDescriptions.clear();
  _viewerDeltas.clear();
}
