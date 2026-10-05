import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local mode has its own actor/workspace key, separate from gateway models.
/// The session predicate also fences sign-out/sign-in with the same actor ID.
class AssistantLocalPreferences {
  AssistantLocalPreferences({String? Function()? currentUserId})
    : _currentUserId = currentUserId ?? currentCacheUserId;
  final String? Function() _currentUserId;

  String? _key(String workspaceId) {
    final user = _currentUserId();
    return user == null ? null : '$user::mira-local-model::$workspaceId';
  }

  Future<String?> load(
    String workspaceId, {
    required bool Function() isScopeCurrent,
  }) async {
    final key = _key(workspaceId);
    if (key == null || !isScopeCurrent()) return null;
    final preferences = await SharedPreferences.getInstance();
    if (key != _key(workspaceId) || !isScopeCurrent()) return null;
    final selected = preferences.getString(key);
    // Retain an unavailable preference as a blocked local choice. A catalogue
    // change must not silently turn the next private prompt into a remote one.
    return selected == null || selected.isEmpty ? null : selected;
  }

  Future<void> save(
    String workspaceId,
    String? modelId, {
    required bool Function() isScopeCurrent,
  }) async {
    if (modelId != null &&
        !assistantLocalModels.any((model) => model.id == modelId)) {
      throw ArgumentError('Unknown local model');
    }
    final key = _key(workspaceId);
    if (key == null || !isScopeCurrent()) return;
    final preferences = await SharedPreferences.getInstance();
    if (key != _key(workspaceId) || !isScopeCurrent()) return;
    final saved = modelId == null
        ? await preferences.remove(key)
        : await preferences.setString(key, modelId);
    if (!saved) throw StateError('Local model preference could not be saved');
  }
}
