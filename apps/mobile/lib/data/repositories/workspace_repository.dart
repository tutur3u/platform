import 'dart:convert';

import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository for workspace operations.
///
/// Ported from apps/native/lib/stores/workspace-store.ts.
class WorkspaceRepository {
  WorkspaceRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;
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
          final record = row as Map<String, dynamic>;
          final ws = record['workspaces'] as Map<String, dynamic>?;
          if (ws == null) return null;
          return Workspace.fromJson(ws);
        })
        .whereType<Workspace>()
        .toList();
  }

  /// Fetches the server-side default workspace for the current user.
  ///
  /// Mirrors `getUserDefaultWorkspace()` from the web app:
  /// 1. Read `default_workspace_id` from `user_private_details`
  /// 2. Validate the user has access to that workspace
  /// 3. Fall back to personal workspace if invalid/unset
  Future<Workspace?> getDefaultWorkspace() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return null;

    try {
      final row = await supabase
          .from('user_private_details')
          .select('default_workspace_id')
          .eq('user_id', userId)
          .maybeSingle();

      final defaultId = row?['default_workspace_id'] as String?;

      if (defaultId != null) {
        // Validate user still has access to this workspace
        final member = await supabase
            .from('workspace_members')
            .select('ws_id, workspaces(*)')
            .eq('user_id', userId)
            .eq('ws_id', defaultId)
            .maybeSingle();

        if (member != null) {
          final ws = member['workspaces'] as Map<String, dynamic>?;
          if (ws != null) return Workspace.fromJson(ws);
        }
      }

      // Fallback: find personal workspace
      final personalRow = await supabase
          .from('workspace_members')
          .select('ws_id, workspaces(*)')
          .eq('user_id', userId)
          .eq('workspaces.personal', true)
          .maybeSingle();

      if (personalRow != null) {
        final ws = personalRow['workspaces'] as Map<String, dynamic>?;
        if (ws != null) return Workspace.fromJson(ws);
      }
    } on Object catch (_) {
      // Non-critical — caller falls back to SharedPreferences
    }

    return null;
  }

  /// Persists the default workspace on the server.
  Future<void> updateDefaultWorkspace(String workspaceId) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    await supabase
        .from('user_private_details')
        .update({'default_workspace_id': workspaceId})
        .eq('user_id', userId);
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
    } on Object catch (_) {
      return null;
    }
  }

  /// Clears the selected workspace.
  Future<void> clearSelectedWorkspace() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_selectedKey);
  }

  /// Fetches workspace creation limits for the current user.
  Future<WorkspaceLimits> getWorkspaceLimits() async {
    final json = await _api.getJson('/api/v1/workspaces/limits');
    return WorkspaceLimits.fromJson(json);
  }

  /// Creates a new workspace with the given [name].
  ///
  /// Returns the created [Workspace] or throws [ApiException].
  Future<Workspace> createWorkspace(String name) async {
    final json = await _api.postJson(
      '/api/v1/workspaces',
      {'name': name},
    );

    final wsId = json['id'] as String;
    // Fetch the full workspace to get all fields
    final ws = await getWorkspaceById(wsId);
    if (ws == null) {
      throw const ApiException(
        message: 'Workspace created but could not be fetched',
        statusCode: 0,
      );
    }
    return ws;
  }
}
