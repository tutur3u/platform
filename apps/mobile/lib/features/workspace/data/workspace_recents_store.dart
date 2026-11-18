import 'dart:developer';

import 'package:shared_preferences/shared_preferences.dart';

/// Most workspace ids kept in the recent-use list.
const int workspaceRecentsLimit = 12;

/// Moves [workspaceId] to the front of [ids], keeping at most
/// [workspaceRecentsLimit] distinct ids.
List<String> pushWorkspaceRecent(List<String> ids, String workspaceId) =>
    List.unmodifiable(
      [
        workspaceId,
        ...ids.where((id) => id != workspaceId),
      ].take(workspaceRecentsLimit),
    );

/// Remembers, per account and on this device only, which workspaces were
/// switched to most recently. Only workspace ids are stored; failures are
/// logged and treated as an empty list, since the order is a convenience.
/// An account's list is removed when it signs out or is removed from the
/// device ([clear]), and every list when all accounts sign out ([clearAll]).
class WorkspaceRecentsStore {
  const WorkspaceRecentsStore();

  static const _prefix = 'workspace-recent-ids-v1';

  static String storageKey(String actorId) => '$_prefix:$actorId';

  Future<List<String>> read(String actorId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return List.unmodifiable(
        prefs.getStringList(storageKey(actorId)) ?? const <String>[],
      );
    } on Object catch (error, stack) {
      log('Failed to read recent workspaces', error: error, stackTrace: stack);
      return const [];
    }
  }

  /// Removes [actorId]'s list.
  Future<void> clear(String actorId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(storageKey(actorId));
    } on Object catch (error, stack) {
      log('Failed to clear recent workspaces', error: error, stackTrace: stack);
    }
  }

  /// Removes every account's list.
  Future<void> clearAll() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys().where((key) => key.startsWith('$_prefix:'));
      for (final key in keys.toList()) {
        await prefs.remove(key);
      }
    } on Object catch (error, stack) {
      log('Failed to clear recent workspaces', error: error, stackTrace: stack);
    }
  }

  Future<void> write(String actorId, List<String> ids) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(storageKey(actorId), ids);
    } on Object catch (error, stack) {
      log('Failed to save recent workspaces', error: error, stackTrace: stack);
    }
  }
}
