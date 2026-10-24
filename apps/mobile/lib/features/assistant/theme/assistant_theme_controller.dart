import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';

/// Publish a fresh instance on every auth-session transition, even for the
/// same actor. Publish null synchronously when logout begins.
class AssistantThemeActor {
  AssistantThemeActor(this.actorId) {
    if (actorId.trim().isEmpty || actorId.contains('::')) {
      throw ArgumentError.value(actorId, 'actorId');
    }
  }

  final String actorId;
}

/// Own above the Assistant route, and dispose with its auth-session owner.
class AssistantThemeController extends ChangeNotifier {
  AssistantThemeController({
    required ValueListenable<AssistantThemeActor?> actor,
    AssistantThemeStore? store,
  }) : _actor = actor,
       _store = store ?? AssistantThemeStore() {
    _actor.addListener(_actorChanged);
    _actorChanged();
  }

  final ValueListenable<AssistantThemeActor?> _actor;
  final AssistantThemeStore _store;
  AssistantThemeActor? _snapshot;
  AssistantThemePreferences _value = const AssistantThemePreferences();
  int _epoch = 0;
  int _revision = 0;
  bool _disposed = false;
  bool _loading = false;
  bool _saving = false;
  bool _storageFailed = false;
  bool _failedLoad = false;

  AssistantThemePreferences get value => _value;
  bool get loading => _loading;
  bool get saving => _saving;
  bool get storageFailed => _storageFailed;
  bool get canEdit => !_disposed && _snapshot != null && !_loading;

  /// Capture per build so a picker opened in a retired session cannot edit
  /// the next actor after its route returns a delayed selection.
  ValueChanged<AssistantThemePreferences>? get onChanged {
    final actor = _snapshot;
    if (!canEdit || actor == null) return null;
    final epoch = _epoch;
    final revision = _revision;
    return (value) {
      if (_current(actor, epoch, revision)) unawaited(setValue(value));
    };
  }

  bool _current(AssistantThemeActor actor, int epoch, int revision) =>
      !_disposed &&
      identical(_snapshot, actor) &&
      identical(_actor.value, actor) &&
      _epoch == epoch &&
      _revision == revision;

  void _actorChanged() {
    if (_disposed) return;
    _snapshot = _actor.value;
    _epoch++;
    _revision++;
    _value = const AssistantThemePreferences();
    _storageFailed = false;
    _failedLoad = false;
    _saving = false;
    _loading = _snapshot != null;
    notifyListeners();
    unawaited(reload());
  }

  Future<void> reload() async {
    final actor = _snapshot;
    if (_disposed || actor == null) return;
    final epoch = _epoch;
    final revision = ++_revision;
    bool current() => _current(actor, epoch, revision);
    _loading = true;
    _saving = false;
    _storageFailed = false;
    _failedLoad = false;
    notifyListeners();
    try {
      final stored = await _store.read(actor.actorId, isCurrent: current);
      if (current()) _value = stored;
    } on Object {
      if (current()) {
        _storageFailed = true;
        _failedLoad = true;
      }
    } finally {
      if (current()) {
        _loading = false;
        notifyListeners();
      }
    }
  }

  /// Returns false for a retired session, superseded edit or failed storage.
  /// Failed edits remain visible, so retry saves the user's current choice.
  Future<bool> setValue(AssistantThemePreferences value) async {
    final actor = _snapshot;
    if (!canEdit || actor == null) return false;
    final epoch = _epoch;
    final revision = ++_revision;
    bool current() => _current(actor, epoch, revision);
    _value = AssistantThemePreferences.decode(value.encode());
    _saving = true;
    _storageFailed = false;
    _failedLoad = false;
    notifyListeners();
    try {
      final saved = await _store.write(
        actor.actorId,
        _value,
        isCurrent: current,
      );
      if (current()) _storageFailed = !saved;
      return saved && current();
    } on Object {
      if (current()) _storageFailed = true;
      return false;
    } finally {
      if (current()) {
        _saving = false;
        notifyListeners();
      }
    }
  }

  Future<bool> reset() => setValue(const AssistantThemePreferences());

  Future<void> retry() async {
    if (_failedLoad) {
      await reload();
    } else {
      await setValue(_value);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _epoch++;
    _actor.removeListener(_actorChanged);
    super.dispose();
  }
}
