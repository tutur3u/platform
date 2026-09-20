import 'package:shared_preferences/shared_preferences.dart';

/// Repository for user preferences (theme, calendar view, etc.).
///
/// Ported from apps/native/lib/stores/ui-store.ts.
class SettingsRepository {
  static const _themeModeKey = 'theme-mode';
  static const _calendarViewKey = 'calendar-view';
  static const _taskViewModeKey = 'task-view-mode';
  static const _disableDefaultTaskBoardNavigationKey =
      'disable-default-task-board-navigation';
  static const _enabledExperimentalAppsKey = 'enabled-experimental-apps';
  static const _personalDefaultTaskBoardIdPrefix =
      'personal-default-task-board-id';
  static const _financeAmountsVisibleKey = 'finance-amounts-visible';
  static const _localeKey = 'locale';
  static const _lastTabRouteKey = 'last-tab-route';
  static const _lastAppRouteKey = 'last-app-route';
  static const _lastIncomeCategoryPrefix = 'last-income-category';
  static const _lastInventoryProductOwnerPrefix =
      'last-inventory-product-owner';
  static const _lastInventoryProductCategoryPrefix =
      'last-inventory-product-category';
  static const _lastInventoryProductFinanceCategoryPrefix =
      'last-inventory-product-finance-category';
  static const _hasSeenOnboardingKey = 'has_seen_onboarding';
  static const _dismissedRecommendedVersionPrefix =
      'dismissed-recommended-version';
  static const _pushPermissionPromptedPrefix =
      'push-notification-permission-prompted';

  Future<bool> getShowAppsTab() async =>
      (await SharedPreferences.getInstance()).getBool('show-apps-tab') ?? false;

  Future<void> setShowAppsTab({required bool value}) async {
    await (await SharedPreferences.getInstance()).setBool(
      'show-apps-tab',
      value,
    );
  }

  Future<String> getThemeMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_themeModeKey) ?? 'system';
  }

  Future<void> setThemeMode(String mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeModeKey, mode);
  }

  Future<String> getCalendarView() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_calendarViewKey) ?? 'week';
  }

  Future<void> setCalendarView(String view) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_calendarViewKey, view);
  }

  Future<String> getTaskViewMode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_taskViewModeKey) ?? 'list';
  }

  Future<void> setTaskViewMode(String mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_taskViewModeKey, mode);
  }

  Future<bool> getDisableDefaultTaskBoardNavigation() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_disableDefaultTaskBoardNavigationKey) ?? false;
  }

  Future<void> setDisableDefaultTaskBoardNavigation({
    required bool value,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_disableDefaultTaskBoardNavigationKey, value);
  }

  Future<Set<String>> getEnabledExperimentalAppIds() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_enabledExperimentalAppsKey) ?? const [])
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  Future<void> setExperimentalAppEnabled({
    required String moduleId,
    required bool enabled,
  }) async {
    final normalizedModuleId = moduleId.trim();
    if (normalizedModuleId.isEmpty) {
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final moduleIds =
        (prefs.getStringList(_enabledExperimentalAppsKey) ?? const [])
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty)
            .toSet();
    if (enabled) {
      moduleIds.add(normalizedModuleId);
    } else {
      moduleIds.remove(normalizedModuleId);
    }
    final sortedModuleIds = moduleIds.toList(growable: false)..sort();
    await prefs.setStringList(_enabledExperimentalAppsKey, sortedModuleIds);
  }

  Future<String?> getPersonalDefaultTaskBoardId(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_personalDefaultTaskBoardIdPrefix-$wsId');
  }

  Future<void> setPersonalDefaultTaskBoardId(
    String wsId,
    String? boardId,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_personalDefaultTaskBoardIdPrefix-$wsId';
    final normalizedBoardId = boardId?.trim();
    if (normalizedBoardId == null || normalizedBoardId.isEmpty) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, normalizedBoardId);
  }

  Future<bool> getFinanceAmountsVisible() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_financeAmountsVisibleKey) ?? false;
  }

  Future<void> setFinanceAmountsVisible({required bool value}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_financeAmountsVisibleKey, value);
  }

  /// Returns the last visited shell tab route, or `null` if none saved.
  Future<String?> getLastTabRoute() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastTabRouteKey);
  }

  /// Persists the user's last visited shell tab route.
  Future<void> setLastTabRoute(String route) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastTabRouteKey, route);
  }

  /// Returns the last selected app route, or `null` if none saved.
  Future<String?> getLastAppRoute() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastAppRouteKey);
  }

  /// Persists the user's last selected app route.
  Future<void> setLastAppRoute(String route) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastAppRouteKey, route);
  }

  /// Clears the last selected app route.
  Future<void> clearLastAppRoute() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_lastAppRouteKey);
  }

  Future<String?> getLastIncomeCategory(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_lastIncomeCategoryPrefix-$wsId');
  }

  Future<void> setLastIncomeCategory(String wsId, String categoryId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_lastIncomeCategoryPrefix-$wsId', categoryId);
  }

  Future<String?> getLastInventoryProductOwner(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_lastInventoryProductOwnerPrefix-$wsId');
  }

  Future<void> setLastInventoryProductOwner(String wsId, String ownerId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_lastInventoryProductOwnerPrefix-$wsId', ownerId);
  }

  Future<String?> getLastInventoryProductCategory(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_lastInventoryProductCategoryPrefix-$wsId');
  }

  Future<void> setLastInventoryProductCategory(
    String wsId,
    String categoryId,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_lastInventoryProductCategoryPrefix-$wsId',
      categoryId,
    );
  }

  Future<String?> getLastInventoryProductFinanceCategory(String wsId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_lastInventoryProductFinanceCategoryPrefix-$wsId');
  }

  Future<void> setLastInventoryProductFinanceCategory(
    String wsId,
    String? financeCategoryId,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_lastInventoryProductFinanceCategoryPrefix-$wsId';
    if (financeCategoryId == null) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, financeCategoryId);
  }

  /// Returns the persisted locale code (e.g. 'en', 'vi'), or `null` for system
  /// default.
  Future<String?> getLocale() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_localeKey);
  }

  /// Persists the user's locale choice. Pass `null` to revert to system
  /// default.
  Future<void> setLocale(String? locale) async {
    final prefs = await SharedPreferences.getInstance();
    if (locale == null) {
      await prefs.remove(_localeKey);
    } else {
      await prefs.setString(_localeKey, locale);
    }
  }

  Future<bool> hasSeenOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_hasSeenOnboardingKey) ?? false;
  }

  Future<String?> getDismissedRecommendedVersion(String platform) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('$_dismissedRecommendedVersionPrefix-$platform');
  }

  Future<void> setDismissedRecommendedVersion(
    String platform,
    String version,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_dismissedRecommendedVersionPrefix-$platform',
      version,
    );
  }

  Future<bool> hasPromptedPushPermission(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('$_pushPermissionPromptedPrefix-$userId') ?? false;
  }

  Future<void> setHasPromptedPushPermission(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('$_pushPermissionPromptedPrefix-$userId', true);
  }
}
