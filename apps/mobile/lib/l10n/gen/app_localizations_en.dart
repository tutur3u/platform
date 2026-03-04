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
  String get authTagline => 'Your AI productivity companion';

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
  String get authLogOut => 'Log out';

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
  String get navApps => 'Apps';

  @override
  String get navAssistant => 'Assistant';

  @override
  String get appsHubSearchHint => 'Search apps';

  @override
  String get appsHubQuickAccess => 'Quick access';

  @override
  String get appsHubAllApps => 'All apps';

  @override
  String get appsHubEmpty => 'No apps found';

  @override
  String get assistantComingSoon => 'Coming Soon';

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
  String get financeCreateWallet => 'Create wallet';

  @override
  String get financeEditWallet => 'Edit wallet';

  @override
  String get financeDeleteWallet => 'Delete wallet';

  @override
  String get financeDeleteWalletConfirm => 'Delete this wallet?';

  @override
  String get financeWalletName => 'Wallet name';

  @override
  String get financeWalletNameRequired => 'Wallet name is required';

  @override
  String get financeWalletDescriptionTooLong => 'Description must be 500 characters or fewer';

  @override
  String get financeWalletTypeStandard => 'Standard';

  @override
  String get financeWalletTypeCredit => 'Credit';

  @override
  String get financeWalletCurrency => 'Currency';

  @override
  String get financeWalletSelectCurrency => 'Select currency';

  @override
  String get financeWalletSearchCurrency => 'Search currencies';

  @override
  String get financeWalletCurrencyRequired => 'Enter a valid 3-letter currency code';

  @override
  String get financeWalletIconOrImage => 'Icon or image';

  @override
  String get financeWalletNoVisual => 'No visual selected';

  @override
  String get financeWalletPickImage => 'Pick image';

  @override
  String get financeWalletClearVisual => 'Clear visual';

  @override
  String get financeWalletCreditDetails => 'Credit details';

  @override
  String get financeWalletCreditLimit => 'Credit limit';

  @override
  String get financeWalletCreditLimitRequired => 'Credit limit must be greater than 0';

  @override
  String get financeWalletStatementDate => 'Statement date';

  @override
  String get financeWalletPaymentDate => 'Payment date';

  @override
  String get financeWalletDateRequired => 'Enter a date between 1 and 31';

  @override
  String get financeWalletBankTab => 'Bank';

  @override
  String get financeWalletMobileTab => 'Mobile';

  @override
  String get financeWalletSearchImage => 'Search images';

  @override
  String financeWalletImageCount(int count) {
    return '$count available';
  }

  @override
  String get financeWalletClearImage => 'Clear image';

  @override
  String get financeNoTransactions => 'No transactions yet';

  @override
  String get financeNoCategories => 'No categories yet';

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
  String get financeTransactionDetails => 'Transaction details';

  @override
  String get financeEditTransaction => 'Edit transaction';

  @override
  String get financeDeleteTransaction => 'Delete transaction';

  @override
  String get financeDeleteTransactionConfirm => 'Delete this transaction?';

  @override
  String get financeTransactionUpdated => 'Transaction updated';

  @override
  String get financeTransactionDeleted => 'Transaction deleted';

  @override
  String get financeAmount => 'Amount';

  @override
  String get financeDescription => 'Description';

  @override
  String get financeTakenAt => 'Taken at';

  @override
  String get financeCategory => 'Category';

  @override
  String get financeWallet => 'Wallet';

  @override
  String get financeInvalidAmount => 'Enter a valid amount';

  @override
  String get financeReportOptIn => 'Include in reports';

  @override
  String get financeConfidentialAmount => 'Confidential amount';

  @override
  String get financeConfidentialDescription => 'Confidential description';

  @override
  String get financeConfidentialCategory => 'Confidential category';

  @override
  String get financeCreateCategory => 'Create category';

  @override
  String get financeEditCategory => 'Edit category';

  @override
  String get financeDeleteCategory => 'Delete category';

  @override
  String get financeDeleteCategoryConfirm => 'Delete this category?';

  @override
  String get financeCategoryNameRequired => 'Category name is required';

  @override
  String get financeType => 'Type';

  @override
  String get financeIcon => 'Icon';

  @override
  String get financeSelectIcon => 'Select icon';

  @override
  String get financeSearchIcons => 'Search icons';

  @override
  String get financeNoIconsFound => 'No icons found';

  @override
  String get financePreview => 'Preview';

  @override
  String get financeNoColor => 'No color';

  @override
  String get financePickColor => 'Pick color';

  @override
  String get financeInvalidColor => 'Enter a valid hex color';

  @override
  String get financeRandomizeColor => 'Randomize';

  @override
  String get financeToday => 'Today';

  @override
  String get financeYesterday => 'Yesterday';

  @override
  String get financeNet => 'Net';

  @override
  String get financeTransfer => 'Transfer';

  @override
  String get financeTransactionCountShort => 'tx';

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
  String get timerHistoryNoSessionsForPeriod => 'No sessions for this period';

  @override
  String get timerHistoryOverview => 'Period overview';

  @override
  String get timerHistoryTotalTime => 'Total time';

  @override
  String get timerHistoryLoadMore => 'Load more';

  @override
  String get timerHistoryEndOfList => 'You reached the end of the list';

  @override
  String get timerToday => 'Today';

  @override
  String get timerThisWeek => 'This week';

  @override
  String get timerThisMonth => 'This month';

  @override
  String get timerStreak => 'Streak';

  @override
  String get timerStatsTitle => 'Stats';

  @override
  String get timerStatsPersonal => 'Personal';

  @override
  String get timerStatsWorkspace => 'Workspace';

  @override
  String get timerActivityHeatmap => 'Activity';

  @override
  String get timerViewSessionDetails => 'Session details';

  @override
  String get timerEditSession => 'Edit session';

  @override
  String get timerSessionUpdated => 'Session updated';

  @override
  String get timerSessionDeleted => 'Session deleted';

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
  String get timerInvalidDuration => 'Invalid duration';

  @override
  String get timerUnknownDate => 'Unknown date';

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
  String get timerRequestResubmit => 'Resubmit request';

  @override
  String get timerRequestEdit => 'Edit';

  @override
  String get timerRequestEditRequest => 'Edit request';

  @override
  String get timerRequestDescription => 'Description';

  @override
  String get timerRequestDescriptionOptional => 'Description (optional)';

  @override
  String get timerRequestComments => 'Comments';

  @override
  String get timerRequestNoComments => 'No comments yet';

  @override
  String get timerRequestAddComment => 'Add a comment...';

  @override
  String get timerRequestPostComment => 'Post';

  @override
  String get timerRequestCancelEditComment => 'Cancel';

  @override
  String get timerRequestDeleteComment => 'Delete comment';

  @override
  String get timerRequestDeleteCommentConfirm => 'Delete this comment?';

  @override
  String get timerRequestActivity => 'Activity';

  @override
  String get timerRequestNoActivity => 'No activity yet';

  @override
  String get timerRequestActivityCreated => 'created this request';

  @override
  String get timerRequestActivityContentUpdated => 'updated request content';

  @override
  String get timerRequestActivityStatusChanged => 'changed the request status';

  @override
  String get timerRequestActivityCommentAdded => 'added a comment';

  @override
  String get timerRequestActivityCommentUpdated => 'updated a comment';

  @override
  String get timerRequestActivityCommentDeleted => 'deleted a comment';

  @override
  String get timerRequestActivityUpdated => 'updated this request';

  @override
  String get timerRequestActivityFeedbackLabel => 'Feedback';

  @override
  String get timerRequestActivityTitleLabel => 'Title';

  @override
  String get timerRequestActivityUnknownUser => 'Unknown user';

  @override
  String get timerRequestActivityItemsPerPage => 'Items per page';

  @override
  String timerRequestActivityPageInfo(int current, int total) {
    return 'Page $current of $total';
  }

  @override
  String get timerRequestActivityActionCreated => 'created';

  @override
  String get timerRequestActivityActionStatusChanged => 'changed status';

  @override
  String get timerRequestActivityActionContentUpdated => 'updated content';

  @override
  String get timerRequestActivityActionCommentAdded => 'added comment';

  @override
  String get timerRequestActivityActionCommentUpdated => 'updated comment';

  @override
  String get timerRequestActivityActionCommentDeleted => 'deleted comment';

  @override
  String get timerRequestActivityFieldStartTime => 'Start time';

  @override
  String get timerRequestActivityFieldEndTime => 'End time';

  @override
  String get timerRequestActivityFieldTitle => 'Title';

  @override
  String get timerRequestActivityFieldDescription => 'Description';

  @override
  String get timerRequestAddImage => 'Add image';

  @override
  String timerRequestProofImagesCount(int current, int max) {
    return 'Images: $current/$max';
  }

  @override
  String get timerReasonOptional => 'Reason (optional)';

  @override
  String get timerInfoRequired => 'Info (required)';

  @override
  String get timerSubmitInfo => 'Submit info';

  @override
  String get timerRequestUpdated => 'Request updated';

  @override
  String get timerManagementTitle => 'Manage';

  @override
  String get timerSearchSessions => 'Search sessions...';

  @override
  String get timerDescription => 'Description';

  @override
  String get timerWorkSession => 'Work session';

  @override
  String get timerSubmitForApproval => 'Submit for approval';

  @override
  String get timerRequestSubmittedTitle => 'Request sent';

  @override
  String get timerRequestSubmittedContent => 'Your time entry has been submitted for approval.';

  @override
  String get timerRequestRejectionReason => 'Rejection reason';

  @override
  String get timerRequestNeedsInfoReason => 'Requested Information';

  @override
  String get timerMissedEntrySavedTitle => 'Entry saved';

  @override
  String get timerMissedEntrySavedContent => 'Your missed time entry was added successfully.';

  @override
  String get timerSessionExceeded => 'Session exceeds threshold';

  @override
  String get timerSessionExceededDescription => 'This session is older than your workspace threshold. You can discard it or submit it as a request for approval.';

  @override
  String get timerTimeEditingRestricted => 'Time Editing Restricted';

  @override
  String timerAllEditsRequireApproval(String date) {
    return 'All time edits must be submitted as requests for approval. This session is from $date.';
  }

  @override
  String get timerDiscardSession => 'Discard session';

  @override
  String get timerSubmitAsRequest => 'Submit as request';

  @override
  String get timerThresholdWarningAll => 'All missed entries in this workspace require approval. Add at least one proof image before submitting.';

  @override
  String timerThresholdWarning(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days days',
      one: '1 day',
    );
    return 'Entries older than $_temp0 require approval. Add at least one proof image before submitting.';
  }

  @override
  String get timerProofOfWorkRequired => 'At least one proof image is required.';

  @override
  String get timerRequestsThresholdTitle => 'Request threshold settings';

  @override
  String get timerRequestsThresholdDescription => 'Choose when missed entries should require approval.';

  @override
  String get timerRequestsThresholdNoApproval => 'No approval needed';

  @override
  String get timerRequestsThresholdNoApprovalHint => 'Missed entries can be added directly without sending a request.';

  @override
  String get timerRequestsThresholdLabel => 'Threshold (days)';

  @override
  String get timerRequestsThresholdHelp => 'Entries older than this number of days must be submitted for approval.';

  @override
  String get timerRequestsThresholdInvalid => 'Enter a whole number greater than or equal to 0.';

  @override
  String get timerRequestsThresholdUpdated => 'Request threshold updated.';

  @override
  String get timerAutoStartBreaks => 'Auto-start breaks';

  @override
  String get timerAutoStartFocus => 'Auto-start focus';

  @override
  String get commonCancel => 'Cancel';

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
  String get profileStatus => 'Status';

  @override
  String get profileVerification => 'Verification';

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
  String get profileDisplayNameRequired => 'Display name cannot be empty';

  @override
  String get profileFullName => 'Full name';

  @override
  String get profileFullNameHint => 'Your full name';

  @override
  String get profileFullNameRequired => 'Full name cannot be empty';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileInvalidEmail => 'Please enter a valid email address';

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
  String get workspacePersonalSection => 'Personal';

  @override
  String get workspaceTeamSection => 'Team workspaces';

  @override
  String get workspaceCreateTitle => 'Create workspace';

  @override
  String get workspaceCreateNew => 'New';

  @override
  String get workspaceCreateNameHint => 'Workspace name';

  @override
  String get workspaceCreateNameRequired => 'Workspace name is required';

  @override
  String get workspaceCreateSubmit => 'Create workspace';

  @override
  String get workspaceCreateCancel => 'Cancel';

  @override
  String get workspaceCreatePrompt => 'Create your first workspace to get started';

  @override
  String get workspaceCreateLimitReached => 'You have reached the workspace limit';

  @override
  String workspaceCreateLimitInfo(int current, int limit) {
    return '$current of $limit workspaces used';
  }

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
  String get commonSomethingWentWrong => 'Something went wrong';

  @override
  String get selectImageSource => 'Select image source';

  @override
  String get camera => 'Camera';

  @override
  String get gallery => 'Gallery';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonPrevious => 'Previous';

  @override
  String get commonNext => 'Next';

  @override
  String get onboardingSlide1Title => 'Meet Mira';

  @override
  String get onboardingSlide1Subtitle => 'Your AI companion for work and life. Mira connects your tasks, calendar, and finances.';

  @override
  String get onboardingSlide2Title => 'Everything in One App';

  @override
  String get onboardingSlide2Subtitle => 'Tasks, Calendar, and Track - all unified. No more switching between apps.';

  @override
  String get onboardingSlide3Title => 'Intelligence That Grows';

  @override
  String get onboardingSlide3Subtitle => 'Mira remembers your preferences and gets smarter the more you use her.';

  @override
  String get onboardingGetStarted => 'Get Started';
}
