import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The ids that find the device's cached thread lists after a restart: the
/// bridge machine, its linked environments, and the projects with a cached
/// first page. Ids only; titles and labels stay in the encrypted cache.
@immutable
class ProjectsIds {
  const ProjectsIds({
    required this.machineId,
    this.environmentIds = const [],
    this.projectIds = const [],
  });

  static const maxProjects = 50;

  final String machineId;
  final List<String> environmentIds;
  final List<String> projectIds;

  ProjectsIds withProject(String projectId) => ProjectsIds(
    machineId: machineId,
    environmentIds: environmentIds,
    projectIds: [
      projectId,
      ...projectIds.where((id) => id != projectId),
    ].take(maxProjects).toList(),
  );

  Map<String, Object> toJson() => {
    'machineId': machineId,
    'environmentIds': environmentIds,
    'projectIds': projectIds,
  };

  static ProjectsIds? fromJson(Object? json) {
    if (json case {
      'machineId': final String machineId,
      'environmentIds': final List<dynamic> environments,
      'projectIds': final List<dynamic> projects,
    }) {
      return ProjectsIds(
        machineId: machineId,
        environmentIds: environments.whereType<String>().toList(),
        projectIds: projects.whereType<String>().toList(),
      );
    }
    return null;
  }
}

/// Where [ProjectsIds] live, per account. Every call names the account,
/// captured when the read that produced the ids started, so a read that
/// finishes after an account switch never writes under the new account.
abstract interface class ProjectsIdStore {
  Future<ProjectsIds?> read(String userId);

  Future<void> write(String userId, ProjectsIds ids);

  Future<void> clear(String userId);
}

final class MemoryProjectsIdStore implements ProjectsIdStore {
  final _ids = <String, ProjectsIds>{};

  @override
  Future<ProjectsIds?> read(String userId) async => _ids[userId];

  @override
  Future<void> write(String userId, ProjectsIds ids) async =>
      _ids[userId] = ids;

  @override
  Future<void> clear(String userId) async => _ids.remove(userId);
}

/// SharedPreferences under `mastermind.projects.ids.<userId>`. No account
/// (signed out) reads nothing and writes nothing.
final class PrefsProjectsIdStore implements ProjectsIdStore {
  const PrefsProjectsIdStore();

  static String? _keyOf(String userId) =>
      userId.isEmpty ? null : 'mastermind.projects.ids.$userId';

  @override
  Future<ProjectsIds?> read(String userId) async {
    final key = _keyOf(userId);
    if (key == null) return null;
    try {
      final raw = (await SharedPreferences.getInstance()).getString(key);
      return raw == null ? null : ProjectsIds.fromJson(jsonDecode(raw));
    } on Object {
      return null;
    }
  }

  @override
  Future<void> write(String userId, ProjectsIds ids) async {
    final key = _keyOf(userId);
    if (key == null) return;
    try {
      await (await SharedPreferences.getInstance()).setString(
        key,
        jsonEncode(ids.toJson()),
      );
    } on Object {
      // Ids are a convenience for the offline view; nothing else needs them.
    }
  }

  @override
  Future<void> clear(String userId) async {
    final key = _keyOf(userId);
    if (key == null) return;
    try {
      await (await SharedPreferences.getInstance()).remove(key);
    } on Object {
      // A later write for that account replaces whatever is left.
    }
  }
}
