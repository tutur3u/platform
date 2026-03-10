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

  /// No description provided for @authTagline.
  ///
  /// In en, this message translates to:
  /// **'Your AI productivity companion'**
  String get authTagline;

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

  /// No description provided for @authLogOut.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get authLogOut;

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

  /// No description provided for @workspaceSelectError.
  ///
  /// In en, this message translates to:
  /// **'Failed to switch workspace'**
  String get workspaceSelectError;

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

  /// No description provided for @navApps.
  ///
  /// In en, this message translates to:
  /// **'Apps'**
  String get navApps;

  /// No description provided for @navAssistant.
  ///
  /// In en, this message translates to:
  /// **'Assistant'**
  String get navAssistant;

  /// No description provided for @appsHubSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search apps'**
  String get appsHubSearchHint;

  /// No description provided for @appsHubQuickAccess.
  ///
  /// In en, this message translates to:
  /// **'Quick access'**
  String get appsHubQuickAccess;

  /// No description provided for @appsHubAllApps.
  ///
  /// In en, this message translates to:
  /// **'All apps'**
  String get appsHubAllApps;

  /// No description provided for @appsHubEmpty.
  ///
  /// In en, this message translates to:
  /// **'No apps found'**
  String get appsHubEmpty;

  /// No description provided for @assistantComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming Soon'**
  String get assistantComingSoon;

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

  /// No description provided for @taskEstimatesTitle.
  ///
  /// In en, this message translates to:
  /// **'Estimations'**
  String get taskEstimatesTitle;

  /// No description provided for @taskEstimatesDescription.
  ///
  /// In en, this message translates to:
  /// **'Configure estimation methods for your task boards and review their current coverage.'**
  String get taskEstimatesDescription;

  /// No description provided for @taskEstimatesAccessDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Access restricted'**
  String get taskEstimatesAccessDeniedTitle;

  /// No description provided for @taskEstimatesAccessDeniedDescription.
  ///
  /// In en, this message translates to:
  /// **'You need project management permission in this workspace to change task board estimation settings.'**
  String get taskEstimatesAccessDeniedDescription;

  /// No description provided for @taskEstimatesTotalBoards.
  ///
  /// In en, this message translates to:
  /// **'Total boards'**
  String get taskEstimatesTotalBoards;

  /// No description provided for @taskEstimatesConfiguredBoards.
  ///
  /// In en, this message translates to:
  /// **'Configured'**
  String get taskEstimatesConfiguredBoards;

  /// No description provided for @taskEstimatesExtendedRangeBoards.
  ///
  /// In en, this message translates to:
  /// **'Extended range'**
  String get taskEstimatesExtendedRangeBoards;

  /// No description provided for @taskEstimatesDistributionTitle.
  ///
  /// In en, this message translates to:
  /// **'Estimation methods'**
  String get taskEstimatesDistributionTitle;

  /// No description provided for @taskEstimatesBoardConfigTitle.
  ///
  /// In en, this message translates to:
  /// **'Board estimation configuration'**
  String get taskEstimatesBoardConfigTitle;

  /// No description provided for @taskEstimatesNoBoardsTitle.
  ///
  /// In en, this message translates to:
  /// **'No boards found'**
  String get taskEstimatesNoBoardsTitle;

  /// No description provided for @taskEstimatesNoBoardsDescription.
  ///
  /// In en, this message translates to:
  /// **'Create a task board first, then come back here to configure its estimation method.'**
  String get taskEstimatesNoBoardsDescription;

  /// No description provided for @taskEstimatesExtendedBadge.
  ///
  /// In en, this message translates to:
  /// **'Extended'**
  String get taskEstimatesExtendedBadge;

  /// No description provided for @taskEstimatesDialogTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit {boardName}'**
  String taskEstimatesDialogTitle(String boardName);

  /// No description provided for @taskEstimatesDialogEstimationMethod.
  ///
  /// In en, this message translates to:
  /// **'Estimation method'**
  String get taskEstimatesDialogEstimationMethod;

  /// No description provided for @taskEstimatesDialogRangeTitle.
  ///
  /// In en, this message translates to:
  /// **'{label} range'**
  String taskEstimatesDialogRangeTitle(String label);

  /// No description provided for @taskEstimatesDialogEstimationOptions.
  ///
  /// In en, this message translates to:
  /// **'Estimation options'**
  String get taskEstimatesDialogEstimationOptions;

  /// No description provided for @taskEstimatesDialogSelectedConfiguration.
  ///
  /// In en, this message translates to:
  /// **'Selected configuration'**
  String get taskEstimatesDialogSelectedConfiguration;

  /// No description provided for @taskEstimatesDialogSave.
  ///
  /// In en, this message translates to:
  /// **'Update estimation'**
  String get taskEstimatesDialogSave;

  /// No description provided for @taskEstimatesRangeStandard.
  ///
  /// In en, this message translates to:
  /// **'Standard range'**
  String get taskEstimatesRangeStandard;

  /// No description provided for @taskEstimatesRangeExtended.
  ///
  /// In en, this message translates to:
  /// **'Extended range'**
  String get taskEstimatesRangeExtended;

  /// No description provided for @taskEstimatesUnnamedBoard.
  ///
  /// In en, this message translates to:
  /// **'Untitled board'**
  String get taskEstimatesUnnamedBoard;

  /// No description provided for @taskEstimatesAllowZeroEstimates.
  ///
  /// In en, this message translates to:
  /// **'Allow zero estimates'**
  String get taskEstimatesAllowZeroEstimates;

  /// No description provided for @taskEstimatesAllowZeroEstimatesDescription.
  ///
  /// In en, this message translates to:
  /// **'When enabled, tasks can be estimated as 0 and contribute 0 to totals.'**
  String get taskEstimatesAllowZeroEstimatesDescription;

  /// No description provided for @taskEstimatesCountUnestimatedIssues.
  ///
  /// In en, this message translates to:
  /// **'Count unestimated issues'**
  String get taskEstimatesCountUnestimatedIssues;

  /// No description provided for @taskEstimatesCountUnestimatedIssuesDescription.
  ///
  /// In en, this message translates to:
  /// **'When enabled, unestimated tasks contribute 1 estimate unit to totals. When disabled, they contribute 0.'**
  String get taskEstimatesCountUnestimatedIssuesDescription;

  /// No description provided for @taskEstimatesUpdateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Estimation updated successfully.'**
  String get taskEstimatesUpdateSuccess;

  /// No description provided for @taskEstimatesTypeNoneLabel.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get taskEstimatesTypeNoneLabel;

  /// No description provided for @taskEstimatesTypeNoneDescription.
  ///
  /// In en, this message translates to:
  /// **'No estimation is configured for this board.'**
  String get taskEstimatesTypeNoneDescription;

  /// No description provided for @taskEstimatesTypeFibonacciLabel.
  ///
  /// In en, this message translates to:
  /// **'Fibonacci'**
  String get taskEstimatesTypeFibonacciLabel;

  /// No description provided for @taskEstimatesTypeFibonacciStandardZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Fibonacci sequence: 0, 1, 2, 3, 5, 8.'**
  String get taskEstimatesTypeFibonacciStandardZeroEnabled;

  /// No description provided for @taskEstimatesTypeFibonacciStandardZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Fibonacci sequence: 1, 2, 3, 5, 8.'**
  String get taskEstimatesTypeFibonacciStandardZeroDisabled;

  /// No description provided for @taskEstimatesTypeFibonacciExtendedZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Extended Fibonacci sequence: 0, 1, 2, 3, 5, 8, 13, 21.'**
  String get taskEstimatesTypeFibonacciExtendedZeroEnabled;

  /// No description provided for @taskEstimatesTypeFibonacciExtendedZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Extended Fibonacci sequence: 1, 2, 3, 5, 8, 13, 21.'**
  String get taskEstimatesTypeFibonacciExtendedZeroDisabled;

  /// No description provided for @taskEstimatesTypeLinearLabel.
  ///
  /// In en, this message translates to:
  /// **'Linear'**
  String get taskEstimatesTypeLinearLabel;

  /// No description provided for @taskEstimatesTypeLinearStandardZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Linear sequence: 0, 1, 2, 3, 4, 5.'**
  String get taskEstimatesTypeLinearStandardZeroEnabled;

  /// No description provided for @taskEstimatesTypeLinearStandardZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Linear sequence: 1, 2, 3, 4, 5.'**
  String get taskEstimatesTypeLinearStandardZeroDisabled;

  /// No description provided for @taskEstimatesTypeLinearExtendedZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Extended linear sequence: 0, 1, 2, 3, 4, 5, 6, 7.'**
  String get taskEstimatesTypeLinearExtendedZeroEnabled;

  /// No description provided for @taskEstimatesTypeLinearExtendedZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Extended linear sequence: 1, 2, 3, 4, 5, 6, 7.'**
  String get taskEstimatesTypeLinearExtendedZeroDisabled;

  /// No description provided for @taskEstimatesTypeExponentialLabel.
  ///
  /// In en, this message translates to:
  /// **'Exponential'**
  String get taskEstimatesTypeExponentialLabel;

  /// No description provided for @taskEstimatesTypeExponentialStandardZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Exponential sequence: 0, 1, 2, 4, 8, 16.'**
  String get taskEstimatesTypeExponentialStandardZeroEnabled;

  /// No description provided for @taskEstimatesTypeExponentialStandardZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Exponential sequence: 1, 2, 4, 8, 16.'**
  String get taskEstimatesTypeExponentialStandardZeroDisabled;

  /// No description provided for @taskEstimatesTypeExponentialExtendedZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Extended exponential sequence: 0, 1, 2, 4, 8, 16, 32, 64.'**
  String get taskEstimatesTypeExponentialExtendedZeroEnabled;

  /// No description provided for @taskEstimatesTypeExponentialExtendedZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Extended exponential sequence: 1, 2, 4, 8, 16, 32, 64.'**
  String get taskEstimatesTypeExponentialExtendedZeroDisabled;

  /// No description provided for @taskEstimatesTypeTshirtLabel.
  ///
  /// In en, this message translates to:
  /// **'T-shirt'**
  String get taskEstimatesTypeTshirtLabel;

  /// No description provided for @taskEstimatesTypeTshirtStandardZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'T-shirt sizes: -, XS, S, M, L, XL.'**
  String get taskEstimatesTypeTshirtStandardZeroEnabled;

  /// No description provided for @taskEstimatesTypeTshirtStandardZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'T-shirt sizes: XS, S, M, L, XL.'**
  String get taskEstimatesTypeTshirtStandardZeroDisabled;

  /// No description provided for @taskEstimatesTypeTshirtExtendedZeroEnabled.
  ///
  /// In en, this message translates to:
  /// **'Extended T-shirt sizes: -, XS, S, M, L, XL, XXL, XXXL.'**
  String get taskEstimatesTypeTshirtExtendedZeroEnabled;

  /// No description provided for @taskEstimatesTypeTshirtExtendedZeroDisabled.
  ///
  /// In en, this message translates to:
  /// **'Extended T-shirt sizes: XS, S, M, L, XL, XXL, XXXL.'**
  String get taskEstimatesTypeTshirtExtendedZeroDisabled;

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

  /// No description provided for @calendarToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get calendarToday;

  /// No description provided for @calendarDayView.
  ///
  /// In en, this message translates to:
  /// **'Day'**
  String get calendarDayView;

  /// No description provided for @calendarWeekView.
  ///
  /// In en, this message translates to:
  /// **'Week'**
  String get calendarWeekView;

  /// No description provided for @calendarMonthView.
  ///
  /// In en, this message translates to:
  /// **'Month'**
  String get calendarMonthView;

  /// No description provided for @calendarAllDay.
  ///
  /// In en, this message translates to:
  /// **'All day'**
  String get calendarAllDay;

  /// No description provided for @calendarNoEvents.
  ///
  /// In en, this message translates to:
  /// **'No events for this day'**
  String get calendarNoEvents;

  /// No description provided for @calendarNewEvent.
  ///
  /// In en, this message translates to:
  /// **'New event'**
  String get calendarNewEvent;

  /// No description provided for @calendarEditEvent.
  ///
  /// In en, this message translates to:
  /// **'Edit event'**
  String get calendarEditEvent;

  /// No description provided for @calendarDeleteEvent.
  ///
  /// In en, this message translates to:
  /// **'Delete event'**
  String get calendarDeleteEvent;

  /// No description provided for @calendarDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this event?'**
  String get calendarDeleteConfirm;

  /// No description provided for @calendarEventTitle.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get calendarEventTitle;

  /// No description provided for @calendarEventTitleHint.
  ///
  /// In en, this message translates to:
  /// **'Add title'**
  String get calendarEventTitleHint;

  /// No description provided for @calendarEventDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get calendarEventDescription;

  /// No description provided for @calendarEventDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Add description'**
  String get calendarEventDescriptionHint;

  /// No description provided for @calendarEventStartDate.
  ///
  /// In en, this message translates to:
  /// **'Start date'**
  String get calendarEventStartDate;

  /// No description provided for @calendarEventEndDate.
  ///
  /// In en, this message translates to:
  /// **'End date'**
  String get calendarEventEndDate;

  /// No description provided for @calendarEventStartTime.
  ///
  /// In en, this message translates to:
  /// **'Start time'**
  String get calendarEventStartTime;

  /// No description provided for @calendarEventEndTime.
  ///
  /// In en, this message translates to:
  /// **'End time'**
  String get calendarEventEndTime;

  /// No description provided for @calendarEventAllDay.
  ///
  /// In en, this message translates to:
  /// **'All day'**
  String get calendarEventAllDay;

  /// No description provided for @calendarEventColor.
  ///
  /// In en, this message translates to:
  /// **'Color'**
  String get calendarEventColor;

  /// No description provided for @calendarEventSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get calendarEventSave;

  /// No description provided for @calendarEventCreate.
  ///
  /// In en, this message translates to:
  /// **'Create event'**
  String get calendarEventCreate;

  /// No description provided for @calendarEventUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update event'**
  String get calendarEventUpdate;

  /// No description provided for @calendarEventDeleted.
  ///
  /// In en, this message translates to:
  /// **'Event deleted'**
  String get calendarEventDeleted;

  /// No description provided for @calendarEventCreated.
  ///
  /// In en, this message translates to:
  /// **'Event created'**
  String get calendarEventCreated;

  /// No description provided for @calendarEventUpdated.
  ///
  /// In en, this message translates to:
  /// **'Event updated'**
  String get calendarEventUpdated;

  /// No description provided for @calendarEventCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get calendarEventCancel;

  /// No description provided for @calendarEventDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get calendarEventDelete;

  /// No description provided for @calendarThreeDayView.
  ///
  /// In en, this message translates to:
  /// **'3 Days'**
  String get calendarThreeDayView;

  /// No description provided for @calendarAgendaView.
  ///
  /// In en, this message translates to:
  /// **'Agenda'**
  String get calendarAgendaView;

  /// No description provided for @calendarAgendaEmpty.
  ///
  /// In en, this message translates to:
  /// **'No upcoming events'**
  String get calendarAgendaEmpty;

  /// No description provided for @calendarAllDayProgress.
  ///
  /// In en, this message translates to:
  /// **'Day {current} of {total}'**
  String calendarAllDayProgress(int current, int total);

  /// No description provided for @calendarConnectionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Manage Calendar Accounts'**
  String get calendarConnectionsTitle;

  /// No description provided for @calendarConnectionsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Connect Google and Microsoft accounts to sync calendars.'**
  String get calendarConnectionsSubtitle;

  /// No description provided for @calendarConnectionsAccounts.
  ///
  /// In en, this message translates to:
  /// **'Connected accounts'**
  String get calendarConnectionsAccounts;

  /// No description provided for @calendarConnectionsAddAccount.
  ///
  /// In en, this message translates to:
  /// **'Add account'**
  String get calendarConnectionsAddAccount;

  /// No description provided for @calendarConnectionsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No accounts connected'**
  String get calendarConnectionsEmpty;

  /// No description provided for @calendarConnectionsDisconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get calendarConnectionsDisconnect;

  /// No description provided for @calendarConnectionsDisconnectConfirm.
  ///
  /// In en, this message translates to:
  /// **'Disconnect {account}? Associated calendars will be disabled.'**
  String calendarConnectionsDisconnectConfirm(String account);

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

  /// No description provided for @financeCreateWallet.
  ///
  /// In en, this message translates to:
  /// **'Create wallet'**
  String get financeCreateWallet;

  /// No description provided for @financeEditWallet.
  ///
  /// In en, this message translates to:
  /// **'Edit wallet'**
  String get financeEditWallet;

  /// No description provided for @financeDeleteWallet.
  ///
  /// In en, this message translates to:
  /// **'Delete wallet'**
  String get financeDeleteWallet;

  /// No description provided for @financeDeleteWalletConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this wallet?'**
  String get financeDeleteWalletConfirm;

  /// No description provided for @financeWalletName.
  ///
  /// In en, this message translates to:
  /// **'Wallet name'**
  String get financeWalletName;

  /// No description provided for @financeWalletNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Wallet name is required'**
  String get financeWalletNameRequired;

  /// No description provided for @financeWalletDescriptionTooLong.
  ///
  /// In en, this message translates to:
  /// **'Description must be 500 characters or fewer'**
  String get financeWalletDescriptionTooLong;

  /// No description provided for @financeWalletTypeStandard.
  ///
  /// In en, this message translates to:
  /// **'Standard'**
  String get financeWalletTypeStandard;

  /// No description provided for @financeWalletTypeCredit.
  ///
  /// In en, this message translates to:
  /// **'Credit'**
  String get financeWalletTypeCredit;

  /// No description provided for @financeWalletMetadata.
  ///
  /// In en, this message translates to:
  /// **'Wallet metadata'**
  String get financeWalletMetadata;

  /// No description provided for @financeWalletBalance.
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get financeWalletBalance;

  /// No description provided for @financeWalletCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get financeWalletCurrency;

  /// No description provided for @financeWalletSelectCurrency.
  ///
  /// In en, this message translates to:
  /// **'Select currency'**
  String get financeWalletSelectCurrency;

  /// No description provided for @financeWalletSearchCurrency.
  ///
  /// In en, this message translates to:
  /// **'Search currencies'**
  String get financeWalletSearchCurrency;

  /// No description provided for @financeWalletCurrencyRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid 3-letter currency code'**
  String get financeWalletCurrencyRequired;

  /// No description provided for @financeWalletIconOrImage.
  ///
  /// In en, this message translates to:
  /// **'Icon or image'**
  String get financeWalletIconOrImage;

  /// No description provided for @financeWalletNoVisual.
  ///
  /// In en, this message translates to:
  /// **'No visual selected'**
  String get financeWalletNoVisual;

  /// No description provided for @financeWalletPickImage.
  ///
  /// In en, this message translates to:
  /// **'Pick image'**
  String get financeWalletPickImage;

  /// No description provided for @financeWalletClearVisual.
  ///
  /// In en, this message translates to:
  /// **'Clear visual'**
  String get financeWalletClearVisual;

  /// No description provided for @financeWalletCreditDetails.
  ///
  /// In en, this message translates to:
  /// **'Credit details'**
  String get financeWalletCreditDetails;

  /// No description provided for @financeWalletCreditLimit.
  ///
  /// In en, this message translates to:
  /// **'Credit limit'**
  String get financeWalletCreditLimit;

  /// No description provided for @financeWalletCreditLimitRequired.
  ///
  /// In en, this message translates to:
  /// **'Credit limit must be greater than 0'**
  String get financeWalletCreditLimitRequired;

  /// No description provided for @financeWalletStatementDate.
  ///
  /// In en, this message translates to:
  /// **'Statement date'**
  String get financeWalletStatementDate;

  /// No description provided for @financeWalletPaymentDate.
  ///
  /// In en, this message translates to:
  /// **'Payment date'**
  String get financeWalletPaymentDate;

  /// No description provided for @financeWalletDateRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a date between 1 and 31'**
  String get financeWalletDateRequired;

  /// No description provided for @financeWalletBankTab.
  ///
  /// In en, this message translates to:
  /// **'Bank'**
  String get financeWalletBankTab;

  /// No description provided for @financeWalletMobileTab.
  ///
  /// In en, this message translates to:
  /// **'Mobile'**
  String get financeWalletMobileTab;

  /// No description provided for @financeWalletSearchImage.
  ///
  /// In en, this message translates to:
  /// **'Search images'**
  String get financeWalletSearchImage;

  /// No description provided for @financeWalletImageCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No images} one{1 available} other{{count} available}}'**
  String financeWalletImageCount(int count);

  /// No description provided for @financeWalletClearImage.
  ///
  /// In en, this message translates to:
  /// **'Clear image'**
  String get financeWalletClearImage;

  /// No description provided for @financeNoTransactions.
  ///
  /// In en, this message translates to:
  /// **'No transactions yet'**
  String get financeNoTransactions;

  /// No description provided for @financeNoCategories.
  ///
  /// In en, this message translates to:
  /// **'No categories yet'**
  String get financeNoCategories;

  /// No description provided for @financeTags.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get financeTags;

  /// No description provided for @financeNoTags.
  ///
  /// In en, this message translates to:
  /// **'No tags yet'**
  String get financeNoTags;

  /// No description provided for @financeCreateTag.
  ///
  /// In en, this message translates to:
  /// **'Create tag'**
  String get financeCreateTag;

  /// No description provided for @financeEditTag.
  ///
  /// In en, this message translates to:
  /// **'Edit tag'**
  String get financeEditTag;

  /// No description provided for @financeDeleteTag.
  ///
  /// In en, this message translates to:
  /// **'Delete tag'**
  String get financeDeleteTag;

  /// No description provided for @financeDeleteTagConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this tag?'**
  String get financeDeleteTagConfirm;

  /// No description provided for @financeTagName.
  ///
  /// In en, this message translates to:
  /// **'Tag name'**
  String get financeTagName;

  /// No description provided for @financeTagNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Tag name is required'**
  String get financeTagNameRequired;

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

  /// No description provided for @financeTransactionDetails.
  ///
  /// In en, this message translates to:
  /// **'Transaction details'**
  String get financeTransactionDetails;

  /// No description provided for @financeCreateTransaction.
  ///
  /// In en, this message translates to:
  /// **'Create transaction'**
  String get financeCreateTransaction;

  /// No description provided for @financeEditTransaction.
  ///
  /// In en, this message translates to:
  /// **'Edit transaction'**
  String get financeEditTransaction;

  /// No description provided for @financeDeleteTransaction.
  ///
  /// In en, this message translates to:
  /// **'Delete transaction'**
  String get financeDeleteTransaction;

  /// No description provided for @financeDeleteTransactionConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this transaction?'**
  String get financeDeleteTransactionConfirm;

  /// No description provided for @financeTransactionCreated.
  ///
  /// In en, this message translates to:
  /// **'Transaction created'**
  String get financeTransactionCreated;

  /// No description provided for @financeTransactionUpdated.
  ///
  /// In en, this message translates to:
  /// **'Transaction updated'**
  String get financeTransactionUpdated;

  /// No description provided for @financeTransactionDeleted.
  ///
  /// In en, this message translates to:
  /// **'Transaction deleted'**
  String get financeTransactionDeleted;

  /// No description provided for @financeAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get financeAmount;

  /// No description provided for @financeDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get financeDescription;

  /// No description provided for @financeTakenAt.
  ///
  /// In en, this message translates to:
  /// **'Taken at'**
  String get financeTakenAt;

  /// No description provided for @financeCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get financeCategory;

  /// No description provided for @financeWallet.
  ///
  /// In en, this message translates to:
  /// **'Wallet'**
  String get financeWallet;

  /// No description provided for @financeDestinationWallet.
  ///
  /// In en, this message translates to:
  /// **'Destination wallet'**
  String get financeDestinationWallet;

  /// No description provided for @financeSelectDestinationWallet.
  ///
  /// In en, this message translates to:
  /// **'Select destination wallet'**
  String get financeSelectDestinationWallet;

  /// No description provided for @financeTransferMode.
  ///
  /// In en, this message translates to:
  /// **'Transfer mode'**
  String get financeTransferMode;

  /// No description provided for @financeDestinationAmountOptional.
  ///
  /// In en, this message translates to:
  /// **'Destination amount'**
  String get financeDestinationAmountOptional;

  /// No description provided for @financeSelectWalletAndCategoryFirst.
  ///
  /// In en, this message translates to:
  /// **'Choose a wallet and category first'**
  String get financeSelectWalletAndCategoryFirst;

  /// No description provided for @financeSelectWalletAndDestinationFirst.
  ///
  /// In en, this message translates to:
  /// **'Choose source and destination wallets first'**
  String get financeSelectWalletAndDestinationFirst;

  /// No description provided for @financeWalletsMustBeDifferent.
  ///
  /// In en, this message translates to:
  /// **'Source and destination wallets must be different'**
  String get financeWalletsMustBeDifferent;

  /// No description provided for @financeInvalidAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid amount'**
  String get financeInvalidAmount;

  /// No description provided for @financeInvalidDestinationAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid destination amount'**
  String get financeInvalidDestinationAmount;

  /// No description provided for @financeReportOptIn.
  ///
  /// In en, this message translates to:
  /// **'Include in reports'**
  String get financeReportOptIn;

  /// No description provided for @financeConfidentialAmount.
  ///
  /// In en, this message translates to:
  /// **'Confidential amount'**
  String get financeConfidentialAmount;

  /// No description provided for @financeConfidentialDescription.
  ///
  /// In en, this message translates to:
  /// **'Confidential description'**
  String get financeConfidentialDescription;

  /// No description provided for @financeConfidentialCategory.
  ///
  /// In en, this message translates to:
  /// **'Confidential category'**
  String get financeConfidentialCategory;

  /// No description provided for @financeStatisticsSummary.
  ///
  /// In en, this message translates to:
  /// **'Statistics summary'**
  String get financeStatisticsSummary;

  /// No description provided for @financeTotalTransactions.
  ///
  /// In en, this message translates to:
  /// **'Total transactions'**
  String get financeTotalTransactions;

  /// No description provided for @financeWalletNotFound.
  ///
  /// In en, this message translates to:
  /// **'Wallet not found'**
  String get financeWalletNotFound;

  /// No description provided for @financeCreateCategory.
  ///
  /// In en, this message translates to:
  /// **'Create category'**
  String get financeCreateCategory;

  /// No description provided for @financeEditCategory.
  ///
  /// In en, this message translates to:
  /// **'Edit category'**
  String get financeEditCategory;

  /// No description provided for @financeDeleteCategory.
  ///
  /// In en, this message translates to:
  /// **'Delete category'**
  String get financeDeleteCategory;

  /// No description provided for @financeDeleteCategoryConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this category?'**
  String get financeDeleteCategoryConfirm;

  /// No description provided for @financeCategoryNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Category name is required'**
  String get financeCategoryNameRequired;

  /// No description provided for @financeType.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get financeType;

  /// No description provided for @financeIcon.
  ///
  /// In en, this message translates to:
  /// **'Icon'**
  String get financeIcon;

  /// No description provided for @financeSelectIcon.
  ///
  /// In en, this message translates to:
  /// **'Select icon'**
  String get financeSelectIcon;

  /// No description provided for @financeSearchIcons.
  ///
  /// In en, this message translates to:
  /// **'Search icons'**
  String get financeSearchIcons;

  /// No description provided for @financeNoIconsFound.
  ///
  /// In en, this message translates to:
  /// **'No icons found'**
  String get financeNoIconsFound;

  /// No description provided for @financePreview.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get financePreview;

  /// No description provided for @financeNoColor.
  ///
  /// In en, this message translates to:
  /// **'No color'**
  String get financeNoColor;

  /// No description provided for @financePickColor.
  ///
  /// In en, this message translates to:
  /// **'Pick color'**
  String get financePickColor;

  /// No description provided for @financeInvalidColor.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid hex color'**
  String get financeInvalidColor;

  /// No description provided for @financeRandomizeColor.
  ///
  /// In en, this message translates to:
  /// **'Randomize'**
  String get financeRandomizeColor;

  /// No description provided for @financeToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get financeToday;

  /// No description provided for @financeYesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get financeYesterday;

  /// No description provided for @financeNet.
  ///
  /// In en, this message translates to:
  /// **'Net'**
  String get financeNet;

  /// No description provided for @financeTransfer.
  ///
  /// In en, this message translates to:
  /// **'Transfer'**
  String get financeTransfer;

  /// No description provided for @financeTransactionCountShort.
  ///
  /// In en, this message translates to:
  /// **'tx'**
  String get financeTransactionCountShort;

  /// No description provided for @financeExchangeRate.
  ///
  /// In en, this message translates to:
  /// **'Exchange rate'**
  String get financeExchangeRate;

  /// No description provided for @financeDestinationAmountAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get financeDestinationAmountAuto;

  /// No description provided for @financeDestinationAmountOverride.
  ///
  /// In en, this message translates to:
  /// **'Manual'**
  String get financeDestinationAmountOverride;

  /// No description provided for @financeDestinationAmountAutoHint.
  ///
  /// In en, this message translates to:
  /// **'Auto-filled from live exchange rate'**
  String get financeDestinationAmountAutoHint;

  /// No description provided for @financeDestinationAmountOverrideHint.
  ///
  /// In en, this message translates to:
  /// **'Using custom amount — tap to switch to auto'**
  String get financeDestinationAmountOverrideHint;

  /// No description provided for @financeInvertRate.
  ///
  /// In en, this message translates to:
  /// **'Invert rate'**
  String get financeInvertRate;

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

  /// No description provided for @timerHistoryNoSessionsForPeriod.
  ///
  /// In en, this message translates to:
  /// **'No sessions for this period'**
  String get timerHistoryNoSessionsForPeriod;

  /// No description provided for @timerHistoryOverview.
  ///
  /// In en, this message translates to:
  /// **'Period overview'**
  String get timerHistoryOverview;

  /// No description provided for @timerHistoryTotalTime.
  ///
  /// In en, this message translates to:
  /// **'Total time'**
  String get timerHistoryTotalTime;

  /// No description provided for @timerHistoryLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get timerHistoryLoadMore;

  /// No description provided for @timerHistoryEndOfList.
  ///
  /// In en, this message translates to:
  /// **'You reached the end of the list'**
  String get timerHistoryEndOfList;

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
  /// **'Stats'**
  String get timerStatsTitle;

  /// No description provided for @timerStatsPersonal.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get timerStatsPersonal;

  /// No description provided for @timerStatsWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Workspace'**
  String get timerStatsWorkspace;

  /// No description provided for @timerActivityHeatmap.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get timerActivityHeatmap;

  /// No description provided for @timerViewSessionDetails.
  ///
  /// In en, this message translates to:
  /// **'Session details'**
  String get timerViewSessionDetails;

  /// No description provided for @timerEditSession.
  ///
  /// In en, this message translates to:
  /// **'Edit session'**
  String get timerEditSession;

  /// No description provided for @timerSessionUpdated.
  ///
  /// In en, this message translates to:
  /// **'Session updated'**
  String get timerSessionUpdated;

  /// No description provided for @timerSessionDeleted.
  ///
  /// In en, this message translates to:
  /// **'Session deleted'**
  String get timerSessionDeleted;

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

  /// No description provided for @timerInvalidDuration.
  ///
  /// In en, this message translates to:
  /// **'Invalid duration'**
  String get timerInvalidDuration;

  /// No description provided for @timerUnknownDate.
  ///
  /// In en, this message translates to:
  /// **'Unknown date'**
  String get timerUnknownDate;

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

  /// No description provided for @timerRequestResubmit.
  ///
  /// In en, this message translates to:
  /// **'Resubmit request'**
  String get timerRequestResubmit;

  /// No description provided for @timerRequestEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get timerRequestEdit;

  /// No description provided for @timerRequestEditRequest.
  ///
  /// In en, this message translates to:
  /// **'Edit request'**
  String get timerRequestEditRequest;

  /// No description provided for @timerRequestDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get timerRequestDescription;

  /// No description provided for @timerRequestDescriptionOptional.
  ///
  /// In en, this message translates to:
  /// **'Description (optional)'**
  String get timerRequestDescriptionOptional;

  /// No description provided for @timerRequestComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get timerRequestComments;

  /// No description provided for @timerRequestNoComments.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get timerRequestNoComments;

  /// No description provided for @timerRequestAddComment.
  ///
  /// In en, this message translates to:
  /// **'Add a comment...'**
  String get timerRequestAddComment;

  /// No description provided for @timerRequestPostComment.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get timerRequestPostComment;

  /// No description provided for @timerRequestCancelEditComment.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get timerRequestCancelEditComment;

  /// No description provided for @timerRequestDeleteComment.
  ///
  /// In en, this message translates to:
  /// **'Delete comment'**
  String get timerRequestDeleteComment;

  /// No description provided for @timerRequestDeleteCommentConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this comment?'**
  String get timerRequestDeleteCommentConfirm;

  /// No description provided for @timerRequestActivity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get timerRequestActivity;

  /// No description provided for @timerRequestNoActivity.
  ///
  /// In en, this message translates to:
  /// **'No activity yet'**
  String get timerRequestNoActivity;

  /// No description provided for @timerRequestActivityCreated.
  ///
  /// In en, this message translates to:
  /// **'created this request'**
  String get timerRequestActivityCreated;

  /// No description provided for @timerRequestActivityContentUpdated.
  ///
  /// In en, this message translates to:
  /// **'updated request content'**
  String get timerRequestActivityContentUpdated;

  /// No description provided for @timerRequestActivityStatusChanged.
  ///
  /// In en, this message translates to:
  /// **'changed the request status'**
  String get timerRequestActivityStatusChanged;

  /// No description provided for @timerRequestActivityCommentAdded.
  ///
  /// In en, this message translates to:
  /// **'added a comment'**
  String get timerRequestActivityCommentAdded;

  /// No description provided for @timerRequestActivityCommentUpdated.
  ///
  /// In en, this message translates to:
  /// **'updated a comment'**
  String get timerRequestActivityCommentUpdated;

  /// No description provided for @timerRequestActivityCommentDeleted.
  ///
  /// In en, this message translates to:
  /// **'deleted a comment'**
  String get timerRequestActivityCommentDeleted;

  /// No description provided for @timerRequestActivityUpdated.
  ///
  /// In en, this message translates to:
  /// **'updated this request'**
  String get timerRequestActivityUpdated;

  /// No description provided for @timerRequestActivityFeedbackLabel.
  ///
  /// In en, this message translates to:
  /// **'Feedback'**
  String get timerRequestActivityFeedbackLabel;

  /// No description provided for @timerRequestActivityTitleLabel.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get timerRequestActivityTitleLabel;

  /// No description provided for @timerRequestActivityUnknownUser.
  ///
  /// In en, this message translates to:
  /// **'Unknown user'**
  String get timerRequestActivityUnknownUser;

  /// No description provided for @timerRequestActivityItemsPerPage.
  ///
  /// In en, this message translates to:
  /// **'Items per page'**
  String get timerRequestActivityItemsPerPage;

  /// No description provided for @timerRequestActivityPageInfo.
  ///
  /// In en, this message translates to:
  /// **'Page {current} of {total}'**
  String timerRequestActivityPageInfo(int current, int total);

  /// No description provided for @timerRequestActivityActionCreated.
  ///
  /// In en, this message translates to:
  /// **'created'**
  String get timerRequestActivityActionCreated;

  /// No description provided for @timerRequestActivityActionStatusChanged.
  ///
  /// In en, this message translates to:
  /// **'changed status'**
  String get timerRequestActivityActionStatusChanged;

  /// No description provided for @timerRequestActivityActionContentUpdated.
  ///
  /// In en, this message translates to:
  /// **'updated content'**
  String get timerRequestActivityActionContentUpdated;

  /// No description provided for @timerRequestActivityActionCommentAdded.
  ///
  /// In en, this message translates to:
  /// **'added comment'**
  String get timerRequestActivityActionCommentAdded;

  /// No description provided for @timerRequestActivityActionCommentUpdated.
  ///
  /// In en, this message translates to:
  /// **'updated comment'**
  String get timerRequestActivityActionCommentUpdated;

  /// No description provided for @timerRequestActivityActionCommentDeleted.
  ///
  /// In en, this message translates to:
  /// **'deleted comment'**
  String get timerRequestActivityActionCommentDeleted;

  /// No description provided for @timerRequestActivityFieldStartTime.
  ///
  /// In en, this message translates to:
  /// **'Start time'**
  String get timerRequestActivityFieldStartTime;

  /// No description provided for @timerRequestActivityFieldEndTime.
  ///
  /// In en, this message translates to:
  /// **'End time'**
  String get timerRequestActivityFieldEndTime;

  /// No description provided for @timerRequestActivityFieldTitle.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get timerRequestActivityFieldTitle;

  /// No description provided for @timerRequestActivityFieldDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get timerRequestActivityFieldDescription;

  /// No description provided for @timerRequestAddImage.
  ///
  /// In en, this message translates to:
  /// **'Add image'**
  String get timerRequestAddImage;

  /// No description provided for @timerRequestProofImagesCount.
  ///
  /// In en, this message translates to:
  /// **'Images: {current}/{max}'**
  String timerRequestProofImagesCount(int current, int max);

  /// No description provided for @timerReasonOptional.
  ///
  /// In en, this message translates to:
  /// **'Reason (optional)'**
  String get timerReasonOptional;

  /// No description provided for @timerInfoRequired.
  ///
  /// In en, this message translates to:
  /// **'Info (required)'**
  String get timerInfoRequired;

  /// No description provided for @timerSubmitInfo.
  ///
  /// In en, this message translates to:
  /// **'Submit info'**
  String get timerSubmitInfo;

  /// No description provided for @timerRequestUpdated.
  ///
  /// In en, this message translates to:
  /// **'Request updated'**
  String get timerRequestUpdated;

  /// No description provided for @timerManagementTitle.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get timerManagementTitle;

  /// No description provided for @timerSearchSessions.
  ///
  /// In en, this message translates to:
  /// **'Search sessions...'**
  String get timerSearchSessions;

  /// No description provided for @timerDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get timerDescription;

  /// No description provided for @timerWorkSession.
  ///
  /// In en, this message translates to:
  /// **'Work session'**
  String get timerWorkSession;

  /// No description provided for @timerSubmitForApproval.
  ///
  /// In en, this message translates to:
  /// **'Submit for approval'**
  String get timerSubmitForApproval;

  /// No description provided for @timerRequestSubmittedTitle.
  ///
  /// In en, this message translates to:
  /// **'Request sent'**
  String get timerRequestSubmittedTitle;

  /// No description provided for @timerRequestSubmittedContent.
  ///
  /// In en, this message translates to:
  /// **'Your time entry has been submitted for approval.'**
  String get timerRequestSubmittedContent;

  /// No description provided for @timerRequestRejectionReason.
  ///
  /// In en, this message translates to:
  /// **'Rejection reason'**
  String get timerRequestRejectionReason;

  /// No description provided for @timerRequestNeedsInfoReason.
  ///
  /// In en, this message translates to:
  /// **'Requested Information'**
  String get timerRequestNeedsInfoReason;

  /// No description provided for @timerMissedEntrySavedTitle.
  ///
  /// In en, this message translates to:
  /// **'Entry saved'**
  String get timerMissedEntrySavedTitle;

  /// No description provided for @timerMissedEntrySavedContent.
  ///
  /// In en, this message translates to:
  /// **'Your missed time entry was added successfully.'**
  String get timerMissedEntrySavedContent;

  /// No description provided for @timerSessionExceeded.
  ///
  /// In en, this message translates to:
  /// **'Session exceeds threshold'**
  String get timerSessionExceeded;

  /// No description provided for @timerSessionExceededDescription.
  ///
  /// In en, this message translates to:
  /// **'This session is older than your workspace threshold. You can discard it or submit it as a request for approval.'**
  String get timerSessionExceededDescription;

  /// No description provided for @timerTimeEditingRestricted.
  ///
  /// In en, this message translates to:
  /// **'Time Editing Restricted'**
  String get timerTimeEditingRestricted;

  /// No description provided for @timerAllEditsRequireApproval.
  ///
  /// In en, this message translates to:
  /// **'All time edits must be submitted as requests for approval. This session is from {date}.'**
  String timerAllEditsRequireApproval(String date);

  /// No description provided for @timerDiscardSession.
  ///
  /// In en, this message translates to:
  /// **'Discard session'**
  String get timerDiscardSession;

  /// No description provided for @timerSubmitAsRequest.
  ///
  /// In en, this message translates to:
  /// **'Submit as request'**
  String get timerSubmitAsRequest;

  /// No description provided for @timerThresholdWarningAll.
  ///
  /// In en, this message translates to:
  /// **'All missed entries in this workspace require approval. Add at least one proof image before submitting.'**
  String get timerThresholdWarningAll;

  /// No description provided for @timerThresholdWarning.
  ///
  /// In en, this message translates to:
  /// **'Entries older than {days, plural, =1{1 day} other{{days} days}} require approval. Add at least one proof image before submitting.'**
  String timerThresholdWarning(int days);

  /// No description provided for @timerProofOfWorkRequired.
  ///
  /// In en, this message translates to:
  /// **'At least one proof image is required.'**
  String get timerProofOfWorkRequired;

  /// No description provided for @timerRequestsThresholdTitle.
  ///
  /// In en, this message translates to:
  /// **'Request threshold settings'**
  String get timerRequestsThresholdTitle;

  /// No description provided for @timerRequestsThresholdDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose when missed entries should require approval.'**
  String get timerRequestsThresholdDescription;

  /// No description provided for @timerRequestsThresholdNoApproval.
  ///
  /// In en, this message translates to:
  /// **'No approval needed'**
  String get timerRequestsThresholdNoApproval;

  /// No description provided for @timerRequestsThresholdNoApprovalHint.
  ///
  /// In en, this message translates to:
  /// **'Missed entries can be added directly without sending a request.'**
  String get timerRequestsThresholdNoApprovalHint;

  /// No description provided for @timerRequestsThresholdLabel.
  ///
  /// In en, this message translates to:
  /// **'Threshold (days)'**
  String get timerRequestsThresholdLabel;

  /// No description provided for @timerRequestsThresholdHelp.
  ///
  /// In en, this message translates to:
  /// **'Entries older than this number of days must be submitted for approval.'**
  String get timerRequestsThresholdHelp;

  /// No description provided for @timerRequestsThresholdInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a whole number greater than or equal to 0.'**
  String get timerRequestsThresholdInvalid;

  /// No description provided for @timerRequestsThresholdUpdated.
  ///
  /// In en, this message translates to:
  /// **'Request threshold updated.'**
  String get timerRequestsThresholdUpdated;

  /// No description provided for @timerAutoStartBreaks.
  ///
  /// In en, this message translates to:
  /// **'Auto-start breaks'**
  String get timerAutoStartBreaks;

  /// No description provided for @timerAutoStartFocus.
  ///
  /// In en, this message translates to:
  /// **'Auto-start focus'**
  String get timerAutoStartFocus;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

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

  /// No description provided for @timerGoalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Goals'**
  String get timerGoalsTitle;

  /// No description provided for @timerGoalsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Track your daily and weekly focus targets'**
  String get timerGoalsSubtitle;

  /// No description provided for @timerGoalsAdd.
  ///
  /// In en, this message translates to:
  /// **'Add goal'**
  String get timerGoalsAdd;

  /// No description provided for @timerGoalsCreate.
  ///
  /// In en, this message translates to:
  /// **'Create goal'**
  String get timerGoalsCreate;

  /// No description provided for @timerGoalsCreateTitle.
  ///
  /// In en, this message translates to:
  /// **'Create goal'**
  String get timerGoalsCreateTitle;

  /// No description provided for @timerGoalsCreateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Goal created'**
  String get timerGoalsCreateSuccess;

  /// No description provided for @timerGoalsEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get timerGoalsEdit;

  /// No description provided for @timerGoalsEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit goal'**
  String get timerGoalsEditTitle;

  /// No description provided for @timerGoalsSave.
  ///
  /// In en, this message translates to:
  /// **'Save goal'**
  String get timerGoalsSave;

  /// No description provided for @timerGoalsUpdateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Goal updated'**
  String get timerGoalsUpdateSuccess;

  /// No description provided for @timerGoalsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get timerGoalsDelete;

  /// No description provided for @timerGoalsDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete goal?'**
  String get timerGoalsDeleteTitle;

  /// No description provided for @timerGoalsDeleteDescription.
  ///
  /// In en, this message translates to:
  /// **'This action cannot be undone.'**
  String get timerGoalsDeleteDescription;

  /// No description provided for @timerGoalsDeleteSuccess.
  ///
  /// In en, this message translates to:
  /// **'Goal deleted'**
  String get timerGoalsDeleteSuccess;

  /// No description provided for @timerGoalsOperationFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not save your goal changes.'**
  String get timerGoalsOperationFailed;

  /// No description provided for @timerGoalsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No goals yet'**
  String get timerGoalsEmptyTitle;

  /// No description provided for @timerGoalsEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create your first goal to measure daily and weekly progress.'**
  String get timerGoalsEmptyDescription;

  /// No description provided for @timerGoalsCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get timerGoalsCategory;

  /// No description provided for @timerGoalsGeneral.
  ///
  /// In en, this message translates to:
  /// **'General'**
  String get timerGoalsGeneral;

  /// No description provided for @timerGoalsDailyMinutes.
  ///
  /// In en, this message translates to:
  /// **'Daily target (minutes)'**
  String get timerGoalsDailyMinutes;

  /// No description provided for @timerGoalsWeeklyMinutesOptional.
  ///
  /// In en, this message translates to:
  /// **'Weekly target (minutes, optional)'**
  String get timerGoalsWeeklyMinutesOptional;

  /// No description provided for @timerGoalsDailyValidation.
  ///
  /// In en, this message translates to:
  /// **'Daily target must be greater than 0.'**
  String get timerGoalsDailyValidation;

  /// No description provided for @timerGoalsWeeklyValidation.
  ///
  /// In en, this message translates to:
  /// **'Weekly target must be greater than 0.'**
  String get timerGoalsWeeklyValidation;

  /// No description provided for @timerGoalsActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get timerGoalsActive;

  /// No description provided for @timerGoalsInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive'**
  String get timerGoalsInactive;

  /// No description provided for @timerGoalsActiveLabel.
  ///
  /// In en, this message translates to:
  /// **'Goal is active'**
  String get timerGoalsActiveLabel;

  /// No description provided for @timerGoalsDailyProgress.
  ///
  /// In en, this message translates to:
  /// **'Daily progress'**
  String get timerGoalsDailyProgress;

  /// No description provided for @timerGoalsWeeklyProgress.
  ///
  /// In en, this message translates to:
  /// **'Weekly progress'**
  String get timerGoalsWeeklyProgress;

  /// No description provided for @timerGoalsDailyTarget.
  ///
  /// In en, this message translates to:
  /// **'Daily target'**
  String get timerGoalsDailyTarget;

  /// No description provided for @timerGoalsWeeklyTarget.
  ///
  /// In en, this message translates to:
  /// **'Weekly target'**
  String get timerGoalsWeeklyTarget;

  /// No description provided for @timerGoalsActiveCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{# active goal} other{# active goals}}'**
  String timerGoalsActiveCount(int count);

  /// No description provided for @timerHourUnitShort.
  ///
  /// In en, this message translates to:
  /// **'h'**
  String get timerHourUnitShort;

  /// No description provided for @timerMinuteUnitShort.
  ///
  /// In en, this message translates to:
  /// **'m'**
  String get timerMinuteUnitShort;

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

  /// No description provided for @settingsCalendar.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get settingsCalendar;

  /// No description provided for @settingsFirstDayOfWeek.
  ///
  /// In en, this message translates to:
  /// **'First day of week'**
  String get settingsFirstDayOfWeek;

  /// No description provided for @settingsFirstDayAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get settingsFirstDayAuto;

  /// No description provided for @settingsFirstDaySunday.
  ///
  /// In en, this message translates to:
  /// **'Sunday'**
  String get settingsFirstDaySunday;

  /// No description provided for @settingsFirstDayMonday.
  ///
  /// In en, this message translates to:
  /// **'Monday'**
  String get settingsFirstDayMonday;

  /// No description provided for @settingsFirstDaySaturday.
  ///
  /// In en, this message translates to:
  /// **'Saturday'**
  String get settingsFirstDaySaturday;

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

  /// No description provided for @profileStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get profileStatus;

  /// No description provided for @profileVerification.
  ///
  /// In en, this message translates to:
  /// **'Verification'**
  String get profileVerification;

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

  /// No description provided for @profileDisplayNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Display name cannot be empty'**
  String get profileDisplayNameRequired;

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

  /// No description provided for @profileFullNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Full name cannot be empty'**
  String get profileFullNameRequired;

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

  /// No description provided for @profileInvalidEmail.
  ///
  /// In en, this message translates to:
  /// **'Please enter a valid email address'**
  String get profileInvalidEmail;

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

  /// No description provided for @workspacePersonalSection.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get workspacePersonalSection;

  /// No description provided for @workspaceTeamSection.
  ///
  /// In en, this message translates to:
  /// **'Team workspaces'**
  String get workspaceTeamSection;

  /// No description provided for @workspaceCreateTitle.
  ///
  /// In en, this message translates to:
  /// **'Create workspace'**
  String get workspaceCreateTitle;

  /// No description provided for @workspaceCreateNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get workspaceCreateNew;

  /// No description provided for @workspaceCreateNameHint.
  ///
  /// In en, this message translates to:
  /// **'Workspace name'**
  String get workspaceCreateNameHint;

  /// No description provided for @workspaceCreateNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Workspace name is required'**
  String get workspaceCreateNameRequired;

  /// No description provided for @workspaceCreateSubmit.
  ///
  /// In en, this message translates to:
  /// **'Create workspace'**
  String get workspaceCreateSubmit;

  /// No description provided for @workspaceCreateCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get workspaceCreateCancel;

  /// No description provided for @workspaceCreatePrompt.
  ///
  /// In en, this message translates to:
  /// **'Create your first workspace to get started'**
  String get workspaceCreatePrompt;

  /// No description provided for @workspaceCreateLimitReached.
  ///
  /// In en, this message translates to:
  /// **'You have reached the workspace limit'**
  String get workspaceCreateLimitReached;

  /// No description provided for @workspaceCreateLimitInfo.
  ///
  /// In en, this message translates to:
  /// **'{current} of {limit} workspaces used'**
  String workspaceCreateLimitInfo(int current, int limit);

  /// No description provided for @mfaTitle.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication'**
  String get mfaTitle;

  /// No description provided for @mfaSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the code from your authenticator app'**
  String get mfaSubtitle;

  /// No description provided for @mfaVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get mfaVerify;

  /// No description provided for @mfaInvalidCode.
  ///
  /// In en, this message translates to:
  /// **'Invalid verification code. Please try again.'**
  String get mfaInvalidCode;

  /// No description provided for @mfaSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get mfaSignOut;

  /// No description provided for @captchaError.
  ///
  /// In en, this message translates to:
  /// **'Security check failed. Please try again.'**
  String get captchaError;

  /// No description provided for @commonSomethingWentWrong.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get commonSomethingWentWrong;

  /// No description provided for @selectImageSource.
  ///
  /// In en, this message translates to:
  /// **'Select image source'**
  String get selectImageSource;

  /// No description provided for @camera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get camera;

  /// No description provided for @gallery.
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get gallery;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonPrevious.
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get commonPrevious;

  /// No description provided for @commonNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get commonNext;

  /// No description provided for @onboardingSlide1Title.
  ///
  /// In en, this message translates to:
  /// **'Meet Mira'**
  String get onboardingSlide1Title;

  /// No description provided for @onboardingSlide1Subtitle.
  ///
  /// In en, this message translates to:
  /// **'Your AI companion for work and life. Mira connects your tasks, calendar, and finances.'**
  String get onboardingSlide1Subtitle;

  /// No description provided for @onboardingSlide2Title.
  ///
  /// In en, this message translates to:
  /// **'Everything in One App'**
  String get onboardingSlide2Title;

  /// No description provided for @onboardingSlide2Subtitle.
  ///
  /// In en, this message translates to:
  /// **'Tasks, Calendar, and Track - all unified. No more switching between apps.'**
  String get onboardingSlide2Subtitle;

  /// No description provided for @onboardingSlide3Title.
  ///
  /// In en, this message translates to:
  /// **'Intelligence That Grows'**
  String get onboardingSlide3Title;

  /// No description provided for @onboardingSlide3Subtitle.
  ///
  /// In en, this message translates to:
  /// **'Mira remembers your preferences and gets smarter the more you use her.'**
  String get onboardingSlide3Subtitle;

  /// No description provided for @onboardingGetStarted.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get onboardingGetStarted;
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
