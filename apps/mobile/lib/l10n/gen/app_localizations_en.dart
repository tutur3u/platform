// dart format off
// coverage:ignore-file

// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Tuturuuu';
  @override
  String get counterAppBarTitle => 'Counter';

  // Auth - Login
  @override
  String get loginTitle => 'Welcome back';
  @override
  String get loginSubtitle => 'Sign in to continue';
  @override
  String get loginTabOtp => 'OTP';
  @override
  String get loginTabPassword => 'Password';
  @override
  String get loginSendOtp => 'Send OTP';
  @override
  String get loginVerifyOtp => 'Verify OTP';
  @override
  String loginRetryAfter(int seconds) => 'Retry in ${seconds}s';
  @override
  String get loginSignIn => 'Sign in';
  @override
  String get loginForgotPassword => 'Forgot password?';
  @override
  String get loginSignUpPrompt => 'Don\'t have an account? Sign up';
  @override
  String get emailLabel => 'Email';
  @override
  String get passwordLabel => 'Password';

  // Auth - Sign Up
  @override
  String get signUpTitle => 'Create account';
  @override
  String get signUpButton => 'Create account';
  @override
  String get signUpConfirmPassword => 'Confirm password';
  @override
  String get signUpPasswordMinLength => 'Password must be at least 8 characters';
  @override
  String get signUpPasswordUppercase => 'Password must contain an uppercase letter';
  @override
  String get signUpPasswordLowercase => 'Password must contain a lowercase letter';
  @override
  String get signUpPasswordNumber => 'Password must contain a number';
  @override
  String get signUpPasswordMismatch => 'Passwords do not match';
  @override
  String get signUpSuccessTitle => 'Check your email';
  @override
  String get signUpSuccessMessage => 'We sent a confirmation link to your email. Please verify to continue.';
  @override
  String get signUpBackToLogin => 'Back to login';

  // Auth - Forgot Password
  @override
  String get forgotPasswordTitle => 'Reset password';
  @override
  String get forgotPasswordDescription => 'Enter your email and we\'ll send you a link to reset your password.';
  @override
  String get forgotPasswordSendReset => 'Send reset link';
  @override
  String get forgotPasswordSentTitle => 'Email sent';
  @override
  String get forgotPasswordSentMessage => 'Check your inbox for the password reset link.';
  @override
  String get forgotPasswordBackToLogin => 'Back to login';

  // Workspace
  @override
  String get workspaceSelectTitle => 'Select workspace';
  @override
  String get workspaceSelectEmpty => 'No workspaces found';

  // Navigation
  @override
  String get navHome => 'Home';
  @override
  String get navTasks => 'Tasks';
  @override
  String get navCalendar => 'Calendar';
  @override
  String get navFinance => 'Finance';
  @override
  String get navTimer => 'Timer';
  @override
  String get navSettings => 'Settings';

  // Dashboard
  @override
  String get dashboardGreeting => 'Welcome back!';
  @override
  String get dashboardQuickActions => 'Quick actions';

  // Tasks
  @override
  String get tasksTitle => 'Tasks';
  @override
  String get tasksEmpty => 'No tasks yet';
  @override
  String get tasksCreate => 'Create task';

  // Calendar
  @override
  String get calendarTitle => 'Calendar';
  @override
  String get calendarEmpty => 'No events';

  // Finance
  @override
  String get financeTitle => 'Finance';
  @override
  String get financeWallets => 'Wallets';
  @override
  String get financeTransactions => 'Transactions';
  @override
  String get financeCategories => 'Categories';

  // Timer
  @override
  String get timerTitle => 'Time tracker';
  @override
  String get timerStart => 'Start';
  @override
  String get timerStop => 'Stop';
  @override
  String get timerHistory => 'History';

  // Settings
  @override
  String get settingsTitle => 'Settings';
  @override
  String get settingsProfile => 'Profile';
  @override
  String get settingsTheme => 'Theme';
  @override
  String get settingsThemeLight => 'Light';
  @override
  String get settingsThemeDark => 'Dark';
  @override
  String get settingsThemeSystem => 'System';
  @override
  String get settingsSignOut => 'Sign out';
  @override
  String get settingsSignOutConfirm => 'Are you sure you want to sign out?';
}
