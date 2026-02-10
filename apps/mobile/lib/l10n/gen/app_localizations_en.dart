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
  String loginRetryAfter(int seconds) {
    return 'Retry in ${seconds}s';
  }

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

  @override
  String get workspaceSelectTitle => 'Select workspace';

  @override
  String get workspaceSelectEmpty => 'No workspaces found';

  @override
  String get workspaceSelectError => 'Failed to switch workspace';

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

  @override
  String get dashboardGreeting => 'Welcome back!';

  @override
  String get dashboardQuickActions => 'Quick actions';

  @override
  String get tasksTitle => 'Tasks';

  @override
  String get tasksEmpty => 'No tasks yet';

  @override
  String get tasksCreate => 'Create task';

  @override
  String get tasksAllCaughtUp => 'You\'re all caught up!';

  @override
  String get tasksAllCaughtUpSubtitle => 'No pending tasks right now';

  @override
  String get tasksOverdue => 'Overdue';

  @override
  String get tasksDueToday => 'Due today';

  @override
  String get tasksUpcoming => 'Upcoming';

  @override
  String get tasksPriorityCritical => 'Critical';

  @override
  String get tasksPriorityHigh => 'High';

  @override
  String get tasksPriorityNormal => 'Normal';

  @override
  String get tasksPriorityLow => 'Low';

  @override
  String get calendarTitle => 'Calendar';

  @override
  String get calendarEmpty => 'No events';

  @override
  String get calendarToday => 'Today';

  @override
  String get calendarDayView => 'Day';

  @override
  String get calendarWeekView => 'Week';

  @override
  String get calendarMonthView => 'Month';

  @override
  String get calendarAllDay => 'All day';

  @override
  String get calendarNoEvents => 'No events for this day';

  @override
  String get calendarNewEvent => 'New event';

  @override
  String get calendarEditEvent => 'Edit event';

  @override
  String get calendarDeleteEvent => 'Delete event';

  @override
  String get calendarDeleteConfirm => 'Delete this event?';

  @override
  String get calendarEventTitle => 'Title';

  @override
  String get calendarEventTitleHint => 'Add title';

  @override
  String get calendarEventDescription => 'Description';

  @override
  String get calendarEventDescriptionHint => 'Add description';

  @override
  String get calendarEventStartDate => 'Start date';

  @override
  String get calendarEventEndDate => 'End date';

  @override
  String get calendarEventStartTime => 'Start time';

  @override
  String get calendarEventEndTime => 'End time';

  @override
  String get calendarEventAllDay => 'All day';

  @override
  String get calendarEventColor => 'Color';

  @override
  String get calendarEventSave => 'Save';

  @override
  String get calendarEventCreate => 'Create event';

  @override
  String get calendarEventUpdate => 'Update event';

  @override
  String get calendarEventDeleted => 'Event deleted';

  @override
  String get calendarEventCreated => 'Event created';

  @override
  String get calendarEventUpdated => 'Event updated';

  @override
  String get calendarEventCancel => 'Cancel';

  @override
  String get calendarEventDelete => 'Delete';

  @override
  String get calendarThreeDayView => '3 Days';

  @override
  String get calendarAgendaView => 'Agenda';

  @override
  String get calendarAgendaEmpty => 'No upcoming events';

  @override
  String calendarAllDayProgress(int current, int total) {
    return 'Day $current of $total';
  }

  @override
  String get calendarConnectionsTitle => 'Manage Calendar Accounts';

  @override
  String get calendarConnectionsSubtitle => 'Connect Google and Microsoft accounts to sync calendars.';

  @override
  String get calendarConnectionsAccounts => 'Connected accounts';

  @override
  String get calendarConnectionsAddAccount => 'Add account';

  @override
  String get calendarConnectionsEmpty => 'No accounts connected';

  @override
  String get calendarConnectionsDisconnect => 'Disconnect';

  @override
  String calendarConnectionsDisconnectConfirm(String account) {
    return 'Disconnect $account? Associated calendars will be disabled.';
  }

  @override
  String get financeTitle => 'Finance';

  @override
  String get financeWallets => 'Wallets';

  @override
  String get financeTransactions => 'Transactions';

  @override
  String get financeCategories => 'Categories';

  @override
  String get financeRecentTransactions => 'Recent transactions';

  @override
  String get financeNoWallets => 'No wallets yet';

  @override
  String get financeNoTransactions => 'No transactions yet';

  @override
  String get financeIncome => 'Income';

  @override
  String get financeExpense => 'Expense';

  @override
  String get financeViewAll => 'View all';

  @override
  String get financeSearchTransactions => 'Search transactions';

  @override
  String get financeNoSearchResults => 'No matching transactions';

  @override
  String get timerTitle => 'Time tracker';

  @override
  String get timerStart => 'Start';

  @override
  String get timerStop => 'Stop';

  @override
  String get timerHistory => 'History';

  @override
  String get timerRunning => 'Running';

  @override
  String get timerPaused => 'Paused';

  @override
  String get timerStopped => 'Stopped';

  @override
  String get timerPause => 'Pause';

  @override
  String get timerResume => 'Resume';

  @override
  String get timerSessionTitle => 'Session title';

  @override
  String get timerCategory => 'Category';

  @override
  String get timerNoCategory => 'No category';

  @override
  String get timerAddCategory => 'Add category';

  @override
  String get timerCategoryName => 'Category name';

  @override
  String get timerRecentSessions => 'Recent sessions';

  @override
  String get timerSeeAll => 'See all';

  @override
  String get timerNoSessions => 'No sessions yet';

  @override
  String get timerToday => 'Today';

  @override
  String get timerThisWeek => 'This week';

  @override
  String get timerThisMonth => 'This month';

  @override
  String get timerStreak => 'Streak';

  @override
  String get timerStatsTitle => 'Statistics';

  @override
  String get timerActivityHeatmap => 'Activity';

  @override
  String get timerEditSession => 'Edit session';

  @override
  String get timerDeleteSession => 'Delete session';

  @override
  String get timerDeleteConfirm => 'Delete this session?';

  @override
  String get timerAddMissedEntry => 'Add missed entry';

  @override
  String get timerStartTime => 'Start time';

  @override
  String get timerEndTime => 'End time';

  @override
  String get timerDuration => 'Duration';

  @override
  String get timerSave => 'Save';

  @override
  String get timerPomodoro => 'Pomodoro';

  @override
  String get timerPomodoroSettings => 'Pomodoro settings';

  @override
  String get timerFocusTime => 'Focus time';

  @override
  String get timerShortBreak => 'Short break';

  @override
  String get timerLongBreak => 'Long break';

  @override
  String get timerSessionsUntilLong => 'Sessions until long break';

  @override
  String get timerRequestsTitle => 'Requests';

  @override
  String get timerRequestPending => 'Pending';

  @override
  String get timerRequestApproved => 'Approved';

  @override
  String get timerRequestRejected => 'Rejected';

  @override
  String get timerRequestNeedsInfo => 'Needs info';

  @override
  String get timerApprove => 'Approve';

  @override
  String get timerReject => 'Reject';

  @override
  String get timerRequestInfo => 'Request info';

  @override
  String get timerManagementTitle => 'Management';

  @override
  String get timerTotalSessions => 'Total sessions';

  @override
  String get timerActiveUsers => 'Active users';

  @override
  String timerDays(int count) {
    return '$count days';
  }

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsProfile => 'Profile';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsLanguageSystem => 'System default';

  @override
  String get settingsLanguageEnglish => 'English';

  @override
  String get settingsLanguageVietnamese => 'Vietnamese';

  @override
  String get settingsTheme => 'Theme';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeSystem => 'System';

  @override
  String get settingsSwitchWorkspace => 'Switch workspace';

  @override
  String get settingsCalendar => 'Calendar';

  @override
  String get settingsFirstDayOfWeek => 'First day of week';

  @override
  String get settingsFirstDayAuto => 'Auto';

  @override
  String get settingsFirstDaySunday => 'Sunday';

  @override
  String get settingsFirstDayMonday => 'Monday';

  @override
  String get settingsFirstDaySaturday => 'Saturday';

  @override
  String get settingsSignOut => 'Sign out';

  @override
  String get settingsSignOutConfirm => 'Are you sure you want to sign out?';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileAvatar => 'Avatar';

  @override
  String get profileAvatarDescription => 'Upload your profile picture';

  @override
  String get profileUploadAvatar => 'Upload avatar';

  @override
  String get profileChangeAvatar => 'Change avatar';

  @override
  String get profileRemoveAvatar => 'Remove avatar';

  @override
  String get profileRemoveConfirm => 'Remove avatar?';

  @override
  String get profileAccountStatus => 'Account status';

  @override
  String get profileActive => 'Active';

  @override
  String get profileVerified => 'Verified';

  @override
  String get profileMemberSince => 'Member since';

  @override
  String get profileDisplayName => 'Display name';

  @override
  String get profileDisplayNameHint => 'Your display name';

  @override
  String get profileFullName => 'Full name';

  @override
  String get profileFullNameHint => 'Your full name';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileCurrentEmail => 'Current email';

  @override
  String get profileNewEmail => 'New email';

  @override
  String get profileEmailUpdateNote => 'Confirmation emails will be sent to both addresses';

  @override
  String get profileUpdateSuccess => 'Profile updated';

  @override
  String get profileUpdateError => 'Failed to update profile';

  @override
  String get profileAvatarUpdateSuccess => 'Avatar updated';

  @override
  String get profileAvatarUpdateError => 'Failed to update avatar';

  @override
  String get profileAvatarRemoveSuccess => 'Avatar removed';

  @override
  String get profileAvatarRemoveError => 'Failed to remove avatar';

  @override
  String get profileLoading => 'Loading profile...';

  @override
  String get profileSave => 'Save';

  @override
  String get profileCancel => 'Cancel';

  @override
  String get workspacePickerTitle => 'Switch workspace';

  @override
  String get workspacePersonalBadge => 'Personal';

  @override
  String get mfaTitle => 'Two-factor authentication';

  @override
  String get mfaSubtitle => 'Enter the code from your authenticator app';

  @override
  String get mfaVerify => 'Verify';

  @override
  String get mfaInvalidCode => 'Invalid verification code. Please try again.';

  @override
  String get mfaSignOut => 'Sign out';

  @override
  String get captchaError => 'Security check failed. Please try again.';

  @override
  String get commonRetry => 'Retry';
}
