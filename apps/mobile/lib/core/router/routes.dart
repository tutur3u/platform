/// Route path constants for the app.
abstract final class Routes {
  // Auth
  static const login = '/login';
  static const signUp = '/signup';
  static const forgotPassword = '/forgot-password';
  static const mfaVerify = '/mfa-verify';

  // Workspace
  static const workspaceSelect = '/workspace-select';

  // Dashboard (shell)
  static const home = '/';
  static const apps = '/apps';
  static const profileRoot = '/profile';
  static const tasks = '/tasks';
  static const calendar = '/calendar';
  static const finance = '/finance';
  static const timer = '/timer';
  static const settings = '/settings';

  // Detail pages
  static const taskDetail = '/tasks/:taskId';
  static const taskCreate = '/tasks/create';
  static const calendarEventDetail = '/calendar/:eventId';
  static const wallets = '/finance/wallets';
  static const walletDetail = '/finance/wallets/:walletId';
  static const transactions = '/finance/transactions';
  static const transactionDetail = '/finance/transactions/:transactionId';
  static const categories = '/finance/categories';
  static const timerHistory = '/timer/history';
  static const timerRequests = '/timer/requests';
  static const timerManagement = '/timer/management';
  static const profile = '/settings/profile';
}
