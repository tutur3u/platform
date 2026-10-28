/// Route path constants for the app.
abstract final class Routes {
  // Auth
  static const login = '/login';
  static const addAccount = '/add-account';
  static const signUp = '/signup';
  static const forgotPassword = '/forgot-password';
  static const mfaVerify = '/mfa-verify';
  static const qrLogin = '/qr-login';

  // Workspace
  static const workspaceSelect = '/workspace-select';

  // Dashboard (shell)
  static const home = '/';
  static const apps = '/apps';
  static const assistant = '/assistant';
  static const chat = '/chat';
  static const mail = '/mail';
  static const notifications = '/notifications';
  static const notificationsArchive = '/notifications/archive';
  static const profileRoot = '/profile';
  static const profileEdit = '/profile/edit';
  static const profileAccounts = '/profile/accounts';
  static const tasks = '/tasks';
  static const habits = '/habits';
  static const habitsActivity = '/habits/activity';
  static const habitsLibrary = '/habits/library';
  static const taskBoards = '/tasks/boards';
  static const taskBoardDetail = '/tasks/boards/:boardId';
  static const taskPlanning = '/tasks/planning';
  static const taskEstimates = '/tasks/estimates';
  static const taskPortfolio = '/tasks/portfolio';
  static const taskPortfolioProject = '/tasks/portfolio/projects/:projectId';
  static const calendar = '/calendar';
  static const finance = '/finance';
  static const education = '/education';
  static const inventory = '/inventory';
  static const drive = '/drive';
  static const documents = '/documents';
  static const notes = '/notes';
  static String noteDetailPath(String noteId) =>
      Uri(path: notes, queryParameters: {'noteId': noteId}).toString();
  static const cms = '/cms';
  static const crm = '/crm';
  static const meet = '/meet';
  static const mastermind = '/mastermind';
  static const mastermindInbox = '/mastermind/inbox';
  static const mastermindWork = '/mastermind/work';
  static const mastermindShip = '/mastermind/ship';
  static const mastermindInsights = '/mastermind/insights';
  static const mastermindWorkLane = '/mastermind/work/lane/:laneId';
  static const mastermindInboxItem = '/mastermind/inbox/item/:itemId';
  static const mastermindInboxDecision =
      '/mastermind/inbox/decision/:decisionId';
  static const mastermindInsightsTable =
      '/mastermind/insights/:section/table/:chartId';

  /// Section and chart ids are route parameters only: they pick a chart out of
  /// the current snapshot and never appear in an external deep link.
  static String mastermindInsightsTablePath(String section, String chartId) =>
      '$mastermindInsights/${Uri.encodeComponent(section)}/table/'
      '${Uri.encodeComponent(chartId)}';

  /// An item detail is pushed over the Inbox or Home, so Back pops to whichever
  /// opened it rather than falling back to the Inbox.
  static bool isMastermindInboxItemLocation(String location) =>
      normalizeLocation(location).startsWith('$mastermindInbox/item/');

  /// Decision ids are opaque snapshot ids (`d_<12hex>`). Like item ids they are
  /// route parameters only and never appear in an external deep link.
  static String mastermindInboxDecisionPath(String decisionId) =>
      '$mastermindInbox/decision/${Uri.encodeComponent(decisionId)}';

  /// A decision detail is pushed over the Decisions segment or Home, so Back
  /// pops to whichever opened it, segment and filters intact.
  static bool isMastermindInboxDecisionLocation(String location) =>
      normalizeLocation(location).startsWith('$mastermindInbox/decision/');

  /// A chart table is pushed over Insights, so Back pops to where it was.
  static bool isMastermindInsightsTableLocation(String location) {
    final normalized = normalizeLocation(location);
    return normalized.startsWith('$mastermindInsights/') &&
        normalized.contains('/table/');
  }

  /// Item ids are opaque snapshot ids. They are route parameters only and never
  /// appear in an external deep link.
  static String mastermindInboxItemPath(String itemId) =>
      '$mastermindInbox/item/${Uri.encodeComponent(itemId)}';

  /// Lane ids are opaque snapshot ids. Like item ids they are route parameters
  /// only and never appear in an external deep link.
  static String mastermindWorkLanePath(String laneId) =>
      '$mastermindWork/lane/${Uri.encodeComponent(laneId)}';

  /// A lane detail is pushed over the filtered Work list, so Back pops to it
  /// rather than going to the unfiltered tab root.
  static bool isMastermindLaneLocation(String location) =>
      normalizeLocation(location).startsWith('$mastermindWork/lane/');
  static const timer = '/timer';
  static const settings = '/settings';
  static const settingsProfile = '/settings/profile';
  static const settingsAccounts = '/settings/accounts';
  static const settingsOffline = '/settings/offline';
  static const settingsOfflineModule = '/settings/offline/:moduleId';
  static const settingsInternalAccounts = '/settings/infrastructure/accounts';
  static String settingsOfflineModulePath(String moduleId) =>
      '$settingsOffline/${Uri.encodeComponent(moduleId)}';

  /// Central per-app settings. Each app's gear deep-links here.
  static const settingsApps = '/settings/apps';
  static const settingsAppDetail = '/settings/apps/:appId';
  static String settingsAppPath(String appId, {String? focus}) => Uri(
    path: '$settingsApps/$appId',
    queryParameters: focus == null ? null : {'focus': focus},
  ).toString();

  /// Apps whose settings render as a routed Settings sub-screen.
  static const centralAppSettingsIds = {
    'tasks',
    'calendar',
    'finance',
    'timer',
    'assistant',
  };

