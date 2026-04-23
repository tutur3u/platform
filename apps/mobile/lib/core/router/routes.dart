/// Route path constants for the app.
abstract final class Routes {
  // Auth
  static const login = '/login';
  static const addAccount = '/add-account';
  static const signUp = '/signup';
  static const forgotPassword = '/forgot-password';
  static const mfaVerify = '/mfa-verify';

  // Workspace
  static const workspaceSelect = '/workspace-select';

  // Dashboard (shell)
  static const home = '/';
  static const apps = '/apps';
  static const assistant = '/assistant';
  static const notifications = '/notifications';
  static const notificationsArchive = '/notifications/archive';
  static const profileRoot = '/profile';
  static const profileAccounts = '/profile/accounts';
  static const tasks = '/tasks';
  static const habits = '/habits';
  static const habitsActivity = '/habits/activity';
  static const habitsLibrary = '/habits/library';
  static const taskBoards = '/tasks/boards';
  static const taskBoardDetail = '/tasks/boards/:boardId';
  static const taskEstimates = '/tasks/estimates';
  static const taskPortfolio = '/tasks/portfolio';
  static const taskPortfolioProject = '/tasks/portfolio/projects/:projectId';
  static const calendar = '/calendar';
  static const finance = '/finance';
  static const education = '/education';
  static const inventory = '/inventory';
  static const drive = '/drive';
  static const crm = '/crm';
  static const timer = '/timer';
  static const settings = '/settings';
  static const settingsWorkspace = '/settings/workspace';
  static const settingsWorkspaceSecrets = '/settings/workspace/secrets';
  static const settingsWorkspaceMembers = '/settings/workspace/members';
  static const settingsWorkspaceRoles = '/settings/workspace/roles';
  static const settingsMobileVersions = '/settings/mobile-versions';

  // Detail pages
  static const taskDetail = '/tasks/:taskId';
  static const taskCreate = '/tasks/create';
  static const calendarEventDetail = '/calendar/:eventId';
  static const wallets = '/finance/wallets';
  static const walletDetail = '/finance/wallets/:walletId';
  static const transactions = '/finance/transactions';
  static const transactionDetail = '/finance/transactions/:transactionId';
  static const categories = '/finance/categories';
  static const inventoryProducts = '/inventory/products';
  static const inventoryProductCreate = '/inventory/products/create';
  static const inventoryProductDetail = '/inventory/products/:productId';
  static const inventorySales = '/inventory/sales';
  static const inventoryManage = '/inventory/manage';
  static const inventoryAuditLogs = '/inventory/audit-logs';
  static const inventoryCheckout = '/inventory/checkout';
  static const timerHistory = '/timer/history';
  static const timerStats = '/timer/stats';
  static const timerRequests = '/timer/requests';
  static const timerManagement = '/timer/management';

  static String walletDetailPath(String walletId) =>
      '/finance/wallets/$walletId';

  static String inventoryProductDetailPath(String productId) =>
      '/inventory/products/$productId';

  static String taskPortfolioProjectPath(String projectId) =>
      '/tasks/portfolio/projects/$projectId';

  static String taskBoardDetailPath(String boardId) => '/tasks/boards/$boardId';

  static String timerRequestsPath({
    String? requestId,
    String? status,
  }) {
    final queryParameters = <String, String>{
      if (requestId != null && requestId.isNotEmpty) 'requestId': requestId,
      if (status != null && status.isNotEmpty) 'status': status,
    };

    return Uri(
      path: timerRequests,
      queryParameters: queryParameters.isEmpty ? null : queryParameters,
    ).toString();
  }

  static String normalizeLocation(String value) {
    var normalized = value;
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  static String? miniAppRootForLocation(String location) {
    final normalized = normalizeLocation(location);

    if (normalized == tasks || normalized.startsWith('$tasks/')) {
      return tasks;
    }
    if (normalized == habits || normalized.startsWith('$habits/')) {
      return habits;
    }
    if (normalized == finance || normalized.startsWith('$finance/')) {
      return finance;
    }
    if (normalized == education || normalized.startsWith('$education/')) {
      return education;
    }
    if (normalized == inventory || normalized.startsWith('$inventory/')) {
      return inventory;
    }
    if (normalized == drive || normalized.startsWith('$drive/')) {
      return drive;
    }
    if (normalized == crm || normalized.startsWith('$crm/')) {
      return crm;
    }
    if (normalized == timer || normalized.startsWith('$timer/')) {
      return timer;
    }
    if (normalized == calendar || normalized.startsWith('$calendar/')) {
      return calendar;
    }
    if (normalized == notifications ||
        normalized.startsWith('$notifications/')) {
      return notifications;
    }

    if (isSettingsHubLocation(normalized)) {
      if (normalized == profileRoot || normalized.startsWith('$profileRoot/')) {
        return profileRoot;
      }
      if (normalized == settingsWorkspace ||
          normalized.startsWith('$settingsWorkspace/')) {
        return settingsWorkspace;
      }
      return settings;
    }

    return null;
  }

  /// Routes that share the settings hub bottom navigation (app / workspace / you).
  static bool isSettingsHubLocation(String location) {
    final normalized = normalizeLocation(location);
    return normalized == settings ||
        normalized.startsWith('$settings/') ||
        normalized == profileRoot ||
        normalized.startsWith('$profileRoot/');
  }

  static bool isMiniAppChildLocation(String location) {
    final normalized = normalizeLocation(location);
    final root = miniAppRootForLocation(normalized);
    return root != null && normalized != root;
  }

  static bool isMiniAppRootLocation(String location) {
    final normalized = normalizeLocation(location);
    return miniAppRootForLocation(normalized) == normalized;
  }
}
