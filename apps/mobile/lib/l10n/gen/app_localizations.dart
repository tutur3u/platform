// dart format off
// coverage:ignore-file
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_vi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('vi')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Tuturuuu'**
  String get appTitle;

  /// Text shown in the AppBar of the Counter Page
  ///
  /// In en, this message translates to:
  /// **'Counter'**
  String get counterAppBarTitle;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to continue'**
  String get loginSubtitle;

  /// No description provided for @loginTabOtp.
  ///
  /// In en, this message translates to:
  /// **'OTP'**
  String get loginTabOtp;

  /// No description provided for @loginTabPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get loginTabPassword;

  /// No description provided for @loginSendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get loginSendOtp;

  /// No description provided for @loginVerifyOtp.
  ///
  /// In en, this message translates to:
  /// **'Verify OTP'**
  String get loginVerifyOtp;

  /// No description provided for @loginRetryAfter.
  ///
  /// In en, this message translates to:
  /// **'Retry in {seconds}s'**
  String loginRetryAfter(int seconds);

  /// No description provided for @loginSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get loginSignIn;

  /// No description provided for @loginForgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get loginForgotPassword;

  /// No description provided for @loginSignUpPrompt.
  ///
  /// In en, this message translates to:
  /// **'Don\'t have an account? Sign up'**
  String get loginSignUpPrompt;

  /// No description provided for @emailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get emailLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get passwordLabel;

  /// No description provided for @signUpTitle.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get signUpTitle;

  /// No description provided for @signUpButton.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get signUpButton;

  /// No description provided for @signUpConfirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get signUpConfirmPassword;

  /// No description provided for @signUpPasswordMinLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least 8 characters'**
  String get signUpPasswordMinLength;

  /// No description provided for @signUpPasswordUppercase.
  ///
  /// In en, this message translates to:
  /// **'Password must contain an uppercase letter'**
  String get signUpPasswordUppercase;

  /// No description provided for @signUpPasswordLowercase.
  ///
  /// In en, this message translates to:
  /// **'Password must contain a lowercase letter'**
  String get signUpPasswordLowercase;

  /// No description provided for @signUpPasswordNumber.
  ///
  /// In en, this message translates to:
  /// **'Password must contain a number'**
  String get signUpPasswordNumber;

  /// No description provided for @signUpPasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get signUpPasswordMismatch;

  /// No description provided for @signUpSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Check your email'**
  String get signUpSuccessTitle;

  /// No description provided for @signUpSuccessMessage.
  ///
  /// In en, this message translates to:
  /// **'We sent a confirmation link to your email. Please verify to continue.'**
  String get signUpSuccessMessage;

  /// No description provided for @signUpBackToLogin.
  ///
  /// In en, this message translates to:
  /// **'Back to login'**
  String get signUpBackToLogin;

  /// No description provided for @forgotPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Reset password'**
  String get forgotPasswordTitle;

  /// No description provided for @forgotPasswordDescription.
  ///
  /// In en, this message translates to:
  /// **'Enter your email and we\'ll send you a link to reset your password.'**
  String get forgotPasswordDescription;

  /// No description provided for @forgotPasswordSendReset.
  ///
  /// In en, this message translates to:
  /// **'Send reset link'**
  String get forgotPasswordSendReset;

  /// No description provided for @forgotPasswordSentTitle.
  ///
  /// In en, this message translates to:
  /// **'Email sent'**
  String get forgotPasswordSentTitle;

  /// No description provided for @forgotPasswordSentMessage.
  ///
  /// In en, this message translates to:
  /// **'Check your inbox for the password reset link.'**
  String get forgotPasswordSentMessage;

  /// No description provided for @forgotPasswordBackToLogin.
  ///
  /// In en, this message translates to:
  /// **'Back to login'**
  String get forgotPasswordBackToLogin;

  /// No description provided for @workspaceSelectTitle.
  ///
  /// In en, this message translates to:
  /// **'Select workspace'**
  String get workspaceSelectTitle;

  /// No description provided for @workspaceSelectEmpty.
  ///
  /// In en, this message translates to:
  /// **'No workspaces found'**
  String get workspaceSelectEmpty;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get navTasks;

  /// No description provided for @navCalendar.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get navCalendar;

  /// No description provided for @navFinance.
  ///
  /// In en, this message translates to:
  /// **'Finance'**
  String get navFinance;

  /// No description provided for @navTimer.
  ///
  /// In en, this message translates to:
  /// **'Timer'**
  String get navTimer;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @dashboardGreeting.
  ///
  /// In en, this message translates to:
  /// **'Welcome back!'**
  String get dashboardGreeting;

  /// No description provided for @dashboardQuickActions.
  ///
  /// In en, this message translates to:
  /// **'Quick actions'**
  String get dashboardQuickActions;

  /// No description provided for @tasksTitle.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get tasksTitle;

  /// No description provided for @tasksEmpty.
  ///
  /// In en, this message translates to:
  /// **'No tasks yet'**
  String get tasksEmpty;

  /// No description provided for @tasksCreate.
  ///
  /// In en, this message translates to:
  /// **'Create task'**
  String get tasksCreate;

  /// No description provided for @tasksAllCaughtUp.
  ///
  /// In en, this message translates to:
  /// **'You\'re all caught up!'**
  String get tasksAllCaughtUp;

  /// No description provided for @tasksAllCaughtUpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'No pending tasks right now'**
  String get tasksAllCaughtUpSubtitle;

  /// No description provided for @tasksOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get tasksOverdue;

  /// No description provided for @tasksDueToday.
  ///
  /// In en, this message translates to:
  /// **'Due today'**
  String get tasksDueToday;

  /// No description provided for @tasksUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get tasksUpcoming;

  /// No description provided for @tasksPriorityCritical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get tasksPriorityCritical;

  /// No description provided for @tasksPriorityHigh.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get tasksPriorityHigh;

  /// No description provided for @tasksPriorityNormal.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get tasksPriorityNormal;

  /// No description provided for @tasksPriorityLow.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get tasksPriorityLow;

  /// No description provided for @calendarTitle.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get calendarTitle;

  /// No description provided for @calendarEmpty.
  ///
  /// In en, this message translates to:
  /// **'No events'**
  String get calendarEmpty;

  /// No description provided for @financeTitle.
  ///
  /// In en, this message translates to:
  /// **'Finance'**
  String get financeTitle;

  /// No description provided for @financeWallets.
  ///
  /// In en, this message translates to:
  /// **'Wallets'**
  String get financeWallets;

  /// No description provided for @financeTransactions.
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get financeTransactions;

  /// No description provided for @financeCategories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get financeCategories;

  /// No description provided for @financeRecentTransactions.
  ///
  /// In en, this message translates to:
  /// **'Recent transactions'**
  String get financeRecentTransactions;

  /// No description provided for @financeNoWallets.
  ///
  /// In en, this message translates to:
  /// **'No wallets yet'**
  String get financeNoWallets;

  /// No description provided for @financeNoTransactions.
  ///
  /// In en, this message translates to:
  /// **'No transactions yet'**
  String get financeNoTransactions;

  /// No description provided for @financeIncome.
  ///
  /// In en, this message translates to:
  /// **'Income'**
  String get financeIncome;

  /// No description provided for @financeExpense.
  ///
  /// In en, this message translates to:
  /// **'Expense'**
  String get financeExpense;

  /// No description provided for @financeViewAll.
  ///
  /// In en, this message translates to:
  /// **'View all'**
  String get financeViewAll;

  /// No description provided for @financeSearchTransactions.
  ///
  /// In en, this message translates to:
  /// **'Search transactions'**
  String get financeSearchTransactions;

  /// No description provided for @financeNoSearchResults.
  ///
  /// In en, this message translates to:
  /// **'No matching transactions'**
  String get financeNoSearchResults;

  /// No description provided for @timerTitle.
  ///
  /// In en, this message translates to:
  /// **'Time tracker'**
  String get timerTitle;

  /// No description provided for @timerStart.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get timerStart;

  /// No description provided for @timerStop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get timerStop;

  /// No description provided for @timerHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get timerHistory;

  /// No description provided for @timerRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get timerRunning;

  /// No description provided for @timerPaused.
  ///
  /// In en, this message translates to:
  /// **'Paused'**
  String get timerPaused;

  /// No description provided for @timerStopped.
  ///
  /// In en, this message translates to:
  /// **'Stopped'**
  String get timerStopped;

  /// No description provided for @timerPause.
  ///
  /// In en, this message translates to:
  /// **'Pause'**
  String get timerPause;

  /// No description provided for @timerResume.
  ///
  /// In en, this message translates to:
  /// **'Resume'**
  String get timerResume;

  /// No description provided for @timerSessionTitle.
  ///
  /// In en, this message translates to:
  /// **'Session title'**
  String get timerSessionTitle;

  /// No description provided for @timerCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get timerCategory;

  /// No description provided for @timerNoCategory.
  ///
  /// In en, this message translates to:
  /// **'No category'**
  String get timerNoCategory;

  /// No description provided for @timerAddCategory.
  ///
  /// In en, this message translates to:
  /// **'Add category'**
  String get timerAddCategory;

  /// No description provided for @timerCategoryName.
  ///
  /// In en, this message translates to:
  /// **'Category name'**
  String get timerCategoryName;

  /// No description provided for @timerRecentSessions.
  ///
  /// In en, this message translates to:
  /// **'Recent sessions'**
  String get timerRecentSessions;

  /// No description provided for @timerSeeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get timerSeeAll;

  /// No description provided for @timerNoSessions.
  ///
  /// In en, this message translates to:
  /// **'No sessions yet'**
  String get timerNoSessions;

  /// No description provided for @timerToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get timerToday;

  /// No description provided for @timerThisWeek.
  ///
  /// In en, this message translates to:
  /// **'This week'**
  String get timerThisWeek;

  /// No description provided for @timerThisMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get timerThisMonth;

  /// No description provided for @timerStreak.
  ///
  /// In en, this message translates to:
  /// **'Streak'**
  String get timerStreak;

  /// No description provided for @timerStatsTitle.
  ///
  /// In en, this message translates to:
  /// **'Statistics'**
  String get timerStatsTitle;

  /// No description provided for @timerActivityHeatmap.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get timerActivityHeatmap;

  /// No description provided for @timerEditSession.
  ///
  /// In en, this message translates to:
  /// **'Edit session'**
  String get timerEditSession;

  /// No description provided for @timerDeleteSession.
  ///
  /// In en, this message translates to:
  /// **'Delete session'**
  String get timerDeleteSession;

  /// No description provided for @timerDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this session?'**
  String get timerDeleteConfirm;

  /// No description provided for @timerAddMissedEntry.
  ///
  /// In en, this message translates to:
  /// **'Add missed entry'**
  String get timerAddMissedEntry;

  /// No description provided for @timerStartTime.
  ///
  /// In en, this message translates to:
  /// **'Start time'**
  String get timerStartTime;

  /// No description provided for @timerEndTime.
  ///
  /// In en, this message translates to:
  /// **'End time'**
  String get timerEndTime;

  /// No description provided for @timerDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get timerDuration;

  /// No description provided for @timerSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get timerSave;

  /// No description provided for @timerPomodoro.
  ///
  /// In en, this message translates to:
  /// **'Pomodoro'**
  String get timerPomodoro;

  /// No description provided for @timerPomodoroSettings.
  ///
  /// In en, this message translates to:
  /// **'Pomodoro settings'**
  String get timerPomodoroSettings;

  /// No description provided for @timerFocusTime.
  ///
  /// In en, this message translates to:
  /// **'Focus time'**
  String get timerFocusTime;

  /// No description provided for @timerShortBreak.
  ///
  /// In en, this message translates to:
  /// **'Short break'**
  String get timerShortBreak;

  /// No description provided for @timerLongBreak.
  ///
  /// In en, this message translates to:
  /// **'Long break'**
  String get timerLongBreak;

  /// No description provided for @timerSessionsUntilLong.
  ///
  /// In en, this message translates to:
  /// **'Sessions until long break'**
  String get timerSessionsUntilLong;

  /// No description provided for @timerRequestsTitle.
  ///
  /// In en, this message translates to:
  /// **'Requests'**
  String get timerRequestsTitle;

  /// No description provided for @timerRequestPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get timerRequestPending;

  /// No description provided for @timerRequestApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get timerRequestApproved;

  /// No description provided for @timerRequestRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get timerRequestRejected;

  /// No description provided for @timerRequestNeedsInfo.
  ///
  /// In en, this message translates to:
  /// **'Needs info'**
  String get timerRequestNeedsInfo;

  /// No description provided for @timerApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get timerApprove;

  /// No description provided for @timerReject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get timerReject;

  /// No description provided for @timerRequestInfo.
  ///
  /// In en, this message translates to:
  /// **'Request info'**
  String get timerRequestInfo;

  /// No description provided for @timerManagementTitle.
  ///
  /// In en, this message translates to:
  /// **'Management'**
  String get timerManagementTitle;

  /// No description provided for @timerTotalSessions.
  ///
  /// In en, this message translates to:
  /// **'Total sessions'**
  String get timerTotalSessions;

  /// No description provided for @timerActiveUsers.
  ///
  /// In en, this message translates to:
  /// **'Active users'**
  String get timerActiveUsers;

  /// No description provided for @timerDays.
  ///
  /// In en, this message translates to:
  /// **'{count} days'**
  String timerDays(int count);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsProfile;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsLanguageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get settingsLanguageSystem;

  /// No description provided for @settingsLanguageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get settingsLanguageEnglish;

  /// No description provided for @settingsLanguageVietnamese.
  ///
  /// In en, this message translates to:
  /// **'Vietnamese'**
  String get settingsLanguageVietnamese;

  /// No description provided for @settingsTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get settingsTheme;

  /// No description provided for @settingsThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// No description provided for @settingsThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// No description provided for @settingsThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get settingsThemeSystem;

  /// No description provided for @settingsSwitchWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Switch workspace'**
  String get settingsSwitchWorkspace;

  /// No description provided for @settingsSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get settingsSignOut;

  /// No description provided for @settingsSignOutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to sign out?'**
  String get settingsSignOutConfirm;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileAvatar.
  ///
  /// In en, this message translates to:
  /// **'Avatar'**
  String get profileAvatar;

  /// No description provided for @profileAvatarDescription.
  ///
  /// In en, this message translates to:
  /// **'Upload your profile picture'**
  String get profileAvatarDescription;

  /// No description provided for @profileUploadAvatar.
  ///
  /// In en, this message translates to:
  /// **'Upload avatar'**
  String get profileUploadAvatar;

  /// No description provided for @profileChangeAvatar.
  ///
  /// In en, this message translates to:
  /// **'Change avatar'**
  String get profileChangeAvatar;

  /// No description provided for @profileRemoveAvatar.
  ///
  /// In en, this message translates to:
  /// **'Remove avatar'**
  String get profileRemoveAvatar;

  /// No description provided for @profileRemoveConfirm.
  ///
  /// In en, this message translates to:
  /// **'Remove avatar?'**
  String get profileRemoveConfirm;

  /// No description provided for @profileAccountStatus.
  ///
  /// In en, this message translates to:
  /// **'Account status'**
  String get profileAccountStatus;

  /// No description provided for @profileActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get profileActive;

  /// No description provided for @profileVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get profileVerified;

  /// No description provided for @profileMemberSince.
  ///
  /// In en, this message translates to:
  /// **'Member since'**
  String get profileMemberSince;

  /// No description provided for @profileDisplayName.
  ///
  /// In en, this message translates to:
  /// **'Display name'**
  String get profileDisplayName;

  /// No description provided for @profileDisplayNameHint.
  ///
  /// In en, this message translates to:
  /// **'Your display name'**
  String get profileDisplayNameHint;

  /// No description provided for @profileFullName.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get profileFullName;

  /// No description provided for @profileFullNameHint.
  ///
  /// In en, this message translates to:
  /// **'Your full name'**
  String get profileFullNameHint;

  /// No description provided for @profileEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get profileEmail;

  /// No description provided for @profileEmailHint.
  ///
  /// In en, this message translates to:
  /// **'example@tuturuuu.com'**
  String get profileEmailHint;

  /// No description provided for @profileCurrentEmail.
  ///
  /// In en, this message translates to:
  /// **'Current email'**
  String get profileCurrentEmail;

  /// No description provided for @profileNewEmail.
  ///
  /// In en, this message translates to:
  /// **'New email'**
  String get profileNewEmail;

  /// No description provided for @profileEmailUpdateNote.
  ///
  /// In en, this message translates to:
  /// **'Confirmation emails will be sent to both addresses'**
  String get profileEmailUpdateNote;

  /// No description provided for @profileUpdateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get profileUpdateSuccess;

  /// No description provided for @profileUpdateError.
  ///
  /// In en, this message translates to:
  /// **'Failed to update profile'**
  String get profileUpdateError;

  /// No description provided for @profileAvatarUpdateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Avatar updated'**
  String get profileAvatarUpdateSuccess;

  /// No description provided for @profileAvatarUpdateError.
  ///
  /// In en, this message translates to:
  /// **'Failed to update avatar'**
  String get profileAvatarUpdateError;

  /// No description provided for @profileAvatarRemoveSuccess.
  ///
  /// In en, this message translates to:
  /// **'Avatar removed'**
  String get profileAvatarRemoveSuccess;

  /// No description provided for @profileAvatarRemoveError.
  ///
  /// In en, this message translates to:
  /// **'Failed to remove avatar'**
  String get profileAvatarRemoveError;

  /// No description provided for @profileLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading profile...'**
  String get profileLoading;

  /// No description provided for @profileSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get profileSave;

  /// No description provided for @profileCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get profileCancel;

  /// No description provided for @workspacePickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Switch workspace'**
  String get workspacePickerTitle;

  /// No description provided for @workspacePersonalBadge.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get workspacePersonalBadge;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'vi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en': return AppLocalizationsEn();
    case 'vi': return AppLocalizationsVi();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
