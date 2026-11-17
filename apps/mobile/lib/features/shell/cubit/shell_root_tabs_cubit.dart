import 'dart:developer';

import 'package:bloc/bloc.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A root destination the phone dock can pin as a tab.
///
/// [name] doubles as the persisted id and the dock item key.
enum ShellRootTab {
  home(Routes.home),
  tasks(Routes.tasks),
  calendar(Routes.calendar),
  mail(Routes.mail),
  assistant(Routes.assistant),
  apps(Routes.apps),
  notifications(Routes.notifications),
  profile(Routes.profileRoot);

  const ShellRootTab(this.route);

  final String route;

  /// The module id when this tab opens a mini app; such a tab is offered
  /// only while the module is visible.
  String? get moduleId => switch (this) {
    ShellRootTab.tasks || ShellRootTab.calendar || ShellRootTab.mail => name,
    _ => null,
  };

  ValueKey<String> get key => ValueKey<String>(name);

  static ShellRootTab? fromKey(Key? key) {
    if (key is! ValueKey<String>) return null;
    for (final tab in values) {
      if (tab.name == key.value) return tab;
    }
    return null;
  }
}

/// Most tabs the phone dock pins; the fifth slot is More.
const int shellRootTabLimit = 4;

/// Tabs pinned until the user picks their own.
const List<ShellRootTab> shellDefaultRootTabs = [
  ShellRootTab.home,
  ShellRootTab.tasks,
  ShellRootTab.calendar,
  ShellRootTab.mail,
];

/// Fill for a default tab that is unavailable, in order.
const List<ShellRootTab> _defaultFallbacks = [
  ShellRootTab.assistant,
  ShellRootTab.apps,
  ShellRootTab.notifications,
  ShellRootTab.profile,
];

/// The tabs the dock shows for [chosen] (null for defaults), dropping any
/// that [isAvailable] rejects.
///
/// An unavailable tab's slot is filled with the first available default, then
/// Mira, Apps, Notifications and You, so the dock keeps as many tabs as were
/// chosen (four for the defaults). A deliberately shorter choice stays short.
List<ShellRootTab> resolveShellRootTabs(
  List<ShellRootTab>? chosen, {
  required bool Function(ShellRootTab tab) isAvailable,
}) {
  final wanted = chosen?.take(shellRootTabLimit).toList();
  final count = wanted == null || wanted.isEmpty
      ? shellRootTabLimit
      : wanted.length;
  final tabs =
      (wanted == null || wanted.isEmpty ? shellDefaultRootTabs : wanted)
          .where(isAvailable)
          .toList();
  for (final fill in [...shellDefaultRootTabs, ..._defaultFallbacks]) {
    if (tabs.length >= count) break;
    if (!tabs.contains(fill) && isAvailable(fill)) tabs.add(fill);
  }
  return tabs;
}

/// Persists the user's chosen tab ids.
abstract interface class ShellRootTabsStore {
  Future<List<String>?> read();

  /// Saves [ids], or clears the choice when null.
  Future<void> write(List<String>? ids);
}

class SharedPreferencesShellRootTabsStore implements ShellRootTabsStore {
  const SharedPreferencesShellRootTabsStore();

  static const storageKey = 'shell-dock-root-tabs-v1';

  @override
  Future<List<String>?> read() async =>
      (await SharedPreferences.getInstance()).getStringList(storageKey);

  @override
  Future<void> write(List<String>? ids) async {
    final prefs = await SharedPreferences.getInstance();
    if (ids == null) {
      await prefs.remove(storageKey);
    } else {
      await prefs.setStringList(storageKey, ids);
    }
  }
}

/// The user's chosen phone dock tabs, in order; null means the defaults.
class ShellRootTabsCubit extends Cubit<List<ShellRootTab>?> {
  ShellRootTabsCubit({ShellRootTabsStore? store})
    : _store = store ?? const SharedPreferencesShellRootTabsStore(),
      super(store == null ? _warmTabs() : null);

  /// Saved tab ids read during startup, before the first frame.
  static List<String>? _warmIds;

  /// Reads the saved tabs during startup so a cubit using the default store
  /// starts with the user's tabs instead of flashing the defaults.
  static Future<void> warm({
    ShellRootTabsStore store = const SharedPreferencesShellRootTabsStore(),
  }) async {
    try {
      _warmIds = await store.read();
    } on Object catch (error, stack) {
      log('Failed to read dock tabs', error: error, stackTrace: stack);
    }
  }

  static List<ShellRootTab>? _warmTabs() {
    final ids = _warmIds;
    if (ids == null) return null;
    final tabs = _parse(ids);
    return tabs.isEmpty ? null : tabs;
  }

  /// Forgets the startup read, for tests.
  @visibleForTesting
  static void resetWarmForTesting() => _warmIds = null;

  final ShellRootTabsStore _store;
  bool _changedLocally = false;

  /// Reads the saved choice, ignoring unknown ids and duplicates.
  Future<void> load() async {
    List<String>? ids;
    try {
      ids = await _store.read();
    } on Object catch (error, stack) {
      log('Failed to read dock tabs', error: error, stackTrace: stack);
      return;
    }
    if (isClosed || _changedLocally || ids == null) return;
    final tabs = _parse(ids);
    emit(tabs.isEmpty ? null : tabs);
  }

  Future<void> setTabs(List<ShellRootTab> tabs) async {
    final next = tabs.toSet().take(shellRootTabLimit).toList();
    if (next.isEmpty) return;
    await _save(List.unmodifiable(next));
  }

  Future<void> reset() => _save(null);

  Future<void> _save(List<ShellRootTab>? tabs) async {
    _changedLocally = true;
    if (!isClosed) emit(tabs);
    try {
      await _store.write(tabs?.map((tab) => tab.name).toList());
    } on Object catch (error, stack) {
      log('Failed to save dock tabs', error: error, stackTrace: stack);
    }
  }

  static List<ShellRootTab> _parse(List<String> ids) {
    final tabs = <ShellRootTab>[];
    for (final id in ids) {
      final tab = ShellRootTab.values.where((t) => t.name == id).firstOrNull;
      if (tab != null && !tabs.contains(tab)) tabs.add(tab);
      if (tabs.length == shellRootTabLimit) break;
    }
    return List.unmodifiable(tabs);
  }
}