  /// Central settings location for [appId], or `null` without a sub-screen.
  static String? appSettingsLocation(String? appId) =>
      centralAppSettingsIds.contains(appId) ? settingsAppPath(appId!) : null;

  static const settingsPreferences = '/settings/preferences';
  static const settingsAppearance = '/settings/appearance';
  static const settingsExperiments = '/settings/experiments';
  static const settingsInfrastructure = '/settings/infrastructure';
  static const settingsFeedback = '/settings/feedback';
  static const settingsAbout = '/settings/about';
  static const settingsWhatsNew = '/settings/whats-new';
  static const settingsReminders = '/settings/reminders';
  static const settingsSession = '/settings/session';
  static const settingsAccountSecurity = '/settings/session/devices';
  static const settingsMfaApproval = '/settings/session/approval';
  static const settingsQrLoginScan = '/settings/session/qr-login-scan';
  static const settingsWorkspace = '/settings/workspace';
  static const settingsWorkspaceSecrets = '/settings/workspace/secrets';
  static const settingsWorkspaceMembers = '/settings/workspace/members';
  static const settingsWorkspaceRoles = '/settings/workspace/roles';
  static const settingsMobileVersions = '/settings/mobile-versions';

  // Detail pages
  static const taskDetail = '/tasks/:taskId';
  static const taskCreate = '/tasks/create';
  static const calendarEventDetail = '/calendar/:eventId';

  static String calendarEventDetailPath(String eventId) =>
      '/calendar/${Uri.encodeComponent(eventId)}';
  static const wallets = '/finance/wallets';
  static const walletDetail = '/finance/wallets/:walletId';
  static const transactions = '/finance/transactions';
  static const transactionDetail = '/finance/transactions/:transactionId';
  static const financeCheckpoints = '/finance/checkpoints';
  static const categories = '/finance/categories';
  static const inventoryProducts = '/inventory/products';
  static const inventoryProductCreate = '/inventory/products/create';
  static const inventoryProductDetail = '/inventory/products/:productId';
  static const inventorySales = '/inventory/sales';
  static const inventoryManage = '/inventory/manage';
  static const inventoryCatalog = '/inventory/manage/:catalog';
  static const inventorySalesPeriods = '/inventory/sales-periods';
  static String inventoryCatalogPath(String catalog) =>
      '/inventory/manage/$catalog';
  static const inventoryAuditLogs = '/inventory/audit-logs';
  static const inventoryCheckout = '/inventory/checkout';
  static const storefronts = '/inventory/storefronts';
  static const storefrontDetail = '/inventory/storefronts/:storefrontId';
  static const documentDetail = '/documents/:documentId';
  static const timerHistory = '/timer/history';
  static const timerStats = '/timer/stats';
  static const timerRequests = '/timer/requests';
  static const timerManagement = '/timer/management';

  static String walletDetailPath(String walletId) =>
      '/finance/wallets/$walletId';

  static String financeCheckpointsPath({String? walletId}) => Uri(
    path: financeCheckpoints,
    queryParameters: walletId == null || walletId.isEmpty
        ? null
        : {'walletId': walletId},
  ).toString();

  static String inventoryProductDetailPath(String productId) =>
      '/inventory/products/$productId';

  static String storefrontDetailPath(String storefrontId) =>
      '/inventory/storefronts/$storefrontId';

  static String taskPortfolioProjectPath(String projectId) =>
      '/tasks/portfolio/projects/$projectId';

  static String taskBoardDetailPath(String boardId) => '/tasks/boards/$boardId';

  static String taskBoardDetailViewPath(String boardId, String view) => Uri(
    path: taskBoardDetailPath(boardId),
    queryParameters: {'view': view},
  ).toString();

  static String documentDetailPath(String documentId) =>
      '/documents/$documentId';

  static String taskBoardTaskDetailPath(String boardId, String taskId) => Uri(
    path: taskBoardDetailPath(boardId),
    queryParameters: {'taskId': taskId},
  ).toString();

  static String timerRequestsPath({String? requestId, String? status}) {
    final queryParameters = <String, String>{
      if (requestId != null && requestId.isNotEmpty) 'requestId': requestId,
      if (status != null && status.isNotEmpty) 'status': status,
    };

    return Uri(
      path: timerRequests,
      queryParameters: queryParameters.isEmpty ? null : queryParameters,
    ).toString();
  }

  static String chatConversationPath(String conversationId) => Uri(
    path: chat,
    queryParameters: {'conversationId': conversationId},
  ).toString();

  static String normalizeLocation(String value) {
    var normalized = value;
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  static String? miniAppRootForLocation(String location) {
    final normalized = normalizeLocation(location);

    if (normalized == mail || normalized.startsWith('$mail/')) return mail;

    if (normalized == tasks || normalized.startsWith('$tasks/')) {
      return tasks;
    }
    if (normalized == habits || normalized.startsWith('$habits/')) {
      return habits;
    }
    if (normalized == finance || normalized.startsWith('$finance/')) {
      return finance;
    }
    if (normalized == chat || normalized.startsWith('$chat/')) {
      return chat;
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
    if (normalized == documents || normalized.startsWith('$documents/')) {
      return documents;
    }
    if (normalized == notes || normalized.startsWith('$notes/')) {
      return notes;
    }
    if (normalized == cms || normalized.startsWith('$cms/')) {
      return cms;
    }
    if (normalized == crm || normalized.startsWith('$crm/')) {
      return crm;
    }
    if (normalized == meet || normalized.startsWith('$meet/')) {
      return meet;
    }
    if (normalized == mastermind || normalized.startsWith('$mastermind/')) {
      return mastermind;
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
      return settings;
    }

    return null;
  }

  /// Settings and legacy Profile locations belong to the Settings family.
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
