import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef SidebarDevicePreference = ({
  SidebarBehavior? behavior,
  bool localOverride,
});
typedef SidebarAccountPreference = ({
  SidebarBehavior? behavior,
  bool pending,
});

class SidebarPreferences {
  SidebarPreferences({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const _deviceKey = 'sidebar-behavior:device';
  static const _accountPrefix = 'sidebar-behavior:account:';
  static const _override = 'override:';
  static const _pending = 'pending:';
  static const _configPath = '/api/v1/users/me/configs/SIDEBAR_BEHAVIOR';

  final ApiClient _api;

  Future<SidebarDevicePreference> readDevice() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_deviceKey);
    final localOverride = raw?.startsWith(_override) ?? false;
    return (
      behavior: SidebarBehavior.parse(
        localOverride ? raw!.substring(_override.length) : raw,
      ),
      localOverride: localOverride,
    );
  }

  Future<void> writeDevice(SidebarDevicePreference preference) async {
    final prefs = await SharedPreferences.getInstance();
    final name = preference.behavior?.name ?? '';
    final value = preference.localOverride ? '$_override$name' : name;
    if (!await prefs.setString(_deviceKey, value)) {
      throw StateError('Could not store sidebar device preference');
    }
  }

  Future<SidebarAccountPreference> readAccount(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_accountPrefix$userId');
    final pending = raw?.startsWith(_pending) ?? false;
    return (
      behavior: SidebarBehavior.parse(
        pending ? raw!.substring(_pending.length) : raw,
      ),
      pending: pending,
    );
  }

  Future<void> writeAccount(
    String userId,
    SidebarBehavior? behavior, {
    required bool pending,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_accountPrefix$userId';
    final saved = behavior == null
        ? await prefs.remove(key)
        : await prefs.setString(
            key,
            pending ? '$_pending${behavior.name}' : behavior.name,
          );
    if (!saved) throw StateError('Could not store sidebar account preference');
  }

  Future<SidebarBehavior?> loadAccount(String userId) async {
    final data = await ApiClient.runForUser(
      userId,
      () => _api.getJson(_configPath),
    );
    return SidebarBehavior.parse(data['value']);
  }

  Future<void> saveAccount(String userId, SidebarBehavior behavior) =>
      ApiClient.runForUser(
        userId,
        () => _api.putJson(_configPath, {'value': behavior.name}),
      );
}
