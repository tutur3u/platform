import 'dart:convert';

import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository for workspace operations.
///
/// Ported from apps/native/lib/stores/workspace-store.ts.
class WorkspaceRepository {
  static const _selectedKey = 'selected-workspace';

  /// Fetches workspaces the current user belongs to.
  Future<List<Workspace>> getWorkspaces() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return [];

    final response = await supabase
        .from('workspace_members')
        .select('ws_id, workspaces(*)')
        .eq('user_id', userId);

    final list = response as List<dynamic>;
    return list
        .map((row) {
          final ws = row['workspaces'] as Map<String, dynamic>?;
          if (ws == null) return null;
          return Workspace.fromJson(ws);
        })
        .whereType<Workspace>()
        .toList();
  }

  /// Fetches a single workspace by ID.
  Future<Workspace?> getWorkspaceById(String wsId) async {
    final response = await supabase
        .from('workspaces')
        .select()
        .eq('id', wsId)
        .maybeSingle();

    if (response == null) return null;
    return Workspace.fromJson(response);
  }

  /// Persists the selected workspace to SharedPreferences.
  Future<void> saveSelectedWorkspace(Workspace workspace) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_selectedKey, jsonEncode(workspace.toJson()));
  }

  /// Loads the previously selected workspace from SharedPreferences.
  Future<Workspace?> loadSelectedWorkspace() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_selectedKey);
    if (json == null) return null;

    try {
      return Workspace.fromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

  /// Clears the selected workspace.
  Future<void> clearSelectedWorkspace() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_selectedKey);
  }
}
