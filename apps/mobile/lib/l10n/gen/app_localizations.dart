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

  /// No description provided for @loginContinueWithEmail.
  ///
  /// In en, this message translates to:
  /// **'Continue with email'**
  String get loginContinueWithEmail;

  /// No description provided for @loginSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get loginSignIn;

  /// No description provided for @authContinueWithApple.
  ///
  /// In en, this message translates to:
  /// **'Continue with Apple'**
  String get authContinueWithApple;

  /// No description provided for @authContinueWithGithub.
  ///
  /// In en, this message translates to:
  /// **'Continue with GitHub'**
  String get authContinueWithGithub;

  /// No description provided for @authContinueWithGoogle.
  ///
  /// In en, this message translates to:
  /// **'Continue with Google'**
  String get authContinueWithGoogle;

  /// No description provided for @authContinueWithMicrosoft.
  ///
  /// In en, this message translates to:
  /// **'Continue with Microsoft'**
  String get authContinueWithMicrosoft;

  /// No description provided for @authContinueWithEmail.
  ///
  /// In en, this message translates to:
  /// **'or continue with email'**
  String get authContinueWithEmail;

  /// No description provided for @authContinueWithSocial.
  ///
  /// In en, this message translates to:
  /// **'or use a social account'**
  String get authContinueWithSocial;

  /// No description provided for @authAppleSignInFailed.
  ///
  /// In en, this message translates to:
  /// **'Apple sign-in failed. Please try again.'**
  String get authAppleSignInFailed;

  /// No description provided for @authAppleBrowserLaunchFailed.
  ///
  /// In en, this message translates to:
  /// **'Unable to open Apple sign-in right now.'**
  String get authAppleBrowserLaunchFailed;

  /// No description provided for @authGithubBrowserLaunchFailed.
  ///
  /// In en, this message translates to:
  /// **'Unable to open GitHub sign-in right now.'**
  String get authGithubBrowserLaunchFailed;

  /// No description provided for @authGoogleSignInFailed.
  ///
  /// In en, this message translates to:
  /// **'Google sign-in failed. Please try again.'**
  String get authGoogleSignInFailed;

  /// No description provided for @authGoogleBrowserLaunchFailed.
  ///
  /// In en, this message translates to:
  /// **'Unable to open Google sign-in right now.'**
  String get authGoogleBrowserLaunchFailed;

  /// No description provided for @authMicrosoftBrowserLaunchFailed.
  ///
  /// In en, this message translates to:
  /// **'Unable to open Microsoft sign-in right now.'**
  String get authMicrosoftBrowserLaunchFailed;

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

  /// No description provided for @signUpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a provider to continue.'**
  String get signUpSubtitle;

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

  /// No description provided for @signUpAlreadyHaveAccountPrompt.
  ///
  /// In en, this message translates to:
  /// **'Already have an account?'**
  String get signUpAlreadyHaveAccountPrompt;

  /// No description provided for @signUpSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signUpSignIn;

  /// No description provided for @forgotPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Password help'**
  String get forgotPasswordTitle;

  /// No description provided for @forgotPasswordDescription.
  ///
  /// In en, this message translates to:
  /// **'Use the web app to update your password.'**
  String get forgotPasswordDescription;

  /// No description provided for @forgotPasswordInstructions.
  ///
  /// In en, this message translates to:
  /// **'Sign in on the web with a social account already linked to your email, then change your password from account settings.'**
  String get forgotPasswordInstructions;

  /// No description provided for @forgotPasswordNote.
  ///
  /// In en, this message translates to:
  /// **'Email-based password reset is not supported at this time.'**
  String get forgotPasswordNote;

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

  /// No description provided for @appUpdateChecking.
  ///
  /// In en, this message translates to:
  /// **'Checking app version...'**
  String get appUpdateChecking;

  /// No description provided for @appUpdateNow.
  ///
  /// In en, this message translates to:
  /// **'Update now'**
  String get appUpdateNow;

  /// No description provided for @appUpdateLater.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get appUpdateLater;

  /// No description provided for @appUpdateRecommendedTitle.
  ///
  /// In en, this message translates to:
  /// **'Update available'**
  String get appUpdateRecommendedTitle;

  /// No description provided for @appUpdateRecommendedMessage.
  ///
  /// In en, this message translates to:
  /// **'A newer version of the app is available. Update now for the latest fixes and improvements.'**
  String get appUpdateRecommendedMessage;

  /// No description provided for @appUpdateRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Update required'**
  String get appUpdateRequiredTitle;

  /// No description provided for @appUpdateRequiredMessage.
  ///
  /// In en, this message translates to:
  /// **'This app version is no longer supported. Update to continue using the app.'**
  String get appUpdateRequiredMessage;

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

  /// No description provided for @navHabits.
  ///
  /// In en, this message translates to:
  /// **'Habits'**
  String get navHabits;

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

  /// No description provided for @navBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get navBack;

  /// No description provided for @navMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navMore;

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

  /// No description provided for @appsHubHeroTitle.
  ///
  /// In en, this message translates to:
  /// **'Workspace tools'**
  String get appsHubHeroTitle;

  /// No description provided for @appsHubHeroSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a tool to open.'**
  String get appsHubHeroSubtitle;

  /// No description provided for @appsHubFeatured.
  ///
  /// In en, this message translates to:
  /// **'Featured'**
  String get appsHubFeatured;

  /// No description provided for @appsHubMoreTools.
  ///
  /// In en, this message translates to:
  /// **'More tools'**
  String get appsHubMoreTools;

  /// No description provided for @appsHubSearchResults.
  ///
  /// In en, this message translates to:
  /// **'Search results'**
  String get appsHubSearchResults;

  /// No description provided for @appsHubOpenApp.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get appsHubOpenApp;

  /// No description provided for @appsHubTasksDescription.
  ///
  /// In en, this message translates to:
  /// **'Assignments, boards, estimates, and portfolio planning.'**
  String get appsHubTasksDescription;

  /// No description provided for @appsHubHabitsDescription.
  ///
  /// In en, this message translates to:
  /// **'Track shared routines, streaks, and recurring progress.'**
  String get appsHubHabitsDescription;

  /// No description provided for @appsHubCalendarDescription.
  ///
  /// In en, this message translates to:
  /// **'See your agenda, upcoming events, and calendar views.'**
  String get appsHubCalendarDescription;

  /// No description provided for @appsHubFinanceDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage wallets, categories, tags, and transaction history.'**
  String get appsHubFinanceDescription;

  /// No description provided for @appsHubInventoryDescription.
  ///
  /// In en, this message translates to:
  /// **'Run products, stock, sales, and booth operations in one place.'**
  String get appsHubInventoryDescription;

  /// No description provided for @appsHubNotificationsDescription.
  ///
  /// In en, this message translates to:
  /// **'Review inbox activity, alerts, and archived updates.'**
  String get appsHubNotificationsDescription;

  /// No description provided for @appsHubSettingsDescription.
  ///
  /// In en, this message translates to:
  /// **'Adjust app, workspace, and personal preferences.'**
  String get appsHubSettingsDescription;

  /// No description provided for @appsHubTimerDescription.
  ///
  /// In en, this message translates to:
  /// **'Track sessions, review stats, and handle time requests.'**
  String get appsHubTimerDescription;

  /// No description provided for @habitsTitle.
  ///
  /// In en, this message translates to:
  /// **'Habits'**
  String get habitsTitle;

  /// No description provided for @habitsOverviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get habitsOverviewLabel;

  /// No description provided for @habitsActivityLabel.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get habitsActivityLabel;

  /// No description provided for @habitsActivityTitle.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get habitsActivityTitle;

  /// No description provided for @habitsActivitySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Review the latest habit logs across every tracker in this workspace.'**
  String get habitsActivitySubtitle;

  /// No description provided for @habitsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load habits right now'**
  String get habitsLoadError;

  /// No description provided for @habitsSummarySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Track rituals, routines, and shared momentum across your workspace.'**
  String get habitsSummarySubtitle;

  /// No description provided for @habitsSummaryVolume.
  ///
  /// In en, this message translates to:
  /// **'Current volume'**
  String get habitsSummaryVolume;

  /// No description provided for @habitsSummaryTargetsMet.
  ///
  /// In en, this message translates to:
  /// **'Targets met'**
  String get habitsSummaryTargetsMet;

  /// No description provided for @habitsSummaryTopStreak.
  ///
  /// In en, this message translates to:
  /// **'Top streak'**
  String get habitsSummaryTopStreak;

  /// No description provided for @habitsSummaryTrackers.
  ///
  /// In en, this message translates to:
  /// **'Trackers'**
  String get habitsSummaryTrackers;

  /// No description provided for @habitsScopeSelf.
  ///
  /// In en, this message translates to:
  /// **'Self'**
  String get habitsScopeSelf;

  /// No description provided for @habitsScopeTeam.
  ///
  /// In en, this message translates to:
  /// **'Team'**
  String get habitsScopeTeam;

  /// No description provided for @habitsScopeMember.
  ///
  /// In en, this message translates to:
  /// **'Member'**
  String get habitsScopeMember;

  /// No description provided for @habitsMemberPickerLabel.
  ///
  /// In en, this message translates to:
  /// **'View member'**
  String get habitsMemberPickerLabel;

  /// No description provided for @habitsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search habits, rituals, or metrics'**
  String get habitsSearchHint;

  /// No description provided for @habitsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No habit trackers yet'**
  String get habitsEmptyTitle;

  /// No description provided for @habitsEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create your first tracker to turn recurring habits into something the whole workspace can follow.'**
  String get habitsEmptyDescription;

  /// No description provided for @habitsTrackerNoDescription.
  ///
  /// In en, this message translates to:
  /// **'No description yet'**
  String get habitsTrackerNoDescription;

  /// No description provided for @habitsCreateTrackerAction.
  ///
  /// In en, this message translates to:
  /// **'Create tracker'**
  String get habitsCreateTrackerAction;

  /// No description provided for @habitsSaveTrackerAction.
  ///
  /// In en, this message translates to:
  /// **'Save tracker'**
  String get habitsSaveTrackerAction;

  /// No description provided for @habitsCreateTrackerTitle.
  ///
  /// In en, this message translates to:
  /// **'Create habit tracker'**
  String get habitsCreateTrackerTitle;

  /// No description provided for @habitsEditTrackerTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit habit tracker'**
  String get habitsEditTrackerTitle;

  /// No description provided for @habitsCreateTrackerDescription.
  ///
  /// In en, this message translates to:
  /// **'Define the goal, logging fields, and quick actions your workspace will use.'**
  String get habitsCreateTrackerDescription;

  /// No description provided for @habitsEditTrackerDescription.
  ///
  /// In en, this message translates to:
  /// **'Update the tracker structure, goal, and quick-add behavior.'**
  String get habitsEditTrackerDescription;

  /// No description provided for @habitsTemplateLabel.
  ///
  /// In en, this message translates to:
  /// **'Start from a template'**
  String get habitsTemplateLabel;

  /// No description provided for @habitsNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get habitsNameLabel;

  /// No description provided for @habitsNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Tracker name is required'**
  String get habitsNameRequired;

  /// No description provided for @habitsDescriptionLabel.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get habitsDescriptionLabel;

  /// No description provided for @habitsTrackingModeLabel.
  ///
  /// In en, this message translates to:
  /// **'Tracking mode'**
  String get habitsTrackingModeLabel;

  /// No description provided for @habitsModeDailySummary.
  ///
  /// In en, this message translates to:
  /// **'Daily summary'**
  String get habitsModeDailySummary;

  /// No description provided for @habitsModeEventLog.
  ///
  /// In en, this message translates to:
  /// **'Event log'**
  String get habitsModeEventLog;

  /// No description provided for @habitsAggregationLabel.
  ///
  /// In en, this message translates to:
  /// **'Aggregation'**
  String get habitsAggregationLabel;

  /// No description provided for @habitsAggregationSum.
  ///
  /// In en, this message translates to:
  /// **'Sum'**
  String get habitsAggregationSum;

  /// No description provided for @habitsAggregationMax.
  ///
  /// In en, this message translates to:
  /// **'Max'**
  String get habitsAggregationMax;

  /// No description provided for @habitsAggregationCountEntries.
  ///
  /// In en, this message translates to:
  /// **'Count entries'**
  String get habitsAggregationCountEntries;

  /// No description provided for @habitsAggregationBooleanAny.
  ///
  /// In en, this message translates to:
  /// **'Any complete'**
  String get habitsAggregationBooleanAny;

  /// No description provided for @habitsTargetPeriodLabel.
  ///
  /// In en, this message translates to:
  /// **'Target period'**
  String get habitsTargetPeriodLabel;

  /// No description provided for @habitsPeriodDaily.
  ///
  /// In en, this message translates to:
  /// **'Daily'**
  String get habitsPeriodDaily;

  /// No description provided for @habitsPeriodWeekly.
  ///
  /// In en, this message translates to:
  /// **'Weekly'**
  String get habitsPeriodWeekly;

  /// No description provided for @habitsTargetOperatorLabel.
  ///
  /// In en, this message translates to:
  /// **'Target operator'**
  String get habitsTargetOperatorLabel;

  /// No description provided for @habitsTargetOperatorEq.
  ///
  /// In en, this message translates to:
  /// **'Exactly'**
  String get habitsTargetOperatorEq;

  /// No description provided for @habitsTargetOperatorGte.
  ///
  /// In en, this message translates to:
  /// **'At least'**
  String get habitsTargetOperatorGte;

  /// No description provided for @habitsTargetValueLabel.
  ///
  /// In en, this message translates to:
  /// **'Target value'**
  String get habitsTargetValueLabel;

  /// No description provided for @habitsTargetValueRequired.
  ///
  /// In en, this message translates to:
  /// **'Target value must be greater than zero'**
  String get habitsTargetValueRequired;

  /// No description provided for @habitsStartDateLabel.
  ///
  /// In en, this message translates to:
  /// **'Start date'**
  String get habitsStartDateLabel;

  /// No description provided for @habitsAppearanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get habitsAppearanceLabel;

  /// No description provided for @habitsIconLabel.
  ///
  /// In en, this message translates to:
  /// **'Icon'**
  String get habitsIconLabel;

  /// No description provided for @habitsFieldsTitle.
  ///
  /// In en, this message translates to:
  /// **'Fields'**
  String get habitsFieldsTitle;

  /// No description provided for @habitsFieldsRequired.
  ///
  /// In en, this message translates to:
  /// **'Add at least one valid field'**
  String get habitsFieldsRequired;

  /// No description provided for @habitsAddField.
  ///
  /// In en, this message translates to:
  /// **'Add field'**
  String get habitsAddField;

  /// No description provided for @habitsPrimaryMetricLabel.
  ///
  /// In en, this message translates to:
  /// **'Primary metric'**
  String get habitsPrimaryMetricLabel;

  /// No description provided for @habitsPrimaryMetricRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a primary metric field'**
  String get habitsPrimaryMetricRequired;

  /// No description provided for @habitsQuickAddValuesLabel.
  ///
  /// In en, this message translates to:
  /// **'Quick-add values'**
  String get habitsQuickAddValuesLabel;

  /// No description provided for @habitsQuickAddValuesHint.
  ///
  /// In en, this message translates to:
  /// **'Example: 1, 2, 3'**
  String get habitsQuickAddValuesHint;

  /// No description provided for @habitsFreezeAllowanceLabel.
  ///
  /// In en, this message translates to:
  /// **'Freeze allowance'**
  String get habitsFreezeAllowanceLabel;

  /// No description provided for @habitsRecoveryWindowLabel.
  ///
  /// In en, this message translates to:
  /// **'Recovery windows'**
  String get habitsRecoveryWindowLabel;

  /// No description provided for @habitsActiveLabel.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get habitsActiveLabel;

  /// No description provided for @habitsFieldKeysUnique.
  ///
  /// In en, this message translates to:
  /// **'Field keys must be unique'**
  String get habitsFieldKeysUnique;

  /// No description provided for @habitsSelectOptionsRequired.
  ///
  /// In en, this message translates to:
  /// **'Select fields need at least one option'**
  String get habitsSelectOptionsRequired;

  /// No description provided for @habitsFieldCardTitle.
  ///
  /// In en, this message translates to:
  /// **'Field {count}'**
  String habitsFieldCardTitle(int count);

  /// No description provided for @habitsFieldLabel.
  ///
  /// In en, this message translates to:
  /// **'Field label'**
  String get habitsFieldLabel;

  /// No description provided for @habitsFieldType.
  ///
  /// In en, this message translates to:
  /// **'Field type'**
  String get habitsFieldType;

  /// No description provided for @habitsFieldKey.
  ///
  /// In en, this message translates to:
  /// **'Field key'**
  String get habitsFieldKey;

  /// No description provided for @habitsFieldUnit.
  ///
  /// In en, this message translates to:
  /// **'Unit'**
  String get habitsFieldUnit;

  /// No description provided for @habitsFieldOptions.
  ///
  /// In en, this message translates to:
  /// **'Options'**
  String get habitsFieldOptions;

  /// No description provided for @habitsFieldOptionsHint.
  ///
  /// In en, this message translates to:
  /// **'Example: easy, medium, hard'**
  String get habitsFieldOptionsHint;

  /// No description provided for @habitsFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'Required field'**
  String get habitsFieldRequired;

  /// No description provided for @habitsFieldTypeBoolean.
  ///
  /// In en, this message translates to:
  /// **'Boolean'**
  String get habitsFieldTypeBoolean;

  /// No description provided for @habitsFieldTypeNumber.
  ///
  /// In en, this message translates to:
  /// **'Number'**
  String get habitsFieldTypeNumber;

  /// No description provided for @habitsFieldTypeDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get habitsFieldTypeDuration;

  /// No description provided for @habitsFieldTypeText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get habitsFieldTypeText;

  /// No description provided for @habitsFieldTypeSelect.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get habitsFieldTypeSelect;

  /// No description provided for @habitsOverviewTab.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get habitsOverviewTab;

  /// No description provided for @habitsEntriesTab.
  ///
  /// In en, this message translates to:
  /// **'Entries'**
  String get habitsEntriesTab;

  /// No description provided for @habitsLeaderboardTab.
  ///
  /// In en, this message translates to:
  /// **'Leaderboard'**
  String get habitsLeaderboardTab;

  /// No description provided for @habitsLogEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'Log entry'**
  String get habitsLogEntryTitle;

  /// No description provided for @habitsLogEntryDescription.
  ///
  /// In en, this message translates to:
  /// **'Capture a habit update without leaving the habits area.'**
  String get habitsLogEntryDescription;

  /// No description provided for @habitsLogEntryAction.
  ///
  /// In en, this message translates to:
  /// **'Log entry'**
  String get habitsLogEntryAction;

  /// No description provided for @habitsCompleteNow.
  ///
  /// In en, this message translates to:
  /// **'Complete now'**
  String get habitsCompleteNow;

  /// No description provided for @habitsEntryDateLabel.
  ///
  /// In en, this message translates to:
  /// **'Entry date'**
  String get habitsEntryDateLabel;

  /// No description provided for @habitsEntryNoteLabel.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get habitsEntryNoteLabel;

  /// No description provided for @habitsEntryTagsLabel.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get habitsEntryTagsLabel;

  /// No description provided for @habitsEntryTagsHint.
  ///
  /// In en, this message translates to:
  /// **'Comma-separated tags'**
  String get habitsEntryTagsHint;

  /// No description provided for @habitsSaveEntry.
  ///
  /// In en, this message translates to:
  /// **'Save entry'**
  String get habitsSaveEntry;

  /// No description provided for @habitsMarkDone.
  ///
  /// In en, this message translates to:
  /// **'Mark done'**
  String get habitsMarkDone;

  /// No description provided for @habitsMarkedDone.
  ///
  /// In en, this message translates to:
  /// **'Marked done'**
  String get habitsMarkedDone;

  /// No description provided for @habitsFormRequiredField.
  ///
  /// In en, this message translates to:
  /// **'Please complete the required fields'**
  String get habitsFormRequiredField;

  /// No description provided for @habitsFormInvalidNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid number'**
  String get habitsFormInvalidNumber;

  /// No description provided for @habitsArchiveTrackerTitle.
  ///
  /// In en, this message translates to:
  /// **'Archive habit tracker?'**
  String get habitsArchiveTrackerTitle;

  /// No description provided for @habitsArchiveTrackerMessage.
  ///
  /// In en, this message translates to:
  /// **'This tracker will be removed from the active habits view.'**
  String get habitsArchiveTrackerMessage;

  /// No description provided for @habitsArchiveTrackerAction.
  ///
  /// In en, this message translates to:
  /// **'Archive tracker'**
  String get habitsArchiveTrackerAction;

  /// No description provided for @habitsDeleteEntryTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete entry?'**
  String get habitsDeleteEntryTitle;

  /// No description provided for @habitsDeleteEntryMessage.
  ///
  /// In en, this message translates to:
  /// **'This habit entry will be permanently removed.'**
  String get habitsDeleteEntryMessage;

  /// No description provided for @habitsDeleteEntryAction.
  ///
  /// In en, this message translates to:
  /// **'Delete entry'**
  String get habitsDeleteEntryAction;

  /// No description provided for @habitsEditTrackerAction.
  ///
  /// In en, this message translates to:
  /// **'Edit tracker'**
  String get habitsEditTrackerAction;

  /// No description provided for @habitsCurrentStreak.
  ///
  /// In en, this message translates to:
  /// **'Current streak'**
  String get habitsCurrentStreak;

  /// No description provided for @habitsBestStreak.
  ///
  /// In en, this message translates to:
  /// **'Best streak'**
  String get habitsBestStreak;

  /// No description provided for @habitsConsistencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Consistency'**
  String get habitsConsistencyLabel;

  /// No description provided for @habitsRecoveryWindowTitle.
  ///
  /// In en, this message translates to:
  /// **'Recovery window'**
  String get habitsRecoveryWindowTitle;

  /// No description provided for @habitsRecoveryWindowDescription.
  ///
  /// In en, this message translates to:
  /// **'Use a repair or freeze when a streak period needs help staying intact.'**
  String get habitsRecoveryWindowDescription;

  /// No description provided for @habitsRepairStreakAction.
  ///
  /// In en, this message translates to:
  /// **'Repair streak'**
  String get habitsRepairStreakAction;

  /// No description provided for @habitsUseFreezeAction.
  ///
  /// In en, this message translates to:
  /// **'Use freeze'**
  String get habitsUseFreezeAction;

  /// No description provided for @habitsCurrentPeriodMetricsTitle.
  ///
  /// In en, this message translates to:
  /// **'Current period metrics'**
  String get habitsCurrentPeriodMetricsTitle;

  /// No description provided for @habitsEntriesCountLabel.
  ///
  /// In en, this message translates to:
  /// **'{count} entries'**
  String habitsEntriesCountLabel(int count);

  /// No description provided for @habitsMemberSummariesTitle.
  ///
  /// In en, this message translates to:
  /// **'Member summaries'**
  String get habitsMemberSummariesTitle;

  /// No description provided for @habitsTeamSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'Team summary'**
  String get habitsTeamSummaryTitle;

  /// No description provided for @habitsTopStreakLabel.
  ///
  /// In en, this message translates to:
  /// **'Top streak'**
  String get habitsTopStreakLabel;

  /// No description provided for @habitsEntriesLabel.
  ///
  /// In en, this message translates to:
  /// **'Entries'**
  String get habitsEntriesLabel;

  /// No description provided for @habitsNoEntries.
  ///
  /// In en, this message translates to:
  /// **'No entries yet'**
  String get habitsNoEntries;

  /// No description provided for @habitsNoLeaderboard.
  ///
  /// In en, this message translates to:
  /// **'No leaderboard data yet'**
  String get habitsNoLeaderboard;

  /// No description provided for @habitsActivityEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No logs yet'**
  String get habitsActivityEmptyTitle;

  /// No description provided for @habitsActivityEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'When someone logs a habit entry, it will appear here.'**
  String get habitsActivityEmptyBody;

  /// No description provided for @habitsActivityNoTrackers.
  ///
  /// In en, this message translates to:
  /// **'Create a habit tracker first to start collecting activity.'**
  String get habitsActivityNoTrackers;

  /// No description provided for @habitsStreakChip.
  ///
  /// In en, this message translates to:
  /// **'{count} streak'**
  String habitsStreakChip(int count);

  /// No description provided for @habitsTargetChip.
  ///
  /// In en, this message translates to:
  /// **'{count} target'**
  String habitsTargetChip(double count);

  /// No description provided for @habitsTeamMembers.
  ///
  /// In en, this message translates to:
  /// **'Team members'**
  String get habitsTeamMembers;

  /// No description provided for @habitsTodayTotalHint.
  ///
  /// In en, this message translates to:
  /// **'Today\'s total'**
  String get habitsTodayTotalHint;

  /// No description provided for @habitsQuickLogValueRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a value before saving'**
  String get habitsQuickLogValueRequired;

  /// No description provided for @habitsMetricMet.
  ///
  /// In en, this message translates to:
  /// **'Met'**
  String get habitsMetricMet;

  /// No description provided for @habitsMetricPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get habitsMetricPending;

  /// No description provided for @assistantComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming Soon'**
  String get assistantComingSoon;

  /// No description provided for @assistantSelectWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Select a workspace'**
  String get assistantSelectWorkspace;

  /// No description provided for @assistantWorkspaceAwareDescription.
  ///
  /// In en, this message translates to:
  /// **'Your AI assistant for planning, questions, and quick actions.'**
  String get assistantWorkspaceAwareDescription;

  /// No description provided for @assistantHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent chats'**
  String get assistantHistoryTitle;

  /// No description provided for @assistantHistoryEmpty.
  ///
  /// In en, this message translates to:
  /// **'No chats yet. Start a new conversation to create one.'**
  String get assistantHistoryEmpty;

  /// No description provided for @assistantUntitledChat.
  ///
  /// In en, this message translates to:
  /// **'Untitled chat'**
  String get assistantUntitledChat;

  /// No description provided for @assistantPersonalWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get assistantPersonalWorkspace;

  /// No description provided for @assistantSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Assistant settings'**
  String get assistantSettingsTitle;

  /// No description provided for @assistantSendAction.
  ///
  /// In en, this message translates to:
  /// **'Send message'**
  String get assistantSendAction;

  /// No description provided for @assistantActionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Action'**
  String get assistantActionsTitle;

  /// No description provided for @assistantRenameTitle.
  ///
  /// In en, this message translates to:
  /// **'Rename Assistant'**
  String get assistantRenameTitle;

  /// No description provided for @assistantRenameAction.
  ///
  /// In en, this message translates to:
  /// **'Rename'**
  String get assistantRenameAction;

  /// No description provided for @assistantCancelAction.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get assistantCancelAction;

  /// No description provided for @assistantSaveAction.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get assistantSaveAction;

  /// No description provided for @assistantCreditsTitle.
  ///
  /// In en, this message translates to:
  /// **'Credits'**
  String get assistantCreditsTitle;

  /// No description provided for @assistantConversationTitle.
  ///
  /// In en, this message translates to:
  /// **'Conversation'**
  String get assistantConversationTitle;

  /// No description provided for @assistantAttachFilesAction.
  ///
  /// In en, this message translates to:
  /// **'Attach files'**
  String get assistantAttachFilesAction;

  /// No description provided for @assistantEnterFullscreenAction.
  ///
  /// In en, this message translates to:
  /// **'Enter fullscreen'**
  String get assistantEnterFullscreenAction;

  /// No description provided for @assistantExitFullscreenAction.
  ///
  /// In en, this message translates to:
  /// **'Exit fullscreen'**
  String get assistantExitFullscreenAction;

  /// No description provided for @assistantPersonalCredits.
  ///
  /// In en, this message translates to:
  /// **'Personal credits'**
  String get assistantPersonalCredits;

  /// No description provided for @assistantWorkspaceCredits.
  ///
  /// In en, this message translates to:
  /// **'Workspace credits'**
  String get assistantWorkspaceCredits;

  /// No description provided for @assistantTasksLabel.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get assistantTasksLabel;

  /// No description provided for @assistantCalendarLabel.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get assistantCalendarLabel;

  /// No description provided for @assistantActiveLabel.
  ///
  /// In en, this message translates to:
  /// **'active'**
  String get assistantActiveLabel;

  /// No description provided for @assistantDoneTodayLabel.
  ///
  /// In en, this message translates to:
  /// **'done today'**
  String get assistantDoneTodayLabel;

  /// No description provided for @assistantUpcomingLabel.
  ///
  /// In en, this message translates to:
  /// **'upcoming'**
  String get assistantUpcomingLabel;

  /// No description provided for @assistantYouLabel.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get assistantYouLabel;

  /// No description provided for @assistantThinkingStatus.
  ///
  /// In en, this message translates to:
  /// **'Thinking...'**
  String get assistantThinkingStatus;

  /// No description provided for @assistantReasoningLabel.
  ///
  /// In en, this message translates to:
  /// **'Reasoning'**
  String get assistantReasoningLabel;

  /// No description provided for @assistantAskPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Ask anything...'**
  String get assistantAskPlaceholder;

  /// No description provided for @assistantQueuedPrefix.
  ///
  /// In en, this message translates to:
  /// **'Queued:'**
  String get assistantQueuedPrefix;

  /// No description provided for @assistantQuickPromptCalendar.
  ///
  /// In en, this message translates to:
  /// **'Summarize my calendar for today'**
  String get assistantQuickPromptCalendar;

  /// No description provided for @assistantQuickPromptTasks.
  ///
  /// In en, this message translates to:
  /// **'Show my most urgent tasks'**
  String get assistantQuickPromptTasks;

  /// No description provided for @assistantQuickPromptFocus.
  ///
  /// In en, this message translates to:
  /// **'Help me plan my next focus block'**
  String get assistantQuickPromptFocus;

  /// No description provided for @assistantQuickPromptExpense.
  ///
  /// In en, this message translates to:
  /// **'Log a quick expense for lunch'**
  String get assistantQuickPromptExpense;

  /// No description provided for @assistantNewConversation.
  ///
  /// In en, this message translates to:
  /// **'New conversation'**
  String get assistantNewConversation;

  /// No description provided for @assistantExportChat.
  ///
  /// In en, this message translates to:
  /// **'Export chat'**
  String get assistantExportChat;

  /// No description provided for @assistantModelLabel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get assistantModelLabel;

  /// No description provided for @assistantModeFast.
  ///
  /// In en, this message translates to:
  /// **'Fast'**
  String get assistantModeFast;

  /// No description provided for @assistantModeThinking.
  ///
  /// In en, this message translates to:
  /// **'Thinking'**
  String get assistantModeThinking;

  /// No description provided for @assistantImmersiveLabel.
  ///
  /// In en, this message translates to:
  /// **'Immersive'**
  String get assistantImmersiveLabel;

  /// No description provided for @assistantStandardLabel.
  ///
  /// In en, this message translates to:
  /// **'Standard'**
  String get assistantStandardLabel;

  /// No description provided for @assistantViewOnlyLabel.
  ///
  /// In en, this message translates to:
  /// **'View only'**
  String get assistantViewOnlyLabel;

  /// No description provided for @assistantEditableLabel.
  ///
  /// In en, this message translates to:
  /// **'Editable'**
  String get assistantEditableLabel;

  /// No description provided for @assistantSourceLabel.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get assistantSourceLabel;

  /// No description provided for @assistantSourcePersonal.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get assistantSourcePersonal;

  /// No description provided for @assistantSourceWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Workspace'**
  String get assistantSourceWorkspace;

  /// No description provided for @assistantToolLabel.
  ///
  /// In en, this message translates to:
  /// **'Tool'**
  String get assistantToolLabel;

  /// No description provided for @assistantInputLabel.
  ///
  /// In en, this message translates to:
  /// **'Input'**
  String get assistantInputLabel;

  /// No description provided for @assistantOutputLabel.
  ///
  /// In en, this message translates to:
  /// **'Output'**
  String get assistantOutputLabel;

  /// No description provided for @assistantSeeMoreLabel.
  ///
  /// In en, this message translates to:
  /// **'See more'**
  String get assistantSeeMoreLabel;

  /// No description provided for @assistantSeeLessLabel.
  ///
  /// In en, this message translates to:
  /// **'See less'**
  String get assistantSeeLessLabel;

  /// No description provided for @assistantExportShareText.
  ///
  /// In en, this message translates to:
  /// **'Chat export'**
  String get assistantExportShareText;

  /// No description provided for @assistantAttachmentClearAction.
  ///
  /// In en, this message translates to:
  /// **'Clear attachments'**
  String get assistantAttachmentClearAction;

  /// No description provided for @assistantAttachmentSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Attachments'**
  String get assistantAttachmentSheetTitle;

  /// No description provided for @assistantAttachmentUploadPending.
  ///
  /// In en, this message translates to:
  /// **'Wait for attachment uploads to finish before sending.'**
  String get assistantAttachmentUploadPending;

  /// No description provided for @assistantContextUpdatedLabel.
  ///
  /// In en, this message translates to:
  /// **'Workspace context updated'**
  String get assistantContextUpdatedLabel;

  /// No description provided for @assistantPreferencesUpdatedLabel.
  ///
  /// In en, this message translates to:
  /// **'Assistant preferences updated'**
  String get assistantPreferencesUpdatedLabel;

  /// No description provided for @assistantStarterBacklog.
  ///
  /// In en, this message translates to:
  /// **'Backlog cleanup'**
  String get assistantStarterBacklog;

  /// No description provided for @assistantStarterCaptionBacklog.
  ///
  /// In en, this message translates to:
  /// **'Break open tasks into a clean next-step list.'**
  String get assistantStarterCaptionBacklog;

  /// No description provided for @assistantStarterCaptionDraft.
  ///
  /// In en, this message translates to:
  /// **'Shape a concise update before you send it.'**
  String get assistantStarterCaptionDraft;

  /// No description provided for @assistantStarterCaptionFocus.
  ///
  /// In en, this message translates to:
  /// **'Let Mira surface the best next move.'**
  String get assistantStarterCaptionFocus;

  /// No description provided for @assistantStarterCaptionPlan.
  ///
  /// In en, this message translates to:
  /// **'Balance meetings, tasks, and real focus time.'**
  String get assistantStarterCaptionPlan;

  /// No description provided for @assistantStarterDraft.
  ///
  /// In en, this message translates to:
  /// **'Team update'**
  String get assistantStarterDraft;

  /// No description provided for @assistantStarterFocus.
  ///
  /// In en, this message translates to:
  /// **'Today\'s focus'**
  String get assistantStarterFocus;

  /// No description provided for @assistantStarterPlan.
  ///
  /// In en, this message translates to:
  /// **'Day plan'**
  String get assistantStarterPlan;

  /// No description provided for @assistantStarterSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pick a quick starter or type your own.'**
  String get assistantStarterSubtitle;

  /// No description provided for @assistantStarterTitle.
  ///
  /// In en, this message translates to:
  /// **'Need a place to start?'**
  String get assistantStarterTitle;

  /// No description provided for @assistantShowBottomNavLabel.
  ///
  /// In en, this message translates to:
  /// **'Show bottom nav'**
  String get assistantShowBottomNavLabel;

  /// No description provided for @assistantHideBottomNavLabel.
  ///
  /// In en, this message translates to:
  /// **'Hide bottom nav'**
  String get assistantHideBottomNavLabel;

  /// No description provided for @assistantLiveAccessSummary.
  ///
  /// In en, this message translates to:
  /// **'{workspace} • {source}'**
  String assistantLiveAccessSummary(String workspace, String source);

  /// No description provided for @assistantLiveAccessUsingPersonal.
  ///
  /// In en, this message translates to:
  /// **'Using personal {tier}'**
  String assistantLiveAccessUsingPersonal(String tier);

  /// No description provided for @assistantLiveAccessUsingWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Using workspace {tier}'**
  String assistantLiveAccessUsingWorkspace(String tier);

  /// No description provided for @assistantLiveCameraPreview.
  ///
  /// In en, this message translates to:
  /// **'Live camera'**
  String get assistantLiveCameraPreview;

  /// No description provided for @assistantLiveConnect.
  ///
  /// In en, this message translates to:
  /// **'Start live session'**
  String get assistantLiveConnect;

  /// No description provided for @assistantLiveDescriptionConnecting.
  ///
  /// In en, this message translates to:
  /// **'Creating a direct Gemini Live session for text, audio, and camera input.'**
  String get assistantLiveDescriptionConnecting;

  /// No description provided for @assistantLiveDescriptionError.
  ///
  /// In en, this message translates to:
  /// **'The live session hit an error. Retry or start a fresh session.'**
  String get assistantLiveDescriptionError;

  /// No description provided for @assistantLiveDescriptionIdle.
  ///
  /// In en, this message translates to:
  /// **'Start a live session to talk, type, or stream camera context into the same assistant chat.'**
  String get assistantLiveDescriptionIdle;

  /// No description provided for @assistantLiveDescriptionListening.
  ///
  /// In en, this message translates to:
  /// **'Microphone streaming is active. Mira will keep listening for new audio input.'**
  String get assistantLiveDescriptionListening;

  /// No description provided for @assistantLiveDescriptionPreparing.
  ///
  /// In en, this message translates to:
  /// **'Minting an ephemeral token and restoring the last resumable live session.'**
  String get assistantLiveDescriptionPreparing;

  /// No description provided for @assistantLiveDescriptionReady.
  ///
  /// In en, this message translates to:
  /// **'Live text and audio are ready. Type a turn, talk, or share your camera feed.'**
  String get assistantLiveDescriptionReady;

  /// No description provided for @assistantLiveDescriptionReconnecting.
  ///
  /// In en, this message translates to:
  /// **'The session is reconnecting with the latest resumable handle and restored history.'**
  String get assistantLiveDescriptionReconnecting;

  /// No description provided for @assistantLiveDisconnect.
  ///
  /// In en, this message translates to:
  /// **'End live session'**
  String get assistantLiveDisconnect;

  /// No description provided for @assistantLiveDraftAssistant.
  ///
  /// In en, this message translates to:
  /// **'Mira is replying'**
  String get assistantLiveDraftAssistant;

  /// No description provided for @assistantLiveDraftUser.
  ///
  /// In en, this message translates to:
  /// **'You are speaking'**
  String get assistantLiveDraftUser;

  /// No description provided for @assistantLiveHideCamera.
  ///
  /// In en, this message translates to:
  /// **'Hide camera'**
  String get assistantLiveHideCamera;

  /// No description provided for @assistantLiveInsightsTitle.
  ///
  /// In en, this message translates to:
  /// **'Live insights'**
  String get assistantLiveInsightsTitle;

  /// No description provided for @assistantLiveListen.
  ///
  /// In en, this message translates to:
  /// **'Open mic'**
  String get assistantLiveListen;

  /// No description provided for @assistantLiveMute.
  ///
  /// In en, this message translates to:
  /// **'Mute mic'**
  String get assistantLiveMute;

  /// No description provided for @assistantLiveNoMessagesBody.
  ///
  /// In en, this message translates to:
  /// **'Use voice, text, or attachments to start a chat. Everything from the live session will sync back into this thread.'**
  String get assistantLiveNoMessagesBody;

  /// No description provided for @assistantLiveNoMessagesTitle.
  ///
  /// In en, this message translates to:
  /// **'Your live assistant is ready'**
  String get assistantLiveNoMessagesTitle;

  /// No description provided for @assistantLivePermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Camera or microphone access is blocked. Enable permissions to use the full live mode.'**
  String get assistantLivePermissionDenied;

  /// No description provided for @assistantLiveReconnectBanner.
  ///
  /// In en, this message translates to:
  /// **'Session rotation detected. Reconnecting with about {timeLeft} remaining.'**
  String assistantLiveReconnectBanner(String timeLeft);

  /// No description provided for @assistantLiveShowCamera.
  ///
  /// In en, this message translates to:
  /// **'Show camera'**
  String get assistantLiveShowCamera;

  /// No description provided for @assistantLiveStatusAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get assistantLiveStatusAvailable;

  /// No description provided for @assistantLiveStatusConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting'**
  String get assistantLiveStatusConnecting;

  /// No description provided for @assistantLiveStatusDisconnected.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get assistantLiveStatusDisconnected;

  /// No description provided for @assistantLiveStatusError.
  ///
  /// In en, this message translates to:
  /// **'Needs attention'**
  String get assistantLiveStatusError;

  /// No description provided for @assistantLiveStatusPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing'**
  String get assistantLiveStatusPreparing;

  /// No description provided for @assistantLiveStatusReady.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get assistantLiveStatusReady;

  /// No description provided for @assistantLiveStatusReconnecting.
  ///
  /// In en, this message translates to:
  /// **'Reconnecting'**
  String get assistantLiveStatusReconnecting;

  /// No description provided for @assistantLiveStatusSyncing.
  ///
  /// In en, this message translates to:
  /// **'Syncing'**
  String get assistantLiveStatusSyncing;

  /// No description provided for @assistantLiveStatusUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get assistantLiveStatusUnavailable;

  /// No description provided for @assistantLiveSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Gemini 3.1 Flash Live with voice, camera, attachments, and unified chat history.'**
  String get assistantLiveSubtitle;

  /// No description provided for @assistantLiveTierRequired.
  ///
  /// In en, this message translates to:
  /// **'Live voice is available on PLUS and above.'**
  String get assistantLiveTierRequired;

  /// No description provided for @assistantLiveTitle.
  ///
  /// In en, this message translates to:
  /// **'Live assistant'**
  String get assistantLiveTitle;

  /// No description provided for @assistantLiveInfoAccessHeading.
  ///
  /// In en, this message translates to:
  /// **'Current access'**
  String get assistantLiveInfoAccessHeading;

  /// No description provided for @assistantLiveInfoDismiss.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get assistantLiveInfoDismiss;

  /// No description provided for @assistantLiveWorkspaceTierLabel.
  ///
  /// In en, this message translates to:
  /// **'Workspace {tier}'**
  String assistantLiveWorkspaceTierLabel(String tier);

  /// No description provided for @assistantMermaidDiagramLabel.
  ///
  /// In en, this message translates to:
  /// **'Diagram'**
  String get assistantMermaidDiagramLabel;

  /// No description provided for @assistantMermaidRenderError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t render this Mermaid diagram.'**
  String get assistantMermaidRenderError;

  /// No description provided for @assistantMermaidZoomHint.
  ///
  /// In en, this message translates to:
  /// **'Pinch or use the zoom controls to inspect the diagram in fullscreen.'**
  String get assistantMermaidZoomHint;

  /// No description provided for @assistantMermaidZoomIn.
  ///
  /// In en, this message translates to:
  /// **'Zoom in'**
  String get assistantMermaidZoomIn;

  /// No description provided for @assistantMermaidZoomOut.
  ///
  /// In en, this message translates to:
  /// **'Zoom out'**
  String get assistantMermaidZoomOut;

  /// No description provided for @assistantMermaidZoomReset.
  ///
  /// In en, this message translates to:
  /// **'Reset zoom'**
  String get assistantMermaidZoomReset;

  /// No description provided for @assistantCopyMessageAction.
  ///
  /// In en, this message translates to:
  /// **'Copy message'**
  String get assistantCopyMessageAction;

  /// No description provided for @assistantCopiedMessageAction.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get assistantCopiedMessageAction;

  /// No description provided for @assistantScrollToBottomAction.
  ///
  /// In en, this message translates to:
  /// **'Scroll to bottom'**
  String get assistantScrollToBottomAction;

  /// No description provided for @assistantToolCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get assistantToolCompleted;

  /// No description provided for @assistantToolGeneratedImage.
  ///
  /// In en, this message translates to:
  /// **'Generated image'**
  String get assistantToolGeneratedImage;

  /// No description provided for @assistantToolImageUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The generated image is unavailable right now.'**
  String get assistantToolImageUnavailable;

  /// No description provided for @assistantToolNoActionNeeded.
  ///
  /// In en, this message translates to:
  /// **'No tools were needed for this reply.'**
  String get assistantToolNoActionNeeded;

  /// No description provided for @assistantToolSelectedTools.
  ///
  /// In en, this message translates to:
  /// **'Selected tools'**
  String get assistantToolSelectedTools;

  /// No description provided for @assistantToolsLabel.
  ///
  /// In en, this message translates to:
  /// **'Tools'**
  String get assistantToolsLabel;

  /// No description provided for @assistantCreditsSummary.
  ///
  /// In en, this message translates to:
  /// **'{remaining} remaining • {tier}'**
  String assistantCreditsSummary(int remaining, String tier);

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

  /// No description provided for @dashboardTodayTitle.
  ///
  /// In en, this message translates to:
  /// **'Today at a glance'**
  String get dashboardTodayTitle;

  /// No description provided for @dashboardActiveTasksLabel.
  ///
  /// In en, this message translates to:
  /// **'Active tasks'**
  String get dashboardActiveTasksLabel;

  /// No description provided for @dashboardQuickLaunch.
  ///
  /// In en, this message translates to:
  /// **'Quick launch'**
  String get dashboardQuickLaunch;

  /// No description provided for @dashboardAssignedToMe.
  ///
  /// In en, this message translates to:
  /// **'Assigned to me'**
  String get dashboardAssignedToMe;

  /// No description provided for @dashboardUpcomingEvents.
  ///
  /// In en, this message translates to:
  /// **'Upcoming events'**
  String get dashboardUpcomingEvents;

  /// No description provided for @dashboardOpenTasks.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get dashboardOpenTasks;

  /// No description provided for @dashboardOpenCalendar.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get dashboardOpenCalendar;

  /// No description provided for @dashboardNoAssignedTasks.
  ///
  /// In en, this message translates to:
  /// **'No active tasks assigned to you.'**
  String get dashboardNoAssignedTasks;

  /// No description provided for @dashboardNoAssignedTasksDescription.
  ///
  /// In en, this message translates to:
  /// **'You\'re clear for now. New work will appear here.'**
  String get dashboardNoAssignedTasksDescription;

  /// No description provided for @dashboardNoUpcomingEvents.
  ///
  /// In en, this message translates to:
  /// **'No upcoming timed events in the next 7 days.'**
  String get dashboardNoUpcomingEvents;

  /// No description provided for @dashboardNoUpcomingEventsDescription.
  ///
  /// In en, this message translates to:
  /// **'Your schedule looks open.'**
  String get dashboardNoUpcomingEventsDescription;

  /// No description provided for @dashboardTaskOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get dashboardTaskOverdue;

  /// No description provided for @dashboardTaskToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get dashboardTaskToday;

  /// No description provided for @dashboardTaskTomorrow.
  ///
  /// In en, this message translates to:
  /// **'Tomorrow'**
  String get dashboardTaskTomorrow;

  /// No description provided for @dashboardTaskUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get dashboardTaskUpcoming;

  /// No description provided for @dashboardTaskNoDate.
  ///
  /// In en, this message translates to:
  /// **'No due date'**
  String get dashboardTaskNoDate;

  /// No description provided for @dashboardEventAllDay.
  ///
  /// In en, this message translates to:
  /// **'All day'**
  String get dashboardEventAllDay;

  /// No description provided for @dashboardTasksMetric.
  ///
  /// In en, this message translates to:
  /// **'{count} active'**
  String dashboardTasksMetric(Object count);

  /// No description provided for @dashboardOverdueMetric.
  ///
  /// In en, this message translates to:
  /// **'{count} overdue'**
  String dashboardOverdueMetric(Object count);

  /// No description provided for @dashboardEventsMetric.
  ///
  /// In en, this message translates to:
  /// **'{count} next up'**
  String dashboardEventsMetric(Object count);

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

  /// No description provided for @tasksLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load tasks right now'**
  String get tasksLoadError;

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

  /// No description provided for @tasksGoodMorning.
  ///
  /// In en, this message translates to:
  /// **'Good morning'**
  String get tasksGoodMorning;

  /// No description provided for @tasksGoodAfternoon.
  ///
  /// In en, this message translates to:
  /// **'Good afternoon'**
  String get tasksGoodAfternoon;

  /// No description provided for @tasksGoodEvening.
  ///
  /// In en, this message translates to:
  /// **'Good evening'**
  String get tasksGoodEvening;

  /// No description provided for @tasksGoodNight.
  ///
  /// In en, this message translates to:
  /// **'Good night'**
  String get tasksGoodNight;

  /// No description provided for @tasksRequiresAttention.
  ///
  /// In en, this message translates to:
  /// **'Requires attention'**
  String get tasksRequiresAttention;

  /// No description provided for @tasksCompleteByEndOfDay.
  ///
  /// In en, this message translates to:
  /// **'Complete by end of day'**
  String get tasksCompleteByEndOfDay;

  /// No description provided for @tasksPlanAhead.
  ///
  /// In en, this message translates to:
  /// **'Plan ahead'**
  String get tasksPlanAhead;

  /// No description provided for @tasksCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get tasksCompleted;

  /// No description provided for @tasksCompletedCount.
  ///
  /// In en, this message translates to:
  /// **'{count} completed'**
  String tasksCompletedCount(int count);

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

  /// No description provided for @tasksUntitled.
  ///
  /// In en, this message translates to:
  /// **'Untitled task'**
  String get tasksUntitled;

  /// No description provided for @taskBoardsTitle.
  ///
  /// In en, this message translates to:
  /// **'Boards'**
  String get taskBoardsTitle;

  /// No description provided for @taskBoardsCreate.
  ///
  /// In en, this message translates to:
  /// **'Create board'**
  String get taskBoardsCreate;

  /// No description provided for @taskBoardsEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit board'**
  String get taskBoardsEdit;

  /// No description provided for @taskBoardsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete board'**
  String get taskBoardsDelete;

  /// No description provided for @taskBoardsDeleteForever.
  ///
  /// In en, this message translates to:
  /// **'Delete forever'**
  String get taskBoardsDeleteForever;

  /// No description provided for @taskBoardsDuplicate.
  ///
  /// In en, this message translates to:
  /// **'Duplicate board'**
  String get taskBoardsDuplicate;

  /// No description provided for @taskBoardsArchive.
  ///
  /// In en, this message translates to:
  /// **'Archive board'**
  String get taskBoardsArchive;

  /// No description provided for @taskBoardsUnarchive.
  ///
  /// In en, this message translates to:
  /// **'Unarchive board'**
  String get taskBoardsUnarchive;

  /// No description provided for @taskBoardsRestore.
  ///
  /// In en, this message translates to:
  /// **'Restore board'**
  String get taskBoardsRestore;

  /// No description provided for @taskBoardsCreated.
  ///
  /// In en, this message translates to:
  /// **'Board created.'**
  String get taskBoardsCreated;

  /// No description provided for @taskBoardsUpdated.
  ///
  /// In en, this message translates to:
  /// **'Board updated.'**
  String get taskBoardsUpdated;

  /// No description provided for @taskBoardsDeleted.
  ///
  /// In en, this message translates to:
  /// **'Board moved to recently deleted.'**
  String get taskBoardsDeleted;

  /// No description provided for @taskBoardsDeletedForever.
  ///
  /// In en, this message translates to:
  /// **'Board permanently deleted.'**
  String get taskBoardsDeletedForever;

  /// No description provided for @taskBoardsDuplicated.
  ///
  /// In en, this message translates to:
  /// **'Board duplicated.'**
  String get taskBoardsDuplicated;

  /// No description provided for @taskBoardsArchived.
  ///
  /// In en, this message translates to:
  /// **'Board archived.'**
  String get taskBoardsArchived;

  /// No description provided for @taskBoardsUnarchived.
  ///
  /// In en, this message translates to:
  /// **'Board unarchived.'**
  String get taskBoardsUnarchived;

  /// No description provided for @taskBoardsRestored.
  ///
  /// In en, this message translates to:
  /// **'Board restored.'**
  String get taskBoardsRestored;

  /// No description provided for @taskBoardsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load boards right now'**
  String get taskBoardsLoadError;

  /// No description provided for @taskBoardsNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Board name'**
  String get taskBoardsNameLabel;

  /// No description provided for @taskBoardsNamePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Untitled board'**
  String get taskBoardsNamePlaceholder;

  /// No description provided for @taskBoardsNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Board name is required'**
  String get taskBoardsNameRequired;

  /// No description provided for @taskBoardsIconLabel.
  ///
  /// In en, this message translates to:
  /// **'Board icon'**
  String get taskBoardsIconLabel;

  /// No description provided for @taskBoardsIconPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Select icon'**
  String get taskBoardsIconPlaceholder;

  /// No description provided for @taskBoardsIconPickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Select board icon'**
  String get taskBoardsIconPickerTitle;

  /// No description provided for @taskBoardsIconPickerSearch.
  ///
  /// In en, this message translates to:
  /// **'Search icons'**
  String get taskBoardsIconPickerSearch;

  /// No description provided for @taskBoardsIconPickerEmpty.
  ///
  /// In en, this message translates to:
  /// **'No icons found'**
  String get taskBoardsIconPickerEmpty;

  /// No description provided for @taskBoardsAccessDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Access restricted'**
  String get taskBoardsAccessDeniedTitle;

  /// No description provided for @taskBoardsAccessDeniedDescription.
  ///
  /// In en, this message translates to:
  /// **'You need project management permission in this workspace to manage task boards.'**
  String get taskBoardsAccessDeniedDescription;

  /// No description provided for @taskBoardsFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get taskBoardsFilterAll;

  /// No description provided for @taskBoardsFilterActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get taskBoardsFilterActive;

  /// No description provided for @taskBoardsFilterArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get taskBoardsFilterArchived;

  /// No description provided for @taskBoardsFilterRecentlyDeleted.
  ///
  /// In en, this message translates to:
  /// **'Recently deleted'**
  String get taskBoardsFilterRecentlyDeleted;

  /// No description provided for @taskBoardsPageSize.
  ///
  /// In en, this message translates to:
  /// **'Page size'**
  String get taskBoardsPageSize;

  /// No description provided for @taskBoardsPageSizeOption.
  ///
  /// In en, this message translates to:
  /// **'{count} items'**
  String taskBoardsPageSizeOption(int count);

  /// No description provided for @taskBoardsPageInfo.
  ///
  /// In en, this message translates to:
  /// **'Page {current} of {total}'**
  String taskBoardsPageInfo(int current, int total);

  /// No description provided for @taskBoardsListsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} list} other{{count} lists}}'**
  String taskBoardsListsCount(int count);

  /// No description provided for @taskBoardsTasksCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} task} other{{count} tasks}}'**
  String taskBoardsTasksCount(int count);

  /// No description provided for @taskBoardsCreatedAt.
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get taskBoardsCreatedAt;

  /// No description provided for @taskBoardsRecentlyDeleted.
  ///
  /// In en, this message translates to:
  /// **'Recently deleted'**
  String get taskBoardsRecentlyDeleted;

  /// No description provided for @taskBoardsDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Move this board to recently deleted?'**
  String get taskBoardsDeleteConfirm;

  /// No description provided for @taskBoardsDeleteForeverConfirm.
  ///
  /// In en, this message translates to:
  /// **'Permanently delete this board? This action cannot be undone.'**
  String get taskBoardsDeleteForeverConfirm;

  /// No description provided for @taskBoardsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No boards yet'**
  String get taskBoardsEmptyTitle;

  /// No description provided for @taskBoardsEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create your first board to organize tasks.'**
  String get taskBoardsEmptyDescription;

  /// No description provided for @taskBoardsEmptyArchivedTitle.
  ///
  /// In en, this message translates to:
  /// **'No archived boards'**
  String get taskBoardsEmptyArchivedTitle;

  /// No description provided for @taskBoardsEmptyArchivedDescription.
  ///
  /// In en, this message translates to:
  /// **'Archived boards will appear here.'**
  String get taskBoardsEmptyArchivedDescription;

  /// No description provided for @taskBoardsEmptyDeletedTitle.
  ///
  /// In en, this message translates to:
  /// **'No recently deleted boards'**
  String get taskBoardsEmptyDeletedTitle;

  /// No description provided for @taskBoardsEmptyDeletedDescription.
  ///
  /// In en, this message translates to:
  /// **'Deleted boards will appear here before permanent removal.'**
  String get taskBoardsEmptyDeletedDescription;

  /// No description provided for @taskBoardDetailLoadError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load board details right now'**
  String get taskBoardDetailLoadError;

  /// No description provided for @taskBoardDetailUntitledBoard.
  ///
  /// In en, this message translates to:
  /// **'Untitled board'**
  String get taskBoardDetailUntitledBoard;

  /// No description provided for @taskBoardDetailUntitledList.
  ///
  /// In en, this message translates to:
  /// **'Untitled list'**
  String get taskBoardDetailUntitledList;

  /// No description provided for @taskBoardDetailUntitledTask.
  ///
  /// In en, this message translates to:
  /// **'Untitled task'**
  String get taskBoardDetailUntitledTask;

  /// No description provided for @taskBoardDetailListView.
  ///
  /// In en, this message translates to:
  /// **'List'**
  String get taskBoardDetailListView;

  /// No description provided for @taskBoardDetailKanbanView.
  ///
  /// In en, this message translates to:
  /// **'Kanban'**
  String get taskBoardDetailKanbanView;

  /// No description provided for @taskBoardDetailTimelineView.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get taskBoardDetailTimelineView;

  /// No description provided for @taskBoardDetailSearchTitle.
  ///
  /// In en, this message translates to:
  /// **'Search tasks'**
  String get taskBoardDetailSearchTitle;

  /// No description provided for @taskBoardDetailSearchPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Search tasks'**
  String get taskBoardDetailSearchPlaceholder;

  /// No description provided for @taskBoardDetailSearchDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get taskBoardDetailSearchDone;

  /// No description provided for @taskBoardDetailNoListsTitle.
  ///
  /// In en, this message translates to:
  /// **'No lists yet'**
  String get taskBoardDetailNoListsTitle;

  /// No description provided for @taskBoardDetailNoListsDescription.
  ///
  /// In en, this message translates to:
  /// **'Create a list to start organizing tasks in this board.'**
  String get taskBoardDetailNoListsDescription;

  /// No description provided for @taskBoardDetailNoTasksInList.
  ///
  /// In en, this message translates to:
  /// **'No tasks in this list'**
  String get taskBoardDetailNoTasksInList;

  /// No description provided for @taskBoardDetailNoMatchingTasks.
  ///
  /// In en, this message translates to:
  /// **'No tasks match your search.'**
  String get taskBoardDetailNoMatchingTasks;

  /// No description provided for @taskBoardDetailTimelineEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No scheduled tasks yet'**
  String get taskBoardDetailTimelineEmptyTitle;

  /// No description provided for @taskBoardDetailTimelineEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Add start and end dates to tasks to place them on the timeline.'**
  String get taskBoardDetailTimelineEmptyDescription;

  /// No description provided for @taskBoardDetailTimelineUnscheduledTitle.
  ///
  /// In en, this message translates to:
  /// **'Unscheduled tasks'**
  String get taskBoardDetailTimelineUnscheduledTitle;

  /// No description provided for @taskBoardDetailTaskActions.
  ///
  /// In en, this message translates to:
  /// **'Task actions'**
  String get taskBoardDetailTaskActions;

  /// No description provided for @taskBoardDetailMoveTask.
  ///
  /// In en, this message translates to:
  /// **'Move task'**
  String get taskBoardDetailMoveTask;

  /// No description provided for @taskBoardDetailTaskMoved.
  ///
  /// In en, this message translates to:
  /// **'Task moved.'**
  String get taskBoardDetailTaskMoved;

  /// No description provided for @taskBoardDetailCreateTask.
  ///
  /// In en, this message translates to:
  /// **'Create task'**
  String get taskBoardDetailCreateTask;

  /// No description provided for @taskBoardDetailEditTask.
  ///
  /// In en, this message translates to:
  /// **'Edit task'**
  String get taskBoardDetailEditTask;

  /// No description provided for @taskBoardDetailTaskTitleLabel.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get taskBoardDetailTaskTitleLabel;

  /// No description provided for @taskBoardDetailTaskTitleHint.
  ///
  /// In en, this message translates to:
  /// **'Untitled task'**
  String get taskBoardDetailTaskTitleHint;

  /// No description provided for @taskBoardDetailTaskTitleRequired.
  ///
  /// In en, this message translates to:
  /// **'Task title is required'**
  String get taskBoardDetailTaskTitleRequired;

  /// No description provided for @taskBoardDetailTaskDescriptionLabel.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get taskBoardDetailTaskDescriptionLabel;

  /// No description provided for @taskBoardDetailTaskEditDescription.
  ///
  /// In en, this message translates to:
  /// **'Edit description'**
  String get taskBoardDetailTaskEditDescription;

  /// No description provided for @taskBoardDetailTaskDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Add description'**
  String get taskBoardDetailTaskDescriptionHint;

  /// No description provided for @taskBoardDetailTaskDescriptionComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Description editing is coming soon on mobile.'**
  String get taskBoardDetailTaskDescriptionComingSoon;

  /// No description provided for @taskBoardDetailTaskDescriptionDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get taskBoardDetailTaskDescriptionDone;

  /// No description provided for @taskBoardDetailTaskDescriptionPersonalOnly.
  ///
  /// In en, this message translates to:
  /// **'Description editing is currently available only in personal workspaces.'**
  String get taskBoardDetailTaskDescriptionPersonalOnly;

  /// No description provided for @taskBoardDetailTaskDescriptionImageSourceTitle.
  ///
  /// In en, this message translates to:
  /// **'Add image'**
  String get taskBoardDetailTaskDescriptionImageSourceTitle;

  /// No description provided for @taskBoardDetailTaskDescriptionImageSourceCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get taskBoardDetailTaskDescriptionImageSourceCamera;

  /// No description provided for @taskBoardDetailTaskDescriptionImageSourceGallery.
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get taskBoardDetailTaskDescriptionImageSourceGallery;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarBlockquote.
  ///
  /// In en, this message translates to:
  /// **'Block quote'**
  String get taskBoardDetailTaskDescriptionToolbarBlockquote;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarBold.
  ///
  /// In en, this message translates to:
  /// **'Bold'**
  String get taskBoardDetailTaskDescriptionToolbarBold;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarBulletList.
  ///
  /// In en, this message translates to:
  /// **'Bullet list'**
  String get taskBoardDetailTaskDescriptionToolbarBulletList;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarCodeBlock.
  ///
  /// In en, this message translates to:
  /// **'Code block'**
  String get taskBoardDetailTaskDescriptionToolbarCodeBlock;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarHeading1.
  ///
  /// In en, this message translates to:
  /// **'Heading 1'**
  String get taskBoardDetailTaskDescriptionToolbarHeading1;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarHeading2.
  ///
  /// In en, this message translates to:
  /// **'Heading 2'**
  String get taskBoardDetailTaskDescriptionToolbarHeading2;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarHeading3.
  ///
  /// In en, this message translates to:
  /// **'Heading 3'**
  String get taskBoardDetailTaskDescriptionToolbarHeading3;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarHighlight.
  ///
  /// In en, this message translates to:
  /// **'Highlight'**
  String get taskBoardDetailTaskDescriptionToolbarHighlight;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarInlineCode.
  ///
  /// In en, this message translates to:
  /// **'Inline code'**
  String get taskBoardDetailTaskDescriptionToolbarInlineCode;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarInsertImage.
  ///
  /// In en, this message translates to:
  /// **'Insert image'**
  String get taskBoardDetailTaskDescriptionToolbarInsertImage;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarItalic.
  ///
  /// In en, this message translates to:
  /// **'Italic'**
  String get taskBoardDetailTaskDescriptionToolbarItalic;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarOrderedList.
  ///
  /// In en, this message translates to:
  /// **'Ordered list'**
  String get taskBoardDetailTaskDescriptionToolbarOrderedList;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarStrikethrough.
  ///
  /// In en, this message translates to:
  /// **'Strikethrough'**
  String get taskBoardDetailTaskDescriptionToolbarStrikethrough;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarSubscript.
  ///
  /// In en, this message translates to:
  /// **'Subscript'**
  String get taskBoardDetailTaskDescriptionToolbarSubscript;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarSuperscript.
  ///
  /// In en, this message translates to:
  /// **'Superscript'**
  String get taskBoardDetailTaskDescriptionToolbarSuperscript;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarTaskList.
  ///
  /// In en, this message translates to:
  /// **'Task list'**
  String get taskBoardDetailTaskDescriptionToolbarTaskList;

  /// No description provided for @taskBoardDetailTaskDescriptionTableAddColumn.
  ///
  /// In en, this message translates to:
  /// **'Add column'**
  String get taskBoardDetailTaskDescriptionTableAddColumn;

  /// No description provided for @taskBoardDetailTaskDescriptionTableAddRow.
  ///
  /// In en, this message translates to:
  /// **'Add row'**
  String get taskBoardDetailTaskDescriptionTableAddRow;

  /// No description provided for @taskBoardDetailTaskDescriptionTableRemoveColumn.
  ///
  /// In en, this message translates to:
  /// **'Remove column'**
  String get taskBoardDetailTaskDescriptionTableRemoveColumn;

  /// No description provided for @taskBoardDetailTaskDescriptionTableRemoveRow.
  ///
  /// In en, this message translates to:
  /// **'Remove row'**
  String get taskBoardDetailTaskDescriptionTableRemoveRow;

  /// No description provided for @taskBoardDetailTaskDescriptionToolbarUnderline.
  ///
  /// In en, this message translates to:
  /// **'Underline'**
  String get taskBoardDetailTaskDescriptionToolbarUnderline;

  /// No description provided for @taskBoardDetailTaskListLabel.
  ///
  /// In en, this message translates to:
  /// **'List'**
  String get taskBoardDetailTaskListLabel;

  /// No description provided for @taskBoardDetailTaskListSelect.
  ///
  /// In en, this message translates to:
  /// **'Choose list'**
  String get taskBoardDetailTaskListSelect;

  /// No description provided for @taskBoardDetailPriority.
  ///
  /// In en, this message translates to:
  /// **'Priority'**
  String get taskBoardDetailPriority;

  /// No description provided for @taskBoardDetailTaskDates.
  ///
  /// In en, this message translates to:
  /// **'Dates'**
  String get taskBoardDetailTaskDates;

  /// No description provided for @taskBoardDetailTaskStartDate.
  ///
  /// In en, this message translates to:
  /// **'Start date'**
  String get taskBoardDetailTaskStartDate;

  /// No description provided for @taskBoardDetailTaskEndDate.
  ///
  /// In en, this message translates to:
  /// **'End date'**
  String get taskBoardDetailTaskEndDate;

  /// No description provided for @taskBoardDetailTaskEstimation.
  ///
  /// In en, this message translates to:
  /// **'Estimation'**
  String get taskBoardDetailTaskEstimation;

  /// No description provided for @taskBoardDetailTaskEstimationNone.
  ///
  /// In en, this message translates to:
  /// **'No estimate'**
  String get taskBoardDetailTaskEstimationNone;

  /// No description provided for @taskBoardDetailTaskAssignees.
  ///
  /// In en, this message translates to:
  /// **'Assignees'**
  String get taskBoardDetailTaskAssignees;

  /// No description provided for @taskBoardDetailTaskLabels.
  ///
  /// In en, this message translates to:
  /// **'Labels'**
  String get taskBoardDetailTaskLabels;

  /// No description provided for @taskBoardDetailTaskProjects.
  ///
  /// In en, this message translates to:
  /// **'Projects'**
  String get taskBoardDetailTaskProjects;

  /// No description provided for @taskBoardDetailTaskSelectAssignees.
  ///
  /// In en, this message translates to:
  /// **'Select assignees'**
  String get taskBoardDetailTaskSelectAssignees;

  /// No description provided for @taskBoardDetailTaskSelectLabels.
  ///
  /// In en, this message translates to:
  /// **'Select labels'**
  String get taskBoardDetailTaskSelectLabels;

  /// No description provided for @taskBoardDetailTaskSelectProjects.
  ///
  /// In en, this message translates to:
  /// **'Select projects'**
  String get taskBoardDetailTaskSelectProjects;

  /// No description provided for @taskBoardDetailEditorDetailsTab.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get taskBoardDetailEditorDetailsTab;

  /// No description provided for @taskBoardDetailEditorRelationshipsTab.
  ///
  /// In en, this message translates to:
  /// **'Relationships'**
  String get taskBoardDetailEditorRelationshipsTab;

  /// No description provided for @taskBoardDetailParentTask.
  ///
  /// In en, this message translates to:
  /// **'Parent task'**
  String get taskBoardDetailParentTask;

  /// No description provided for @taskBoardDetailChildTasks.
  ///
  /// In en, this message translates to:
  /// **'Child tasks'**
  String get taskBoardDetailChildTasks;

  /// No description provided for @taskBoardDetailBlockedBy.
  ///
  /// In en, this message translates to:
  /// **'Blocked by'**
  String get taskBoardDetailBlockedBy;

  /// No description provided for @taskBoardDetailBlocking.
  ///
  /// In en, this message translates to:
  /// **'Blocking'**
  String get taskBoardDetailBlocking;

  /// No description provided for @taskBoardDetailRelatedTasks.
  ///
  /// In en, this message translates to:
  /// **'Related tasks'**
  String get taskBoardDetailRelatedTasks;

  /// No description provided for @taskBoardDetailAddParentTask.
  ///
  /// In en, this message translates to:
  /// **'Add parent task'**
  String get taskBoardDetailAddParentTask;

  /// No description provided for @taskBoardDetailAddChildTask.
  ///
  /// In en, this message translates to:
  /// **'Add child task'**
  String get taskBoardDetailAddChildTask;

  /// No description provided for @taskBoardDetailAddBlockedByTask.
  ///
  /// In en, this message translates to:
  /// **'Add blocker'**
  String get taskBoardDetailAddBlockedByTask;

  /// No description provided for @taskBoardDetailAddBlockingTask.
  ///
  /// In en, this message translates to:
  /// **'Add blocked task'**
  String get taskBoardDetailAddBlockingTask;

  /// No description provided for @taskBoardDetailAddRelatedTask.
  ///
  /// In en, this message translates to:
  /// **'Add related task'**
  String get taskBoardDetailAddRelatedTask;

  /// No description provided for @taskBoardDetailOpenRelatedTask.
  ///
  /// In en, this message translates to:
  /// **'Open related task'**
  String get taskBoardDetailOpenRelatedTask;

  /// No description provided for @taskBoardDetailRemoveRelationship.
  ///
  /// In en, this message translates to:
  /// **'Remove relationship'**
  String get taskBoardDetailRemoveRelationship;

  /// No description provided for @taskBoardDetailUnableToOpenLinkedTask.
  ///
  /// In en, this message translates to:
  /// **'This linked task can\'t be opened from here.'**
  String get taskBoardDetailUnableToOpenLinkedTask;

  /// No description provided for @taskBoardDetailSelectTask.
  ///
  /// In en, this message translates to:
  /// **'Select task'**
  String get taskBoardDetailSelectTask;

  /// No description provided for @taskBoardDetailSearchTasks.
  ///
  /// In en, this message translates to:
  /// **'Search tasks'**
  String get taskBoardDetailSearchTasks;

  /// No description provided for @taskBoardDetailNoAvailableRelationshipTasks.
  ///
  /// In en, this message translates to:
  /// **'No available tasks for this relationship.'**
  String get taskBoardDetailNoAvailableRelationshipTasks;

  /// No description provided for @taskBoardDetailRelationshipAdded.
  ///
  /// In en, this message translates to:
  /// **'Relationship added.'**
  String get taskBoardDetailRelationshipAdded;

  /// No description provided for @taskBoardDetailRelationshipRemoved.
  ///
  /// In en, this message translates to:
  /// **'Relationship removed.'**
  String get taskBoardDetailRelationshipRemoved;

  /// No description provided for @taskBoardDetailNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get taskBoardDetailNone;

  /// No description provided for @taskBoardDetailNoDate.
  ///
  /// In en, this message translates to:
  /// **'No date'**
  String get taskBoardDetailNoDate;

  /// No description provided for @taskBoardDetailDueAt.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String taskBoardDetailDueAt(String date);

  /// No description provided for @taskBoardDetailStartsAt.
  ///
  /// In en, this message translates to:
  /// **'Starts {date}'**
  String taskBoardDetailStartsAt(String date);

  /// No description provided for @taskBoardDetailOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get taskBoardDetailOverdue;

  /// No description provided for @taskBoardDetailToday.
  ///
  /// In en, this message translates to:
  /// **'today'**
  String get taskBoardDetailToday;

  /// No description provided for @taskBoardDetailTomorrow.
  ///
  /// In en, this message translates to:
  /// **'tomorrow'**
  String get taskBoardDetailTomorrow;

  /// No description provided for @taskBoardDetailYesterday.
  ///
  /// In en, this message translates to:
  /// **'yesterday'**
  String get taskBoardDetailYesterday;

  /// No description provided for @taskBoardDetailInDays.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{in {count} day} other{in {count} days}}'**
  String taskBoardDetailInDays(int count);

  /// No description provided for @taskBoardDetailDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day ago} other{{count} days ago}}'**
  String taskBoardDetailDaysAgo(int count);

  /// No description provided for @taskBoardDetailInvalidDateRange.
  ///
  /// In en, this message translates to:
  /// **'End date must be on or after start date'**
  String get taskBoardDetailInvalidDateRange;

  /// No description provided for @taskBoardDetailTaskSaved.
  ///
  /// In en, this message translates to:
  /// **'Task updated.'**
  String get taskBoardDetailTaskSaved;

  /// No description provided for @taskBoardDetailTaskCreated.
  ///
  /// In en, this message translates to:
  /// **'Task created.'**
  String get taskBoardDetailTaskCreated;

  /// No description provided for @taskBoardDetailTaskDeleted.
  ///
  /// In en, this message translates to:
  /// **'Task deleted.'**
  String get taskBoardDetailTaskDeleted;

  /// No description provided for @taskBoardDetailTaskDeletedForever.
  ///
  /// In en, this message translates to:
  /// **'Task permanently deleted.'**
  String get taskBoardDetailTaskDeletedForever;

  /// No description provided for @taskBoardDetailTaskRestored.
  ///
  /// In en, this message translates to:
  /// **'Task restored.'**
  String get taskBoardDetailTaskRestored;

  /// No description provided for @taskBoardDetailRecycleBin.
  ///
  /// In en, this message translates to:
  /// **'Recycle Bin'**
  String get taskBoardDetailRecycleBin;

  /// No description provided for @taskBoardDetailRecycleBinDescription.
  ///
  /// In en, this message translates to:
  /// **'Deleted tasks from this board. Select tasks to restore or permanently delete them.'**
  String get taskBoardDetailRecycleBinDescription;

  /// No description provided for @taskBoardDetailRecycleBinEmpty.
  ///
  /// In en, this message translates to:
  /// **'No deleted tasks'**
  String get taskBoardDetailRecycleBinEmpty;

  /// No description provided for @taskBoardDetailRecycleBinEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Deleted tasks will appear here.'**
  String get taskBoardDetailRecycleBinEmptyHint;

  /// No description provided for @taskBoardDetailSelectAllTasks.
  ///
  /// In en, this message translates to:
  /// **'Select all tasks'**
  String get taskBoardDetailSelectAllTasks;

  /// No description provided for @taskBoardDetailDeletedTasksCount.
  ///
  /// In en, this message translates to:
  /// **'{count} deleted task(s)'**
  String taskBoardDetailDeletedTasksCount(Object count);

  /// No description provided for @taskBoardDetailSelectedCount.
  ///
  /// In en, this message translates to:
  /// **'{selected} of {total} selected'**
  String taskBoardDetailSelectedCount(Object selected, Object total);

  /// No description provided for @taskBoardDetailRestoreTasks.
  ///
  /// In en, this message translates to:
  /// **'Restore ({count})'**
  String taskBoardDetailRestoreTasks(Object count);

  /// No description provided for @taskBoardDetailDeleteTasks.
  ///
  /// In en, this message translates to:
  /// **'Delete ({count})'**
  String taskBoardDetailDeleteTasks(Object count);

  /// No description provided for @taskBoardDetailFromList.
  ///
  /// In en, this message translates to:
  /// **'from: {list}'**
  String taskBoardDetailFromList(Object list);

  /// No description provided for @taskBoardDetailDeletedAgo.
  ///
  /// In en, this message translates to:
  /// **'Deleted {time}'**
  String taskBoardDetailDeletedAgo(Object time);

  /// No description provided for @taskBoardDetailPriorityCritical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get taskBoardDetailPriorityCritical;

  /// No description provided for @taskBoardDetailPriorityHigh.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get taskBoardDetailPriorityHigh;

  /// No description provided for @taskBoardDetailPriorityNormal.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get taskBoardDetailPriorityNormal;

  /// No description provided for @taskBoardDetailPriorityLow.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get taskBoardDetailPriorityLow;

  /// No description provided for @taskBoardDetailPoints.
  ///
  /// In en, this message translates to:
  /// **'{count} pts'**
  String taskBoardDetailPoints(Object count);

  /// No description provided for @taskBoardDetailNProjects.
  ///
  /// In en, this message translates to:
  /// **'{count} projects'**
  String taskBoardDetailNProjects(Object count);

  /// No description provided for @taskBoardDetailNoMoveTargets.
  ///
  /// In en, this message translates to:
  /// **'No other lists available for moving this task.'**
  String get taskBoardDetailNoMoveTargets;

  /// No description provided for @taskBoardDetailBoardActions.
  ///
  /// In en, this message translates to:
  /// **'Board actions'**
  String get taskBoardDetailBoardActions;

  /// No description provided for @taskBoardDetailManageBoardLayout.
  ///
  /// In en, this message translates to:
  /// **'Manage board layout'**
  String get taskBoardDetailManageBoardLayout;

  /// No description provided for @taskBoardDetailManageBoardLayoutDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage board columns by status and reorder lists within each status.'**
  String get taskBoardDetailManageBoardLayoutDescription;

  /// No description provided for @taskBoardDetailRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh board'**
  String get taskBoardDetailRefresh;

  /// No description provided for @taskBoardDetailRenameBoard.
  ///
  /// In en, this message translates to:
  /// **'Rename board'**
  String get taskBoardDetailRenameBoard;

  /// No description provided for @taskBoardDetailBoardRenamed.
  ///
  /// In en, this message translates to:
  /// **'Board renamed.'**
  String get taskBoardDetailBoardRenamed;

  /// No description provided for @taskBoardDetailCreateList.
  ///
  /// In en, this message translates to:
  /// **'Create list'**
  String get taskBoardDetailCreateList;

  /// No description provided for @taskBoardDetailEditList.
  ///
  /// In en, this message translates to:
  /// **'Edit list'**
  String get taskBoardDetailEditList;

  /// No description provided for @taskBoardDetailRenameList.
  ///
  /// In en, this message translates to:
  /// **'Rename list'**
  String get taskBoardDetailRenameList;

  /// No description provided for @taskBoardDetailListActions.
  ///
  /// In en, this message translates to:
  /// **'List actions'**
  String get taskBoardDetailListActions;

  /// No description provided for @taskBoardDetailListCreated.
  ///
  /// In en, this message translates to:
  /// **'List created.'**
  String get taskBoardDetailListCreated;

  /// No description provided for @taskBoardDetailListRenamed.
  ///
  /// In en, this message translates to:
  /// **'List renamed.'**
  String get taskBoardDetailListRenamed;

  /// No description provided for @taskBoardDetailListUpdated.
  ///
  /// In en, this message translates to:
  /// **'List updated.'**
  String get taskBoardDetailListUpdated;

  /// No description provided for @taskBoardDetailListDeleted.
  ///
  /// In en, this message translates to:
  /// **'List deleted.'**
  String get taskBoardDetailListDeleted;

  /// No description provided for @taskBoardDetailDeleteList.
  ///
  /// In en, this message translates to:
  /// **'Delete list'**
  String get taskBoardDetailDeleteList;

  /// No description provided for @taskBoardDetailDeleteListTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete list?'**
  String get taskBoardDetailDeleteListTitle;

  /// No description provided for @taskBoardDetailDeleteListDescription.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete this list? All tasks in this list will also be deleted. This action cannot be undone.'**
  String get taskBoardDetailDeleteListDescription;

  /// No description provided for @taskBoardDetailDeleteTask.
  ///
  /// In en, this message translates to:
  /// **'Delete task'**
  String get taskBoardDetailDeleteTask;

  /// No description provided for @taskBoardDetailDeleteTaskForever.
  ///
  /// In en, this message translates to:
  /// **'Delete task forever'**
  String get taskBoardDetailDeleteTaskForever;

  /// No description provided for @taskBoardDetailDeleteTaskForeverDescription.
  ///
  /// In en, this message translates to:
  /// **'Permanently delete this task from the recycle bin? This action cannot be undone.'**
  String get taskBoardDetailDeleteTaskForeverDescription;

  /// No description provided for @taskBoardDetailDeleteForever.
  ///
  /// In en, this message translates to:
  /// **'Delete forever'**
  String get taskBoardDetailDeleteForever;

  /// No description provided for @taskBoardDetailDeleteTaskTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete task?'**
  String get taskBoardDetailDeleteTaskTitle;

  /// No description provided for @taskBoardDetailDeleteTaskDescription.
  ///
  /// In en, this message translates to:
  /// **'Move this task to the recycle bin?'**
  String get taskBoardDetailDeleteTaskDescription;

  /// No description provided for @taskBoardDetailMoveListToStatus.
  ///
  /// In en, this message translates to:
  /// **'Move list to status'**
  String get taskBoardDetailMoveListToStatus;

  /// No description provided for @taskBoardDetailCannotMoveToClosedStatus.
  ///
  /// In en, this message translates to:
  /// **'Cannot move lists to or from closed status'**
  String get taskBoardDetailCannotMoveToClosedStatus;

  /// No description provided for @taskBoardDetailCannotCreateMoreClosedLists.
  ///
  /// In en, this message translates to:
  /// **'Only one closed list is allowed per board.'**
  String get taskBoardDetailCannotCreateMoreClosedLists;

  /// No description provided for @taskBoardDetailClosedListCapacityHint.
  ///
  /// In en, this message translates to:
  /// **'1 closed list max'**
  String get taskBoardDetailClosedListCapacityHint;

  /// No description provided for @taskBoardDetailAddNewList.
  ///
  /// In en, this message translates to:
  /// **'Add new list'**
  String get taskBoardDetailAddNewList;

  /// No description provided for @taskBoardDetailNoListsInStatus.
  ///
  /// In en, this message translates to:
  /// **'No lists in this status'**
  String get taskBoardDetailNoListsInStatus;

  /// No description provided for @taskBoardDetailListsReordered.
  ///
  /// In en, this message translates to:
  /// **'Lists reordered.'**
  String get taskBoardDetailListsReordered;

  /// No description provided for @taskBoardDetailMoveListDown.
  ///
  /// In en, this message translates to:
  /// **'Move list down'**
  String get taskBoardDetailMoveListDown;

  /// No description provided for @taskBoardDetailMoveListUp.
  ///
  /// In en, this message translates to:
  /// **'Move list up'**
  String get taskBoardDetailMoveListUp;

  /// No description provided for @taskBoardDetailMovedToStatus.
  ///
  /// In en, this message translates to:
  /// **'Moved to {status}'**
  String taskBoardDetailMovedToStatus(String status);

  /// No description provided for @taskBoardDetailNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Name is required'**
  String get taskBoardDetailNameRequired;

  /// No description provided for @taskBoardDetailListNameLabel.
  ///
  /// In en, this message translates to:
  /// **'List name'**
  String get taskBoardDetailListNameLabel;

  /// No description provided for @taskBoardDetailStatusCategoryLabel.
  ///
  /// In en, this message translates to:
  /// **'Status category'**
  String get taskBoardDetailStatusCategoryLabel;

  /// No description provided for @taskBoardDetailColorLabel.
  ///
  /// In en, this message translates to:
  /// **'Color'**
  String get taskBoardDetailColorLabel;

  /// No description provided for @taskBoardDetailFilters.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get taskBoardDetailFilters;

  /// No description provided for @taskBoardDetailFiltersActive.
  ///
  /// In en, this message translates to:
  /// **'Filters active'**
  String get taskBoardDetailFiltersActive;

  /// No description provided for @taskBoardDetailFilterLists.
  ///
  /// In en, this message translates to:
  /// **'Lists'**
  String get taskBoardDetailFilterLists;

  /// No description provided for @taskBoardDetailFilterStatuses.
  ///
  /// In en, this message translates to:
  /// **'Statuses'**
  String get taskBoardDetailFilterStatuses;

  /// No description provided for @taskBoardDetailFilterAssignees.
  ///
  /// In en, this message translates to:
  /// **'Assignees'**
  String get taskBoardDetailFilterAssignees;

  /// No description provided for @taskBoardDetailFilterLabels.
  ///
  /// In en, this message translates to:
  /// **'Labels'**
  String get taskBoardDetailFilterLabels;

  /// No description provided for @taskBoardDetailFilterProjects.
  ///
  /// In en, this message translates to:
  /// **'Projects'**
  String get taskBoardDetailFilterProjects;

  /// No description provided for @taskBoardDetailNoFilterOptions.
  ///
  /// In en, this message translates to:
  /// **'No options available'**
  String get taskBoardDetailNoFilterOptions;

  /// No description provided for @taskBoardDetailStatusNotStarted.
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get taskBoardDetailStatusNotStarted;

  /// No description provided for @taskBoardDetailStatusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get taskBoardDetailStatusActive;

  /// No description provided for @taskBoardDetailStatusDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get taskBoardDetailStatusDone;

  /// No description provided for @taskBoardDetailStatusClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get taskBoardDetailStatusClosed;

  /// No description provided for @taskBoardDetailStatusDocuments.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get taskBoardDetailStatusDocuments;

  /// No description provided for @taskBoardDetailColorGray.
  ///
  /// In en, this message translates to:
  /// **'Gray'**
  String get taskBoardDetailColorGray;

  /// No description provided for @taskBoardDetailColorRed.
  ///
  /// In en, this message translates to:
  /// **'Red'**
  String get taskBoardDetailColorRed;

  /// No description provided for @taskBoardDetailColorBlue.
  ///
  /// In en, this message translates to:
  /// **'Blue'**
  String get taskBoardDetailColorBlue;

  /// No description provided for @taskBoardDetailColorGreen.
  ///
  /// In en, this message translates to:
  /// **'Green'**
  String get taskBoardDetailColorGreen;

  /// No description provided for @taskBoardDetailColorYellow.
  ///
  /// In en, this message translates to:
  /// **'Yellow'**
  String get taskBoardDetailColorYellow;

  /// No description provided for @taskBoardDetailColorOrange.
  ///
  /// In en, this message translates to:
  /// **'Orange'**
  String get taskBoardDetailColorOrange;

  /// No description provided for @taskBoardDetailColorPurple.
  ///
  /// In en, this message translates to:
  /// **'Purple'**
  String get taskBoardDetailColorPurple;

  /// No description provided for @taskBoardDetailColorPink.
  ///
  /// In en, this message translates to:
  /// **'Pink'**
  String get taskBoardDetailColorPink;

  /// No description provided for @taskBoardDetailColorIndigo.
  ///
  /// In en, this message translates to:
  /// **'Indigo'**
  String get taskBoardDetailColorIndigo;

  /// No description provided for @taskBoardDetailColorCyan.
  ///
  /// In en, this message translates to:
  /// **'Cyan'**
  String get taskBoardDetailColorCyan;

  /// No description provided for @taskBoardDetailClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get taskBoardDetailClearFilters;

  /// No description provided for @taskBoardDetailApplyFilters.
  ///
  /// In en, this message translates to:
  /// **'Apply filters'**
  String get taskBoardDetailApplyFilters;

  /// No description provided for @taskPlanningTitle.
  ///
  /// In en, this message translates to:
  /// **'Planning'**
  String get taskPlanningTitle;

  /// No description provided for @taskEstimatesTitle.
  ///
  /// In en, this message translates to:
  /// **'Estimations'**
  String get taskEstimatesTitle;

  /// No description provided for @taskLabelsTab.
  ///
  /// In en, this message translates to:
  /// **'Labels'**
  String get taskLabelsTab;

  /// No description provided for @taskLabelsCreate.
  ///
  /// In en, this message translates to:
  /// **'Create label'**
  String get taskLabelsCreate;

  /// No description provided for @taskLabelsEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit label'**
  String get taskLabelsEdit;

  /// No description provided for @taskLabelsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete label'**
  String get taskLabelsDelete;

  /// No description provided for @taskLabelsDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this label?'**
  String get taskLabelsDeleteConfirm;

  /// No description provided for @taskLabelsCreated.
  ///
  /// In en, this message translates to:
  /// **'Label created.'**
  String get taskLabelsCreated;

  /// No description provided for @taskLabelsUpdated.
  ///
  /// In en, this message translates to:
  /// **'Label updated.'**
  String get taskLabelsUpdated;

  /// No description provided for @taskLabelsDeleted.
  ///
  /// In en, this message translates to:
  /// **'Label deleted.'**
  String get taskLabelsDeleted;

  /// No description provided for @taskLabelsName.
  ///
  /// In en, this message translates to:
  /// **'Label name'**
  String get taskLabelsName;

  /// No description provided for @taskLabelsNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Label name is required'**
  String get taskLabelsNameRequired;

  /// No description provided for @taskLabelsColorInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid hex color'**
  String get taskLabelsColorInvalid;

  /// No description provided for @taskLabelsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No labels yet'**
  String get taskLabelsEmptyTitle;

  /// No description provided for @taskLabelsEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create labels to tag and organize task work.'**
  String get taskLabelsEmptyDescription;

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

  /// No description provided for @taskEstimatesTypeTshirtStandard.
  ///
  /// In en, this message translates to:
  /// **'T-shirt sizes: -, XS, S, M, L, XL.'**
  String get taskEstimatesTypeTshirtStandard;

  /// No description provided for @taskEstimatesTypeTshirtExtended.
  ///
  /// In en, this message translates to:
  /// **'Extended T-shirt sizes: -, XS, S, M, L, XL, XXL, XXXL.'**
  String get taskEstimatesTypeTshirtExtended;

  /// No description provided for @taskPortfolioTitle.
  ///
  /// In en, this message translates to:
  /// **'Portfolio'**
  String get taskPortfolioTitle;

  /// No description provided for @taskPortfolioProjectsTab.
  ///
  /// In en, this message translates to:
  /// **'Projects'**
  String get taskPortfolioProjectsTab;

  /// No description provided for @taskPortfolioInitiativesTab.
  ///
  /// In en, this message translates to:
  /// **'Initiatives'**
  String get taskPortfolioInitiativesTab;

  /// No description provided for @taskPortfolioAccessDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Access restricted'**
  String get taskPortfolioAccessDeniedTitle;

  /// No description provided for @taskPortfolioAccessDeniedDescription.
  ///
  /// In en, this message translates to:
  /// **'You need project management permission in this workspace to manage projects and initiatives.'**
  String get taskPortfolioAccessDeniedDescription;

  /// No description provided for @taskPortfolioProjectsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No projects yet'**
  String get taskPortfolioProjectsEmptyTitle;

  /// No description provided for @taskPortfolioProjectsEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create your first project to organize work beyond individual tasks.'**
  String get taskPortfolioProjectsEmptyDescription;

  /// No description provided for @taskPortfolioInitiativesEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No initiatives yet'**
  String get taskPortfolioInitiativesEmptyTitle;

  /// No description provided for @taskPortfolioInitiativesEmptyDescription.
  ///
  /// In en, this message translates to:
  /// **'Create an initiative to group related projects under a shared outcome.'**
  String get taskPortfolioInitiativesEmptyDescription;

  /// No description provided for @taskPortfolioNoDescription.
  ///
  /// In en, this message translates to:
  /// **'No description yet'**
  String get taskPortfolioNoDescription;

  /// No description provided for @taskPortfolioProjectTasksLinked.
  ///
  /// In en, this message translates to:
  /// **'tasks linked'**
  String get taskPortfolioProjectTasksLinked;

  /// No description provided for @taskPortfolioProjectCompletedTasks.
  ///
  /// In en, this message translates to:
  /// **'completed'**
  String get taskPortfolioProjectCompletedTasks;

  /// No description provided for @taskPortfolioInitiativeProjectsLinked.
  ///
  /// In en, this message translates to:
  /// **'projects linked'**
  String get taskPortfolioInitiativeProjectsLinked;

  /// No description provided for @taskPortfolioCreateProject.
  ///
  /// In en, this message translates to:
  /// **'Create project'**
  String get taskPortfolioCreateProject;

  /// No description provided for @taskPortfolioEditProject.
  ///
  /// In en, this message translates to:
  /// **'Edit project'**
  String get taskPortfolioEditProject;

  /// No description provided for @taskPortfolioDeleteProject.
  ///
  /// In en, this message translates to:
  /// **'Delete project'**
  String get taskPortfolioDeleteProject;

  /// No description provided for @taskPortfolioDeleteProjectConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this project?'**
  String get taskPortfolioDeleteProjectConfirm;

  /// No description provided for @taskPortfolioProjectCreated.
  ///
  /// In en, this message translates to:
  /// **'Project created.'**
  String get taskPortfolioProjectCreated;

  /// No description provided for @taskPortfolioProjectUpdated.
  ///
  /// In en, this message translates to:
  /// **'Project updated.'**
  String get taskPortfolioProjectUpdated;

  /// No description provided for @taskPortfolioProjectDeleted.
  ///
  /// In en, this message translates to:
  /// **'Project deleted.'**
  String get taskPortfolioProjectDeleted;

  /// No description provided for @taskPortfolioProjectName.
  ///
  /// In en, this message translates to:
  /// **'Project name'**
  String get taskPortfolioProjectName;

  /// No description provided for @taskPortfolioProjectNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Project name is required'**
  String get taskPortfolioProjectNameRequired;

  /// No description provided for @taskPortfolioProjectDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Describe the project goals'**
  String get taskPortfolioProjectDescriptionHint;

  /// No description provided for @taskPortfolioProjectStatus.
  ///
  /// In en, this message translates to:
  /// **'Project status'**
  String get taskPortfolioProjectStatus;

  /// No description provided for @taskPortfolioProjectPriority.
  ///
  /// In en, this message translates to:
  /// **'Priority'**
  String get taskPortfolioProjectPriority;

  /// No description provided for @taskPortfolioProjectHealth.
  ///
  /// In en, this message translates to:
  /// **'Health status'**
  String get taskPortfolioProjectHealth;

  /// No description provided for @taskPortfolioProjectLead.
  ///
  /// In en, this message translates to:
  /// **'Project lead'**
  String get taskPortfolioProjectLead;

  /// No description provided for @taskPortfolioProjectNoHealth.
  ///
  /// In en, this message translates to:
  /// **'No health status'**
  String get taskPortfolioProjectNoHealth;

  /// No description provided for @taskPortfolioProjectNoLead.
  ///
  /// In en, this message translates to:
  /// **'No lead assigned'**
  String get taskPortfolioProjectNoLead;

  /// No description provided for @taskPortfolioProjectStartDate.
  ///
  /// In en, this message translates to:
  /// **'Start date'**
  String get taskPortfolioProjectStartDate;

  /// No description provided for @taskPortfolioProjectEndDate.
  ///
  /// In en, this message translates to:
  /// **'End date'**
  String get taskPortfolioProjectEndDate;

  /// No description provided for @taskPortfolioProjectArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get taskPortfolioProjectArchived;

  /// No description provided for @taskPortfolioProjectArchivedHint.
  ///
  /// In en, this message translates to:
  /// **'Hide this project from active planning views.'**
  String get taskPortfolioProjectArchivedHint;

  /// No description provided for @taskPortfolioPickDate.
  ///
  /// In en, this message translates to:
  /// **'Pick date'**
  String get taskPortfolioPickDate;

  /// No description provided for @taskPortfolioClearSelection.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get taskPortfolioClearSelection;

  /// No description provided for @taskPortfolioProjectStatusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get taskPortfolioProjectStatusActive;

  /// No description provided for @taskPortfolioProjectStatusBacklog.
  ///
  /// In en, this message translates to:
  /// **'Backlog'**
  String get taskPortfolioProjectStatusBacklog;

  /// No description provided for @taskPortfolioProjectStatusPlanned.
  ///
  /// In en, this message translates to:
  /// **'Planned'**
  String get taskPortfolioProjectStatusPlanned;

  /// No description provided for @taskPortfolioProjectStatusInProgress.
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get taskPortfolioProjectStatusInProgress;

  /// No description provided for @taskPortfolioProjectStatusInReview.
  ///
  /// In en, this message translates to:
  /// **'In review'**
  String get taskPortfolioProjectStatusInReview;

  /// No description provided for @taskPortfolioProjectStatusInTesting.
  ///
  /// In en, this message translates to:
  /// **'In testing'**
  String get taskPortfolioProjectStatusInTesting;

  /// No description provided for @taskPortfolioProjectStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get taskPortfolioProjectStatusCompleted;

  /// No description provided for @taskPortfolioProjectStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get taskPortfolioProjectStatusCancelled;

  /// No description provided for @taskPortfolioProjectStatusOnHold.
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get taskPortfolioProjectStatusOnHold;

  /// No description provided for @taskPortfolioProjectPriorityCritical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get taskPortfolioProjectPriorityCritical;

  /// No description provided for @taskPortfolioProjectPriorityHigh.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get taskPortfolioProjectPriorityHigh;

  /// No description provided for @taskPortfolioProjectPriorityNormal.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get taskPortfolioProjectPriorityNormal;

  /// No description provided for @taskPortfolioProjectPriorityLow.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get taskPortfolioProjectPriorityLow;

  /// No description provided for @taskPortfolioCreateInitiative.
  ///
  /// In en, this message translates to:
  /// **'Create initiative'**
  String get taskPortfolioCreateInitiative;

  /// No description provided for @taskPortfolioEditInitiative.
  ///
  /// In en, this message translates to:
  /// **'Edit initiative'**
  String get taskPortfolioEditInitiative;

  /// No description provided for @taskPortfolioDeleteInitiative.
  ///
  /// In en, this message translates to:
  /// **'Delete initiative'**
  String get taskPortfolioDeleteInitiative;

  /// No description provided for @taskPortfolioDeleteInitiativeConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this initiative?'**
  String get taskPortfolioDeleteInitiativeConfirm;

  /// No description provided for @taskPortfolioInitiativeCreated.
  ///
  /// In en, this message translates to:
  /// **'Initiative created.'**
  String get taskPortfolioInitiativeCreated;

  /// No description provided for @taskPortfolioInitiativeUpdated.
  ///
  /// In en, this message translates to:
  /// **'Initiative updated.'**
  String get taskPortfolioInitiativeUpdated;

  /// No description provided for @taskPortfolioInitiativeDeleted.
  ///
  /// In en, this message translates to:
  /// **'Initiative deleted.'**
  String get taskPortfolioInitiativeDeleted;

  /// No description provided for @taskPortfolioInitiativeName.
  ///
  /// In en, this message translates to:
  /// **'Initiative name'**
  String get taskPortfolioInitiativeName;

  /// No description provided for @taskPortfolioInitiativeNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Initiative name is required'**
  String get taskPortfolioInitiativeNameRequired;

  /// No description provided for @taskPortfolioInitiativeDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Describe the initiative outcome'**
  String get taskPortfolioInitiativeDescriptionHint;

  /// No description provided for @taskPortfolioInitiativeStatus.
  ///
  /// In en, this message translates to:
  /// **'Initiative status'**
  String get taskPortfolioInitiativeStatus;

  /// No description provided for @taskPortfolioInitiativeStatusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get taskPortfolioInitiativeStatusActive;

  /// No description provided for @taskPortfolioInitiativeStatusCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get taskPortfolioInitiativeStatusCompleted;

  /// No description provided for @taskPortfolioInitiativeStatusOnHold.
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get taskPortfolioInitiativeStatusOnHold;

  /// No description provided for @taskPortfolioInitiativeStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get taskPortfolioInitiativeStatusCancelled;

  /// No description provided for @taskPortfolioManageProjects.
  ///
  /// In en, this message translates to:
  /// **'Manage projects'**
  String get taskPortfolioManageProjects;

  /// No description provided for @taskPortfolioLinkedProjects.
  ///
  /// In en, this message translates to:
  /// **'Linked projects'**
  String get taskPortfolioLinkedProjects;

  /// No description provided for @taskPortfolioNoLinkedProjects.
  ///
  /// In en, this message translates to:
  /// **'No linked projects yet'**
  String get taskPortfolioNoLinkedProjects;

  /// No description provided for @taskPortfolioProjectHealthOnTrack.
  ///
  /// In en, this message translates to:
  /// **'On track'**
  String get taskPortfolioProjectHealthOnTrack;

  /// No description provided for @taskPortfolioProjectHealthAtRisk.
  ///
  /// In en, this message translates to:
  /// **'At risk'**
  String get taskPortfolioProjectHealthAtRisk;

  /// No description provided for @taskPortfolioProjectHealthOffTrack.
  ///
  /// In en, this message translates to:
  /// **'Off track'**
  String get taskPortfolioProjectHealthOffTrack;

  /// No description provided for @taskPortfolioProjectTasksProgress.
  ///
  /// In en, this message translates to:
  /// **'{completed} of {total} tasks'**
  String taskPortfolioProjectTasksProgress(int completed, int total);

  /// No description provided for @taskPortfolioLinkProject.
  ///
  /// In en, this message translates to:
  /// **'Link project'**
  String get taskPortfolioLinkProject;

  /// No description provided for @taskPortfolioNoAvailableProjects.
  ///
  /// In en, this message translates to:
  /// **'Select project'**
  String get taskPortfolioNoAvailableProjects;

  /// No description provided for @taskPortfolioAllProjectsLinked.
  ///
  /// In en, this message translates to:
  /// **'All workspace projects are already linked.'**
  String get taskPortfolioAllProjectsLinked;

  /// No description provided for @taskPortfolioProjectLinked.
  ///
  /// In en, this message translates to:
  /// **'Project linked.'**
  String get taskPortfolioProjectLinked;

  /// No description provided for @taskPortfolioProjectUnlinked.
  ///
  /// In en, this message translates to:
  /// **'Project unlinked.'**
  String get taskPortfolioProjectUnlinked;

  /// No description provided for @taskPortfolioProjectDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Project details'**
  String get taskPortfolioProjectDetailsTitle;

  /// No description provided for @taskPortfolioProjectNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Project not found'**
  String get taskPortfolioProjectNotFoundTitle;

  /// No description provided for @taskPortfolioProjectNotFoundDescription.
  ///
  /// In en, this message translates to:
  /// **'This project is no longer available in the current workspace.'**
  String get taskPortfolioProjectNotFoundDescription;

  /// No description provided for @taskPortfolioProjectTimeline.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get taskPortfolioProjectTimeline;

  /// No description provided for @taskPortfolioProjectTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get taskPortfolioProjectTasks;

  /// No description provided for @taskPortfolioLinkedTasks.
  ///
  /// In en, this message translates to:
  /// **'Linked tasks'**
  String get taskPortfolioLinkedTasks;

  /// No description provided for @taskPortfolioUnlinkTask.
  ///
  /// In en, this message translates to:
  /// **'Unlink task'**
  String get taskPortfolioUnlinkTask;

  /// No description provided for @taskPortfolioProjectStats.
  ///
  /// In en, this message translates to:
  /// **'Project stats'**
  String get taskPortfolioProjectStats;

  /// No description provided for @taskPortfolioNoLinkedTasks.
  ///
  /// In en, this message translates to:
  /// **'No linked tasks yet'**
  String get taskPortfolioNoLinkedTasks;

  /// No description provided for @taskPortfolioLinkTask.
  ///
  /// In en, this message translates to:
  /// **'Link task'**
  String get taskPortfolioLinkTask;

  /// No description provided for @taskPortfolioSearchTasksHint.
  ///
  /// In en, this message translates to:
  /// **'Search tasks'**
  String get taskPortfolioSearchTasksHint;

  /// No description provided for @taskPortfolioNoMatchingTasks.
  ///
  /// In en, this message translates to:
  /// **'No tasks match your search.'**
  String get taskPortfolioNoMatchingTasks;

  /// No description provided for @taskPortfolioSelectTask.
  ///
  /// In en, this message translates to:
  /// **'Select task'**
  String get taskPortfolioSelectTask;

  /// No description provided for @taskPortfolioSelectTaskHint.
  ///
  /// In en, this message translates to:
  /// **'Choose a task'**
  String get taskPortfolioSelectTaskHint;

  /// No description provided for @taskPortfolioNoAvailableTasks.
  ///
  /// In en, this message translates to:
  /// **'All available tasks are already linked to this project.'**
  String get taskPortfolioNoAvailableTasks;

  /// No description provided for @taskPortfolioProjectCompletion.
  ///
  /// In en, this message translates to:
  /// **'Completion'**
  String get taskPortfolioProjectCompletion;

  /// No description provided for @taskPortfolioTaskLinked.
  ///
  /// In en, this message translates to:
  /// **'Task linked.'**
  String get taskPortfolioTaskLinked;

  /// No description provided for @taskPortfolioTaskUnlinked.
  ///
  /// In en, this message translates to:
  /// **'Task unlinked.'**
  String get taskPortfolioTaskUnlinked;

  /// No description provided for @taskPortfolioProjectUpdates.
  ///
  /// In en, this message translates to:
  /// **'Project updates'**
  String get taskPortfolioProjectUpdates;

  /// No description provided for @taskPortfolioUpdatePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Share the latest progress, blockers, or wins...'**
  String get taskPortfolioUpdatePlaceholder;

  /// No description provided for @taskPortfolioPostUpdate.
  ///
  /// In en, this message translates to:
  /// **'Post update'**
  String get taskPortfolioPostUpdate;

  /// No description provided for @taskPortfolioPostingUpdate.
  ///
  /// In en, this message translates to:
  /// **'Posting...'**
  String get taskPortfolioPostingUpdate;

  /// No description provided for @taskPortfolioNoProjectUpdates.
  ///
  /// In en, this message translates to:
  /// **'No updates yet'**
  String get taskPortfolioNoProjectUpdates;

  /// No description provided for @taskPortfolioUnknownUser.
  ///
  /// In en, this message translates to:
  /// **'Unknown user'**
  String get taskPortfolioUnknownUser;

  /// No description provided for @taskPortfolioUpdateEdited.
  ///
  /// In en, this message translates to:
  /// **'Edited'**
  String get taskPortfolioUpdateEdited;

  /// No description provided for @taskPortfolioEditUpdate.
  ///
  /// In en, this message translates to:
  /// **'Edit update'**
  String get taskPortfolioEditUpdate;

  /// No description provided for @taskPortfolioDeleteUpdate.
  ///
  /// In en, this message translates to:
  /// **'Delete update'**
  String get taskPortfolioDeleteUpdate;

  /// No description provided for @taskPortfolioDeleteUpdateConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this update?'**
  String get taskPortfolioDeleteUpdateConfirm;

  /// No description provided for @taskPortfolioUpdateCannotBeEmpty.
  ///
  /// In en, this message translates to:
  /// **'Update content cannot be empty'**
  String get taskPortfolioUpdateCannotBeEmpty;

  /// No description provided for @taskPortfolioUpdatePosted.
  ///
  /// In en, this message translates to:
  /// **'Update posted.'**
  String get taskPortfolioUpdatePosted;

  /// No description provided for @taskPortfolioUpdateSaved.
  ///
  /// In en, this message translates to:
  /// **'Update saved.'**
  String get taskPortfolioUpdateSaved;

  /// No description provided for @taskPortfolioUpdateDeleted.
  ///
  /// In en, this message translates to:
  /// **'Update deleted.'**
  String get taskPortfolioUpdateDeleted;

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

  /// No description provided for @calendarYearView.
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get calendarYearView;

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

  /// No description provided for @inventoryAddCategory.
  ///
  /// In en, this message translates to:
  /// **'Add category'**
  String get inventoryAddCategory;

  /// No description provided for @inventoryAddOwner.
  ///
  /// In en, this message translates to:
  /// **'Add owner'**
  String get inventoryAddOwner;

  /// No description provided for @inventoryAddUnit.
  ///
  /// In en, this message translates to:
  /// **'Add unit'**
  String get inventoryAddUnit;

  /// No description provided for @inventoryAddWarehouse.
  ///
  /// In en, this message translates to:
  /// **'Add warehouse'**
  String get inventoryAddWarehouse;

  /// No description provided for @inventoryAuditEmpty.
  ///
  /// In en, this message translates to:
  /// **'Inventory activity will appear here after products, stock, and sales are updated.'**
  String get inventoryAuditEmpty;

  /// No description provided for @inventoryAuditEventArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get inventoryAuditEventArchived;

  /// No description provided for @inventoryAuditEventCreated.
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get inventoryAuditEventCreated;

  /// No description provided for @inventoryAuditEventDeleted.
  ///
  /// In en, this message translates to:
  /// **'Deleted'**
  String get inventoryAuditEventDeleted;

  /// No description provided for @inventoryAuditEventReactivated.
  ///
  /// In en, this message translates to:
  /// **'Reactivated'**
  String get inventoryAuditEventReactivated;

  /// No description provided for @inventoryAuditEventSaleCreated.
  ///
  /// In en, this message translates to:
  /// **'Sale created'**
  String get inventoryAuditEventSaleCreated;

  /// No description provided for @inventoryAuditEventUpdated.
  ///
  /// In en, this message translates to:
  /// **'Updated'**
  String get inventoryAuditEventUpdated;

  /// No description provided for @inventoryAuditLabel.
  ///
  /// In en, this message translates to:
  /// **'Audit'**
  String get inventoryAuditLabel;

  /// No description provided for @inventoryAuditActorLabel.
  ///
  /// In en, this message translates to:
  /// **'Actor'**
  String get inventoryAuditActorLabel;

  /// No description provided for @inventoryAuditAfter.
  ///
  /// In en, this message translates to:
  /// **'After'**
  String get inventoryAuditAfter;

  /// No description provided for @inventoryAuditBefore.
  ///
  /// In en, this message translates to:
  /// **'Before'**
  String get inventoryAuditBefore;

  /// No description provided for @inventoryAuditChangedFields.
  ///
  /// In en, this message translates to:
  /// **'Changed fields'**
  String get inventoryAuditChangedFields;

  /// No description provided for @inventoryAuditChanges.
  ///
  /// In en, this message translates to:
  /// **'{count} changes'**
  String inventoryAuditChanges(int count);

  /// No description provided for @inventoryAuditRecentSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Follow product, stock, setup, and sale changes across the workspace.'**
  String get inventoryAuditRecentSubtitle;

  /// No description provided for @inventoryAuditRecentTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent activity'**
  String get inventoryAuditRecentTitle;

  /// No description provided for @inventoryAuditNoChanges.
  ///
  /// In en, this message translates to:
  /// **'No field changes'**
  String get inventoryAuditNoChanges;

  /// No description provided for @inventoryAuditOccurredAt.
  ///
  /// In en, this message translates to:
  /// **'Occurred at'**
  String get inventoryAuditOccurredAt;

  /// No description provided for @inventoryAuditSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Track who changed products, stock, setup, and sales.'**
  String get inventoryAuditSubtitle;

  /// No description provided for @inventoryAuditSubject.
  ///
  /// In en, this message translates to:
  /// **'Subject'**
  String get inventoryAuditSubject;

  /// No description provided for @inventoryCheckoutAvailableProductsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Adjust quantities directly from the available booth inventory.'**
  String get inventoryCheckoutAvailableProductsSubtitle;

  /// No description provided for @inventoryCheckoutAvailableProductsTitle.
  ///
  /// In en, this message translates to:
  /// **'Available products'**
  String get inventoryCheckoutAvailableProductsTitle;

  /// No description provided for @inventoryCheckoutAutoCategory.
  ///
  /// In en, this message translates to:
  /// **'Auto-linked category'**
  String get inventoryCheckoutAutoCategory;

  /// No description provided for @inventoryCheckoutAllCategories.
  ///
  /// In en, this message translates to:
  /// **'All categories'**
  String get inventoryCheckoutAllCategories;

  /// No description provided for @inventoryCheckoutBrowseTab.
  ///
  /// In en, this message translates to:
  /// **'Browse'**
  String get inventoryCheckoutBrowseTab;

  /// No description provided for @inventoryCheckoutCartEmpty.
  ///
  /// In en, this message translates to:
  /// **'Add products from the browse tab to review and submit the sale.'**
  String get inventoryCheckoutCartEmpty;

  /// No description provided for @inventoryCheckoutCartTab.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get inventoryCheckoutCartTab;

  /// No description provided for @inventoryCheckoutCartTotal.
  ///
  /// In en, this message translates to:
  /// **'Cart total'**
  String get inventoryCheckoutCartTotal;

  /// No description provided for @inventoryCheckoutCheckoutDetailsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose where the sale lands before submitting the invoice.'**
  String get inventoryCheckoutCheckoutDetailsSubtitle;

  /// No description provided for @inventoryCheckoutCheckoutDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Checkout details'**
  String get inventoryCheckoutCheckoutDetailsTitle;

  /// No description provided for @inventoryCheckoutCategoryOverride.
  ///
  /// In en, this message translates to:
  /// **'Category override'**
  String get inventoryCheckoutCategoryOverride;

  /// No description provided for @inventoryCheckoutCategoryRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose an income category before creating the sale.'**
  String get inventoryCheckoutCategoryRequired;

  /// No description provided for @inventoryCheckoutEmpty.
  ///
  /// In en, this message translates to:
  /// **'No sellable inventory is available yet.'**
  String get inventoryCheckoutEmpty;

  /// No description provided for @inventoryCheckoutManualCategoryRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose an income category when the cart mixes linked categories or has no linked category.'**
  String get inventoryCheckoutManualCategoryRequired;

  /// No description provided for @inventoryCheckoutNoSearchResults.
  ///
  /// In en, this message translates to:
  /// **'No products match the current search.'**
  String get inventoryCheckoutNoSearchResults;

  /// No description provided for @inventoryCheckoutNoWalletSelected.
  ///
  /// In en, this message translates to:
  /// **'No wallet selected'**
  String get inventoryCheckoutNoWalletSelected;

  /// No description provided for @inventoryCheckoutProductsRequired.
  ///
  /// In en, this message translates to:
  /// **'Add at least one product before creating the sale.'**
  String get inventoryCheckoutProductsRequired;

  /// No description provided for @inventoryCheckoutSelectedItems.
  ///
  /// In en, this message translates to:
  /// **'Selected lines'**
  String get inventoryCheckoutSelectedItems;

  /// No description provided for @inventoryCheckoutSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Build a quick booth sale and send it through invoices.'**
  String get inventoryCheckoutSubtitle;

  /// No description provided for @inventoryCheckoutSubmit.
  ///
  /// In en, this message translates to:
  /// **'Create sale'**
  String get inventoryCheckoutSubmit;

  /// No description provided for @inventoryCheckoutTotalItems.
  ///
  /// In en, this message translates to:
  /// **'Total items'**
  String get inventoryCheckoutTotalItems;

  /// No description provided for @inventoryCheckoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Sell'**
  String get inventoryCheckoutTitle;

  /// No description provided for @inventoryCheckoutValidationError.
  ///
  /// In en, this message translates to:
  /// **'Select a wallet, resolve the category, and add at least one product.'**
  String get inventoryCheckoutValidationError;

  /// No description provided for @inventoryCheckoutWalletRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a wallet before creating the sale.'**
  String get inventoryCheckoutWalletRequired;

  /// No description provided for @inventoryCheckoutWallet.
  ///
  /// In en, this message translates to:
  /// **'Wallet'**
  String get inventoryCheckoutWallet;

  /// No description provided for @inventoryCreateProduct.
  ///
  /// In en, this message translates to:
  /// **'Create product'**
  String get inventoryCreateProduct;

  /// No description provided for @inventoryEditProduct.
  ///
  /// In en, this message translates to:
  /// **'Edit product'**
  String get inventoryEditProduct;

  /// No description provided for @inventoryManageCategories.
  ///
  /// In en, this message translates to:
  /// **'Product categories'**
  String get inventoryManageCategories;

  /// No description provided for @inventoryManageCategoriesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Group products into clear shelves, menus, or collections.'**
  String get inventoryManageCategoriesSubtitle;

  /// No description provided for @inventoryManageEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing configured yet.'**
  String get inventoryManageEmpty;

  /// No description provided for @inventoryManageLabel.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get inventoryManageLabel;

  /// No description provided for @inventoryManageNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a name.'**
  String get inventoryManageNameRequired;

  /// No description provided for @inventoryManageOwners.
  ///
  /// In en, this message translates to:
  /// **'Owners'**
  String get inventoryManageOwners;

  /// No description provided for @inventoryManageOwnersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Keep attribution separate from the staff member operating the booth.'**
  String get inventoryManageOwnersSubtitle;

  /// No description provided for @inventoryManageSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Configure the owners and lookup data the booth depends on.'**
  String get inventoryManageSubtitle;

  /// No description provided for @inventoryManageUnits.
  ///
  /// In en, this message translates to:
  /// **'Units'**
  String get inventoryManageUnits;

  /// No description provided for @inventoryManageUnitsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Define how stock is counted, sold, and displayed.'**
  String get inventoryManageUnitsSubtitle;

  /// No description provided for @inventoryManageWarehouses.
  ///
  /// In en, this message translates to:
  /// **'Warehouses'**
  String get inventoryManageWarehouses;

  /// No description provided for @inventoryManageWarehousesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Separate stock locations so low-stock checks stay accurate.'**
  String get inventoryManageWarehousesSubtitle;

  /// No description provided for @inventoryNoBreakdownData.
  ///
  /// In en, this message translates to:
  /// **'No breakdown data yet.'**
  String get inventoryNoBreakdownData;

  /// No description provided for @inventoryNoLinkedFinanceCategory.
  ///
  /// In en, this message translates to:
  /// **'No linked finance category'**
  String get inventoryNoLinkedFinanceCategory;

  /// No description provided for @inventoryNoLowStockProducts.
  ///
  /// In en, this message translates to:
  /// **'No low-stock products right now.'**
  String get inventoryNoLowStockProducts;

  /// No description provided for @inventoryOverviewCategories.
  ///
  /// In en, this message translates to:
  /// **'By category'**
  String get inventoryOverviewCategories;

  /// No description provided for @inventoryOverviewCategoriesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'See which product groups are bringing in revenue.'**
  String get inventoryOverviewCategoriesSubtitle;

  /// No description provided for @inventoryOverviewExpense.
  ///
  /// In en, this message translates to:
  /// **'Expense'**
  String get inventoryOverviewExpense;

  /// No description provided for @inventoryOverviewIncome.
  ///
  /// In en, this message translates to:
  /// **'Income'**
  String get inventoryOverviewIncome;

  /// No description provided for @inventoryOverviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get inventoryOverviewLabel;

  /// No description provided for @inventoryOverviewLowStock.
  ///
  /// In en, this message translates to:
  /// **'Low stock'**
  String get inventoryOverviewLowStock;

  /// No description provided for @inventoryOverviewLowStockSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Products that need attention before the next sale.'**
  String get inventoryOverviewLowStockSubtitle;

  /// No description provided for @inventoryOverviewOwners.
  ///
  /// In en, this message translates to:
  /// **'By owner'**
  String get inventoryOverviewOwners;

  /// No description provided for @inventoryOverviewOwnersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Break down sales by the owner assigned to each product.'**
  String get inventoryOverviewOwnersSubtitle;

  /// No description provided for @inventoryOverviewRecentSales.
  ///
  /// In en, this message translates to:
  /// **'Recent sales'**
  String get inventoryOverviewRecentSales;

  /// No description provided for @inventoryOverviewRecentSalesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Latest invoice-backed booth sales from inventory.'**
  String get inventoryOverviewRecentSalesSubtitle;

  /// No description provided for @inventoryOverviewSalesRevenue.
  ///
  /// In en, this message translates to:
  /// **'Inventory revenue'**
  String get inventoryOverviewSalesRevenue;

  /// No description provided for @inventoryOverviewSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Watch revenue, inventory pressure, and owner performance together.'**
  String get inventoryOverviewSubtitle;

  /// No description provided for @inventoryOwnerArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get inventoryOwnerArchived;

  /// No description provided for @inventoryProductAddInventoryRow.
  ///
  /// In en, this message translates to:
  /// **'Add stock row'**
  String get inventoryProductAddInventoryRow;

  /// No description provided for @inventoryProductAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get inventoryProductAmount;

  /// No description provided for @inventoryProductAmountRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount.'**
  String get inventoryProductAmountRequired;

  /// No description provided for @inventoryProductCategory.
  ///
  /// In en, this message translates to:
  /// **'Product category'**
  String get inventoryProductCategory;

  /// No description provided for @inventoryProductCategoryRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a product category.'**
  String get inventoryProductCategoryRequired;

  /// No description provided for @inventoryProductDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get inventoryProductDescription;

  /// No description provided for @inventoryProductDetailsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Name the product, assign ownership, and link finance defaults.'**
  String get inventoryProductDetailsSubtitle;

  /// No description provided for @inventoryProductDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Product details'**
  String get inventoryProductDetailsTitle;

  /// No description provided for @inventoryProductEditorSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Create booth-ready products with fixed prices and stock rows.'**
  String get inventoryProductEditorSubtitle;

  /// No description provided for @inventoryProductFinanceCategory.
  ///
  /// In en, this message translates to:
  /// **'Linked finance category'**
  String get inventoryProductFinanceCategory;

  /// No description provided for @inventoryProductInventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory rows'**
  String get inventoryProductInventory;

  /// No description provided for @inventoryProductInventoryRows.
  ///
  /// In en, this message translates to:
  /// **'Rows'**
  String get inventoryProductInventoryRows;

  /// No description provided for @inventoryProductInventorySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Each row represents a unit, warehouse, quantity, threshold, and price.'**
  String get inventoryProductInventorySubtitle;

  /// No description provided for @inventoryProductManufacturer.
  ///
  /// In en, this message translates to:
  /// **'Manufacturer'**
  String get inventoryProductManufacturer;

  /// No description provided for @inventoryProductMinAmount.
  ///
  /// In en, this message translates to:
  /// **'Minimum amount'**
  String get inventoryProductMinAmount;

  /// No description provided for @inventoryProductMinAmountRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a minimum amount.'**
  String get inventoryProductMinAmountRequired;

  /// No description provided for @inventoryProductName.
  ///
  /// In en, this message translates to:
  /// **'Product name'**
  String get inventoryProductName;

  /// No description provided for @inventoryProductNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a product name.'**
  String get inventoryProductNameRequired;

  /// No description provided for @inventoryProductNumberInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid number.'**
  String get inventoryProductNumberInvalid;

  /// No description provided for @inventoryProductOwner.
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get inventoryProductOwner;

  /// No description provided for @inventoryProductOwnerRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose an owner.'**
  String get inventoryProductOwnerRequired;

  /// No description provided for @inventoryProductPrice.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get inventoryProductPrice;

  /// No description provided for @inventoryProductPriceRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a price.'**
  String get inventoryProductPriceRequired;

  /// No description provided for @inventoryProductAvailableSummary.
  ///
  /// In en, this message translates to:
  /// **'{amount} available • {price}'**
  String inventoryProductAvailableSummary(String amount, String price);

  /// No description provided for @inventoryProductSaved.
  ///
  /// In en, this message translates to:
  /// **'Product saved.'**
  String get inventoryProductSaved;

  /// No description provided for @inventoryProductUntitled.
  ///
  /// In en, this message translates to:
  /// **'Untitled product'**
  String get inventoryProductUntitled;

  /// No description provided for @inventoryProductUnit.
  ///
  /// In en, this message translates to:
  /// **'Unit'**
  String get inventoryProductUnit;

  /// No description provided for @inventoryProductUnitRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a unit.'**
  String get inventoryProductUnitRequired;

  /// No description provided for @inventoryProductUsage.
  ///
  /// In en, this message translates to:
  /// **'Usage'**
  String get inventoryProductUsage;

  /// No description provided for @inventoryProductValidationError.
  ///
  /// In en, this message translates to:
  /// **'Complete the required product, owner, category, and stock fields.'**
  String get inventoryProductValidationError;

  /// No description provided for @inventoryProductWarehouse.
  ///
  /// In en, this message translates to:
  /// **'Warehouse'**
  String get inventoryProductWarehouse;

  /// No description provided for @inventoryProductWarehouseRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a warehouse.'**
  String get inventoryProductWarehouseRequired;

  /// No description provided for @inventoryProductsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Create products to start tracking stock and selling from the booth.'**
  String get inventoryProductsEmpty;

  /// No description provided for @inventoryProductsLabel.
  ///
  /// In en, this message translates to:
  /// **'Products'**
  String get inventoryProductsLabel;

  /// No description provided for @inventoryProductsListSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tap a product to edit details, pricing, or stock rows.'**
  String get inventoryProductsListSubtitle;

  /// No description provided for @inventoryProductsListTitle.
  ///
  /// In en, this message translates to:
  /// **'Product catalog'**
  String get inventoryProductsListTitle;

  /// No description provided for @inventoryProductsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Search, review, and edit products prepared for the booth.'**
  String get inventoryProductsSubtitle;

  /// No description provided for @inventoryRealtimeDisabled.
  ///
  /// In en, this message translates to:
  /// **'Realtime is disabled for this workspace.'**
  String get inventoryRealtimeDisabled;

  /// No description provided for @inventoryRealtimeEnabled.
  ///
  /// In en, this message translates to:
  /// **'Realtime enabled'**
  String get inventoryRealtimeEnabled;

  /// No description provided for @inventorySaleCreated.
  ///
  /// In en, this message translates to:
  /// **'Inventory sale created.'**
  String get inventorySaleCreated;

  /// No description provided for @inventorySaleDeleted.
  ///
  /// In en, this message translates to:
  /// **'Sale deleted.'**
  String get inventorySaleDeleted;

  /// No description provided for @inventorySaleUpdated.
  ///
  /// In en, this message translates to:
  /// **'Sale updated.'**
  String get inventorySaleUpdated;

  /// No description provided for @inventorySalesEmpty.
  ///
  /// In en, this message translates to:
  /// **'Sales created from invoices will appear here.'**
  String get inventorySalesEmpty;

  /// No description provided for @inventorySalesDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete sale'**
  String get inventorySalesDelete;

  /// No description provided for @inventorySalesDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this sale and restore its stock?'**
  String get inventorySalesDeleteConfirm;

  /// No description provided for @inventorySalesEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit sale'**
  String get inventorySalesEdit;

  /// No description provided for @inventorySalesFallbackTitle.
  ///
  /// In en, this message translates to:
  /// **'Inventory sale'**
  String get inventorySalesFallbackTitle;

  /// No description provided for @inventorySalesItemsCount.
  ///
  /// In en, this message translates to:
  /// **'{count} items'**
  String inventorySalesItemsCount(int count);

  /// No description provided for @inventorySalesLabel.
  ///
  /// In en, this message translates to:
  /// **'Sales'**
  String get inventorySalesLabel;

  /// No description provided for @inventorySalesCreatorBadge.
  ///
  /// In en, this message translates to:
  /// **'By {name}'**
  String inventorySalesCreatorBadge(String name);

  /// No description provided for @inventorySalesLineItems.
  ///
  /// In en, this message translates to:
  /// **'Line items'**
  String get inventorySalesLineItems;

  /// No description provided for @inventorySalesNote.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get inventorySalesNote;

  /// No description provided for @inventorySalesRecentSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Review the latest invoice-backed inventory sales.'**
  String get inventorySalesRecentSubtitle;

  /// No description provided for @inventorySalesRecentTitle.
  ///
  /// In en, this message translates to:
  /// **'Sale history'**
  String get inventorySalesRecentTitle;

  /// No description provided for @inventorySalesSave.
  ///
  /// In en, this message translates to:
  /// **'Save sale'**
  String get inventorySalesSave;

  /// No description provided for @inventorySalesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Monitor completed inventory sales and payment destinations.'**
  String get inventorySalesSubtitle;

  /// No description provided for @inventorySalesTitle.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get inventorySalesTitle;

  /// No description provided for @inventorySaveProduct.
  ///
  /// In en, this message translates to:
  /// **'Save product'**
  String get inventorySaveProduct;

  /// No description provided for @inventorySearchProducts.
  ///
  /// In en, this message translates to:
  /// **'Search products'**
  String get inventorySearchProducts;

  /// No description provided for @inventoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get inventoryTitle;

  /// No description provided for @financeOverviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get financeOverviewLabel;

  /// No description provided for @financeActivityLabel.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get financeActivityLabel;

  /// No description provided for @financeManageLabel.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get financeManageLabel;

  /// No description provided for @financeOverviewEyebrow.
  ///
  /// In en, this message translates to:
  /// **'Workspace snapshot'**
  String get financeOverviewEyebrow;

  /// No description provided for @financeOverviewCrossCurrencyHint.
  ///
  /// In en, this message translates to:
  /// **'Includes converted balances across wallets. Base currency: {currency}.'**
  String financeOverviewCrossCurrencyHint(String currency);

  /// No description provided for @financeOverviewSingleCurrencyHint.
  ///
  /// In en, this message translates to:
  /// **'Everything is already tracked in {currency}.'**
  String financeOverviewSingleCurrencyHint(String currency);

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

  /// No description provided for @financeOverviewActionsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Jump into the next thing you need to do.'**
  String get financeOverviewActionsSubtitle;

  /// No description provided for @financeOverviewCreateTransactionHint.
  ///
  /// In en, this message translates to:
  /// **'Capture income, expenses, or transfers quickly.'**
  String get financeOverviewCreateTransactionHint;

  /// No description provided for @financeOverviewWalletsHint.
  ///
  /// In en, this message translates to:
  /// **'Review balances and tune each account.'**
  String get financeOverviewWalletsHint;

  /// No description provided for @financeOverviewManageHint.
  ///
  /// In en, this message translates to:
  /// **'Shape categories, tags, and finance structure.'**
  String get financeOverviewManageHint;

  /// No description provided for @financeOverviewWalletSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Wallets'**
  String get financeOverviewWalletSectionTitle;

  /// No description provided for @financeOverviewWalletSectionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your most important balances at a glance.'**
  String get financeOverviewWalletSectionSubtitle;

  /// No description provided for @financeOverviewNoWalletsBody.
  ///
  /// In en, this message translates to:
  /// **'Create your first wallet to start tracking balances, transfers, and categories.'**
  String get financeOverviewNoWalletsBody;

  /// No description provided for @financeOverviewActivityTitle.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get financeOverviewActivityTitle;

  /// No description provided for @financeOverviewActivitySubtitle.
  ///
  /// In en, this message translates to:
  /// **'The latest movement across your wallets.'**
  String get financeOverviewActivitySubtitle;

  /// No description provided for @financeOverviewNoTransactionsBody.
  ///
  /// In en, this message translates to:
  /// **'Transactions appear here once you start logging money in and out.'**
  String get financeOverviewNoTransactionsBody;

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

  /// No description provided for @financeCurrencyPickerSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose the code that best matches how this wallet is tracked.'**
  String get financeCurrencyPickerSubtitle;

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

  /// No description provided for @financeWalletDialogSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Set up how this wallet should look and behave in finance.'**
  String get financeWalletDialogSubtitle;

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

  /// No description provided for @financeManageCategoriesTitle.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get financeManageCategoriesTitle;

  /// No description provided for @financeManageCategoriesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Group transactions into clear spending and income buckets.'**
  String get financeManageCategoriesSubtitle;

  /// No description provided for @financeManageTagsTitle.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get financeManageTagsTitle;

  /// No description provided for @financeManageTagsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Use tags for lightweight labels and flexible reporting.'**
  String get financeManageTagsSubtitle;

  /// No description provided for @financeManageCategoriesEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Create categories for recurring income and expense patterns.'**
  String get financeManageCategoriesEmptyBody;

  /// No description provided for @financeManageTagsEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Create tags for ad-hoc labels like trips, subscriptions, or projects.'**
  String get financeManageTagsEmptyBody;

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

  /// No description provided for @financeTagDialogSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Describe the label and choose a color that is easy to scan.'**
  String get financeTagDialogSubtitle;

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

  /// No description provided for @financeHideAmounts.
  ///
  /// In en, this message translates to:
  /// **'Hide amounts'**
  String get financeHideAmounts;

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

  /// No description provided for @financeShowAmounts.
  ///
  /// In en, this message translates to:
  /// **'Show amounts'**
  String get financeShowAmounts;

  /// No description provided for @financeNoSearchResults.
  ///
  /// In en, this message translates to:
  /// **'No matching transactions'**
  String get financeNoSearchResults;

  /// No description provided for @financeActivityDefaultHint.
  ///
  /// In en, this message translates to:
  /// **'Search and review money movement by day.'**
  String get financeActivityDefaultHint;

  /// No description provided for @financeActivitySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search is open. Filter by merchant, wallet, or category.'**
  String get financeActivitySearchHint;

  /// No description provided for @financeActivitySearchEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Try a different keyword, wallet, or category name.'**
  String get financeActivitySearchEmptyBody;

  /// No description provided for @financeActivityClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get financeActivityClearSearch;

  /// No description provided for @financeActivitySearchResults.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No matches yet} one{1 transaction matched} other{{count} transactions matched}}'**
  String financeActivitySearchResults(int count);

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

  /// No description provided for @financeTransactionDialogSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Capture the amount, source, and visibility settings in one place.'**
  String get financeTransactionDialogSubtitle;

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

  /// No description provided for @financePickerWalletSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pick the wallet this transaction should affect.'**
  String get financePickerWalletSubtitle;

  /// No description provided for @financePickerCategorySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose the bucket that best describes the transaction.'**
  String get financePickerCategorySubtitle;

  /// No description provided for @financePickerTagSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Select an optional label for extra context.'**
  String get financePickerTagSubtitle;

  /// No description provided for @financeNoTag.
  ///
  /// In en, this message translates to:
  /// **'No tag'**
  String get financeNoTag;

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

  /// No description provided for @financeTransferModeEditHint.
  ///
  /// In en, this message translates to:
  /// **'Transfer mode can only be edited for existing transfers.'**
  String get financeTransferModeEditHint;

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

  /// No description provided for @financeExcludedFromReports.
  ///
  /// In en, this message translates to:
  /// **'Excluded from reports'**
  String get financeExcludedFromReports;

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

  /// No description provided for @financeCategoryDialogSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Define how this category should look and whether it counts as income or expense.'**
  String get financeCategoryDialogSubtitle;

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

  /// No description provided for @financeNetBalance.
  ///
  /// In en, this message translates to:
  /// **'Net balance'**
  String get financeNetBalance;

  /// No description provided for @financeYourWallets.
  ///
  /// In en, this message translates to:
  /// **'Your wallets'**
  String get financeYourWallets;

  /// No description provided for @financeQuickActions.
  ///
  /// In en, this message translates to:
  /// **'Quick actions'**
  String get financeQuickActions;

  /// No description provided for @financeWalletSummaryHint.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No wallets configured yet} one{1 wallet is ready to use} other{{count} wallets are ready to use}}'**
  String financeWalletSummaryHint(int count);

  /// No description provided for @financeAddTransaction.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get financeAddTransaction;

  /// No description provided for @financeAddFirstTransaction.
  ///
  /// In en, this message translates to:
  /// **'Add first transaction'**
  String get financeAddFirstTransaction;

  /// No description provided for @financeCreateFirstWallet.
  ///
  /// In en, this message translates to:
  /// **'Create first wallet'**
  String get financeCreateFirstWallet;

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
  /// **'Timer'**
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

  /// No description provided for @timerRunningSessionNoDetails.
  ///
  /// In en, this message translates to:
  /// **'No category or task linked'**
  String get timerRunningSessionNoDetails;

  /// No description provided for @timerRunningSessionNoTitle.
  ///
  /// In en, this message translates to:
  /// **'Untitled session'**
  String get timerRunningSessionNoTitle;

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

  /// No description provided for @timerSessionPauseSuccess.
  ///
  /// In en, this message translates to:
  /// **'Session paused successfully.'**
  String get timerSessionPauseSuccess;

  /// No description provided for @timerSessionResumeSuccess.
  ///
  /// In en, this message translates to:
  /// **'Session resumed successfully.'**
  String get timerSessionResumeSuccess;

  /// No description provided for @timerSessionStopSuccess.
  ///
  /// In en, this message translates to:
  /// **'Session stopped successfully.'**
  String get timerSessionStopSuccess;

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

  /// No description provided for @timerCategoryColor.
  ///
  /// In en, this message translates to:
  /// **'Color'**
  String get timerCategoryColor;

  /// No description provided for @timerCategoryColorLime.
  ///
  /// In en, this message translates to:
  /// **'Lime'**
  String get timerCategoryColorLime;

  /// No description provided for @timerCategoryColorTeal.
  ///
  /// In en, this message translates to:
  /// **'Teal'**
  String get timerCategoryColorTeal;

  /// No description provided for @timerCategoryColorSky.
  ///
  /// In en, this message translates to:
  /// **'Sky'**
  String get timerCategoryColorSky;

  /// No description provided for @timerCategoryColorRose.
  ///
  /// In en, this message translates to:
  /// **'Rose'**
  String get timerCategoryColorRose;

  /// No description provided for @timerCategoryDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get timerCategoryDescription;

  /// No description provided for @timerCategoryColorNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get timerCategoryColorNone;

  /// No description provided for @timerCreateCategory.
  ///
  /// In en, this message translates to:
  /// **'Create category'**
  String get timerCreateCategory;

  /// No description provided for @timerCategoryCreateInProgress.
  ///
  /// In en, this message translates to:
  /// **'Creating category...'**
  String get timerCategoryCreateInProgress;

  /// No description provided for @timerCategoryCreateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Category created'**
  String get timerCategoryCreateSuccess;

  /// No description provided for @timerSelectCategory.
  ///
  /// In en, this message translates to:
  /// **'Select category'**
  String get timerSelectCategory;

  /// No description provided for @timerAdvanced.
  ///
  /// In en, this message translates to:
  /// **'Advanced'**
  String get timerAdvanced;

  /// No description provided for @timerSessionDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get timerSessionDescription;

  /// No description provided for @timerLinkTask.
  ///
  /// In en, this message translates to:
  /// **'Task'**
  String get timerLinkTask;

  /// No description provided for @timerTaskPickerAllTasks.
  ///
  /// In en, this message translates to:
  /// **'All tasks'**
  String get timerTaskPickerAllTasks;

  /// No description provided for @timerTaskPickerAssignedToMe.
  ///
  /// In en, this message translates to:
  /// **'Assigned to me'**
  String get timerTaskPickerAssignedToMe;

  /// No description provided for @timerTaskPickerAssignees.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No assignees} one{{count} assignee} other{{count} assignees}}'**
  String timerTaskPickerAssignees(int count);

  /// No description provided for @timerTaskPickerNoMatchingTasks.
  ///
  /// In en, this message translates to:
  /// **'No matching tasks'**
  String get timerTaskPickerNoMatchingTasks;

  /// No description provided for @timerTaskPickerNoTask.
  ///
  /// In en, this message translates to:
  /// **'No linked task'**
  String get timerTaskPickerNoTask;

  /// No description provided for @timerTaskPickerResultCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No tasks} one{{count} task} other{{count} tasks}}'**
  String timerTaskPickerResultCount(int count);

  /// No description provided for @timerTaskPickerSearch.
  ///
  /// In en, this message translates to:
  /// **'Search tasks'**
  String get timerTaskPickerSearch;

  /// No description provided for @timerTaskIdPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Select a task'**
  String get timerTaskIdPlaceholder;

  /// No description provided for @timerAttachmentCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No attachments} one{1 attachment} other{{count} attachments}}'**
  String timerAttachmentCount(int count);

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
  /// **'Statistics'**
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

  /// No description provided for @timerHeatmapTrackedThisYear.
  ///
  /// In en, this message translates to:
  /// **'Tracked {duration} this year'**
  String timerHeatmapTrackedThisYear(String duration);

  /// No description provided for @timerHeatmapStartTracking.
  ///
  /// In en, this message translates to:
  /// **'Start tracking to build your activity pattern'**
  String get timerHeatmapStartTracking;

  /// No description provided for @timerHeatmapViewOriginal.
  ///
  /// In en, this message translates to:
  /// **'Original'**
  String get timerHeatmapViewOriginal;

  /// No description provided for @timerHeatmapViewHybrid.
  ///
  /// In en, this message translates to:
  /// **'Hybrid'**
  String get timerHeatmapViewHybrid;

  /// No description provided for @timerHeatmapViewCalendarOnly.
  ///
  /// In en, this message translates to:
  /// **'Calendar'**
  String get timerHeatmapViewCalendarOnly;

  /// No description provided for @timerHeatmapViewCompactCards.
  ///
  /// In en, this message translates to:
  /// **'Cards'**
  String get timerHeatmapViewCompactCards;

  /// No description provided for @timerHeatmapLegendLess.
  ///
  /// In en, this message translates to:
  /// **'Less'**
  String get timerHeatmapLegendLess;

  /// No description provided for @timerHeatmapLegendMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get timerHeatmapLegendMore;

  /// Compact month label for heatmap columns when locale needs a month number (e.g. Vietnamese). Not used for English; prefer DateFormat MMM elsewhere.
  ///
  /// In en, this message translates to:
  /// **'{month}'**
  String timerHeatmapMonthCompact(int month);

  /// Month index 1-12 only for very narrow per-week heatmap columns (e.g. Vietnamese). Wider surfaces use timerHeatmapMonthCompact or MMM.
  ///
  /// In en, this message translates to:
  /// **'{month}'**
  String timerHeatmapMonthNarrowColumn(int month);

  /// No description provided for @timerHeatmapYearPattern.
  ///
  /// In en, this message translates to:
  /// **'Activity Pattern'**
  String get timerHeatmapYearPattern;

  /// No description provided for @timerHeatmapActiveDays.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} active day} other{{count} active days}}'**
  String timerHeatmapActiveDays(int count);

  /// No description provided for @timerHeatmapMon.
  ///
  /// In en, this message translates to:
  /// **'Mo'**
  String get timerHeatmapMon;

  /// No description provided for @timerHeatmapTue.
  ///
  /// In en, this message translates to:
  /// **'Tu'**
  String get timerHeatmapTue;

  /// No description provided for @timerHeatmapWed.
  ///
  /// In en, this message translates to:
  /// **'We'**
  String get timerHeatmapWed;

  /// No description provided for @timerHeatmapThu.
  ///
  /// In en, this message translates to:
  /// **'Th'**
  String get timerHeatmapThu;

  /// No description provided for @timerHeatmapFri.
  ///
  /// In en, this message translates to:
  /// **'Fr'**
  String get timerHeatmapFri;

  /// No description provided for @timerHeatmapSat.
  ///
  /// In en, this message translates to:
  /// **'Sa'**
  String get timerHeatmapSat;

  /// No description provided for @timerHeatmapSun.
  ///
  /// In en, this message translates to:
  /// **'Su'**
  String get timerHeatmapSun;

  /// No description provided for @timerHeatmapSessions.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} session} other{{count} sessions}}'**
  String timerHeatmapSessions(int count);

  /// No description provided for @timerHeatmapTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get timerHeatmapTotal;

  /// No description provided for @timerHeatmapSessionsLabel.
  ///
  /// In en, this message translates to:
  /// **'Sessions'**
  String get timerHeatmapSessionsLabel;

  /// No description provided for @timerHeatmapActiveDaysLabel.
  ///
  /// In en, this message translates to:
  /// **'Active days'**
  String get timerHeatmapActiveDaysLabel;

  /// No description provided for @timerHeatmapLessThanMinute.
  ///
  /// In en, this message translates to:
  /// **'<1m'**
  String get timerHeatmapLessThanMinute;

  /// No description provided for @timerHeatmapNoActivityYet.
  ///
  /// In en, this message translates to:
  /// **'No activity yet'**
  String get timerHeatmapNoActivityYet;

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

  /// No description provided for @timerPomodoroSettingsDescription.
  ///
  /// In en, this message translates to:
  /// **'Tune focus sessions, breaks, and the automation between them.'**
  String get timerPomodoroSettingsDescription;

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

  /// No description provided for @timerRequestsFilterAllStatuses.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get timerRequestsFilterAllStatuses;

  /// No description provided for @timerRequestsFilterTitle.
  ///
  /// In en, this message translates to:
  /// **'Filter requests'**
  String get timerRequestsFilterTitle;

  /// No description provided for @timerRequestsFilterStatusLabel.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get timerRequestsFilterStatusLabel;

  /// No description provided for @timerRequestsFilterUserLabel.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get timerRequestsFilterUserLabel;

  /// No description provided for @timerRequestsFilterAllUsers.
  ///
  /// In en, this message translates to:
  /// **'All users'**
  String get timerRequestsFilterAllUsers;

  /// No description provided for @timerRequestsFilterClear.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get timerRequestsFilterClear;

  /// No description provided for @timerRequestsFilterApply.
  ///
  /// In en, this message translates to:
  /// **'Apply filters'**
  String get timerRequestsFilterApply;

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

  /// No description provided for @timerRequestInfoRequestedBy.
  ///
  /// In en, this message translates to:
  /// **'Info requested by {name}'**
  String timerRequestInfoRequestedBy(String name);

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

  /// No description provided for @taskBoardDetailTaskAssigneeCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} assignee} other{{count} assignees}}'**
  String taskBoardDetailTaskAssigneeCount(int count);

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

  /// No description provided for @timerRequestsStatusChangeGracePeriodLabel.
  ///
  /// In en, this message translates to:
  /// **'Approved/rejected status change grace period (minutes)'**
  String get timerRequestsStatusChangeGracePeriodLabel;

  /// No description provided for @timerRequestsStatusChangeGracePeriodHelp.
  ///
  /// In en, this message translates to:
  /// **'Set how many minutes approvers can revert a request between Approved and Rejected in either direction. Set to 0 to disable both actions.'**
  String get timerRequestsStatusChangeGracePeriodHelp;

  /// No description provided for @timerRequestsStatusChangeGracePeriodInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a whole number greater than or equal to 0 for status revert grace period.'**
  String get timerRequestsStatusChangeGracePeriodInvalid;

  /// No description provided for @timerRequestsThresholdUpdated.
  ///
  /// In en, this message translates to:
  /// **'Request threshold updated.'**
  String get timerRequestsThresholdUpdated;

  /// No description provided for @timerRequestRevertToApproved.
  ///
  /// In en, this message translates to:
  /// **'Revert to Approved'**
  String get timerRequestRevertToApproved;

  /// No description provided for @timerRequestRevertToRejected.
  ///
  /// In en, this message translates to:
  /// **'Revert to Rejected'**
  String get timerRequestRevertToRejected;

  /// No description provided for @timerRequestLastModifiedBy.
  ///
  /// In en, this message translates to:
  /// **'Last modified by'**
  String get timerRequestLastModifiedBy;

  /// No description provided for @timerRequestApprovedByAt.
  ///
  /// In en, this message translates to:
  /// **'Approved by {name} on {date}'**
  String timerRequestApprovedByAt(String name, String date);

  /// No description provided for @timerRequestRejectedByAt.
  ///
  /// In en, this message translates to:
  /// **'Rejected by {name} on {date}'**
  String timerRequestRejectedByAt(String name, String date);

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

  /// No description provided for @commonClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get commonClearSearch;

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
  /// **'{count, plural, one{{count} day} other{{count} days}}'**
  String timerDays(int count);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsNavApp.
  ///
  /// In en, this message translates to:
  /// **'App'**
  String get settingsNavApp;

  /// No description provided for @settingsNavWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Workspace'**
  String get settingsNavWorkspace;

  /// No description provided for @settingsNavYou.
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get settingsNavYou;

  /// No description provided for @settingsAccountTab.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get settingsAccountTab;

  /// No description provided for @settingsPreferencesTab.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get settingsPreferencesTab;

  /// No description provided for @settingsAboutTab.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get settingsAboutTab;

  /// No description provided for @settingsLicensesTab.
  ///
  /// In en, this message translates to:
  /// **'Licenses'**
  String get settingsLicensesTab;

  /// No description provided for @settingsProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsProfile;

  /// No description provided for @settingsProfileDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage your personal details and avatar.'**
  String get settingsProfileDescription;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsLanguageDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose the language used throughout the app.'**
  String get settingsLanguageDescription;

  /// No description provided for @settingsAppVersion.
  ///
  /// In en, this message translates to:
  /// **'App version'**
  String get settingsAppVersion;

  /// No description provided for @settingsLanguageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get settingsLanguageSystem;

  /// No description provided for @settingsLanguageSystemDescription.
  ///
  /// In en, this message translates to:
  /// **'Follow your device language automatically.'**
  String get settingsLanguageSystemDescription;

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

  /// No description provided for @settingsThemeDescription.
  ///
  /// In en, this message translates to:
  /// **'Adjust the app appearance for your device and preference.'**
  String get settingsThemeDescription;

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

  /// No description provided for @settingsThemeSystemDescription.
  ///
  /// In en, this message translates to:
  /// **'Match your device appearance automatically.'**
  String get settingsThemeSystemDescription;

  /// No description provided for @settingsFinanceAmounts.
  ///
  /// In en, this message translates to:
  /// **'Finance amounts'**
  String get settingsFinanceAmounts;

  /// No description provided for @settingsFinanceAmountsDescription.
  ///
  /// In en, this message translates to:
  /// **'Show or hide balances and transaction amounts across finance screens.'**
  String get settingsFinanceAmountsDescription;

  /// No description provided for @settingsSwitchWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Switch workspace'**
  String get settingsSwitchWorkspace;

  /// No description provided for @settingsSwitchWorkspaceDescription.
  ///
  /// In en, this message translates to:
  /// **'Move between personal and team contexts.'**
  String get settingsSwitchWorkspaceDescription;

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

  /// No description provided for @settingsFirstDayOfWeekDescription.
  ///
  /// In en, this message translates to:
  /// **'Control how calendars and weekly summaries start.'**
  String get settingsFirstDayOfWeekDescription;

  /// No description provided for @settingsFirstDayAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get settingsFirstDayAuto;

  /// No description provided for @settingsFirstDayAutoDescription.
  ///
  /// In en, this message translates to:
  /// **'Use your workspace or locale defaults when available.'**
  String get settingsFirstDayAutoDescription;

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

  /// No description provided for @settingsHeroDescription.
  ///
  /// In en, this message translates to:
  /// **'Personal setup, workspace context, and release details in one place.'**
  String get settingsHeroDescription;

  /// No description provided for @settingsSignedInAs.
  ///
  /// In en, this message translates to:
  /// **'Signed in as'**
  String get settingsSignedInAs;

  /// No description provided for @settingsCurrentWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Current workspace'**
  String get settingsCurrentWorkspace;

  /// No description provided for @settingsCurrentWorkspaceDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose the workspace you are using right now.'**
  String get settingsCurrentWorkspaceDescription;

  /// No description provided for @settingsDefaultWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Default workspace'**
  String get settingsDefaultWorkspace;

  /// No description provided for @settingsDefaultWorkspaceDescription.
  ///
  /// In en, this message translates to:
  /// **'The app opens here by default on every launch.'**
  String get settingsDefaultWorkspaceDescription;

  /// No description provided for @settingsWorkspacePropertiesTitle.
  ///
  /// In en, this message translates to:
  /// **'Workspace information'**
  String get settingsWorkspacePropertiesTitle;

  /// No description provided for @settingsWorkspacePropertiesDescription.
  ///
  /// In en, this message translates to:
  /// **'Update the workspace name and avatar.'**
  String get settingsWorkspacePropertiesDescription;

  /// No description provided for @settingsWorkspacePropertiesNoAccess.
  ///
  /// In en, this message translates to:
  /// **'You need workspace settings permission to edit these properties.'**
  String get settingsWorkspacePropertiesNoAccess;

  /// No description provided for @settingsWorkspacePropertiesPermissionLoading.
  ///
  /// In en, this message translates to:
  /// **'Checking your workspace permissions...'**
  String get settingsWorkspacePropertiesPermissionLoading;

  /// No description provided for @settingsWorkspacePropertiesUpdated.
  ///
  /// In en, this message translates to:
  /// **'Workspace information updated.'**
  String get settingsWorkspacePropertiesUpdated;

  /// No description provided for @settingsWorkspacePropertiesNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Workspace name cannot be empty'**
  String get settingsWorkspacePropertiesNameRequired;

  /// No description provided for @settingsWorkspaceAvatar.
  ///
  /// In en, this message translates to:
  /// **'Workspace avatar'**
  String get settingsWorkspaceAvatar;

  /// No description provided for @settingsWorkspaceAvatarDescription.
  ///
  /// In en, this message translates to:
  /// **'Upload a new image or remove the current avatar.'**
  String get settingsWorkspaceAvatarDescription;

  /// No description provided for @settingsWorkspaceAvatarRemovePending.
  ///
  /// In en, this message translates to:
  /// **'The current avatar will be removed when you save.'**
  String get settingsWorkspaceAvatarRemovePending;

  /// No description provided for @settingsWorkspaceNameHint.
  ///
  /// In en, this message translates to:
  /// **'Workspace name'**
  String get settingsWorkspaceNameHint;

  /// No description provided for @settingsNoEmail.
  ///
  /// In en, this message translates to:
  /// **'No email available'**
  String get settingsNoEmail;

  /// No description provided for @settingsNoWorkspaceSelected.
  ///
  /// In en, this message translates to:
  /// **'No workspace selected'**
  String get settingsNoWorkspaceSelected;

  /// No description provided for @settingsWorkspaceActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get settingsWorkspaceActive;

  /// No description provided for @settingsAccountSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get settingsAccountSectionTitle;

  /// No description provided for @settingsAccountSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Profile access and session controls.'**
  String get settingsAccountSectionDescription;

  /// No description provided for @settingsWorkspaceSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Workspace'**
  String get settingsWorkspaceSectionTitle;

  /// No description provided for @settingsWorkspaceSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'See your current context and switch when needed.'**
  String get settingsWorkspaceSectionDescription;

  /// No description provided for @settingsWorkspaceSectionManageTitle.
  ///
  /// In en, this message translates to:
  /// **'Workspace setup'**
  String get settingsWorkspaceSectionManageTitle;

  /// No description provided for @settingsWorkspaceAccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Access'**
  String get settingsWorkspaceAccessTitle;

  /// No description provided for @settingsWorkspaceDefaultCurrencyTitle.
  ///
  /// In en, this message translates to:
  /// **'Default currency'**
  String get settingsWorkspaceDefaultCurrencyTitle;

  /// No description provided for @settingsWorkspaceDefaultCurrencyDescription.
  ///
  /// In en, this message translates to:
  /// **'Use one currency as the default for finance and invoice flows in this workspace.'**
  String get settingsWorkspaceDefaultCurrencyDescription;

  /// No description provided for @settingsWorkspaceDefaultCurrencyField.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get settingsWorkspaceDefaultCurrencyField;

  /// No description provided for @settingsPreferencesSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get settingsPreferencesSectionTitle;

  /// No description provided for @settingsPreferencesSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Language, appearance, and calendar defaults.'**
  String get settingsPreferencesSectionDescription;

  /// No description provided for @settingsDangerSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Session'**
  String get settingsDangerSectionTitle;

  /// No description provided for @settingsDangerSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Sign out and end access on this device.'**
  String get settingsDangerSectionDescription;

  /// No description provided for @settingsQuickOpenProfile.
  ///
  /// In en, this message translates to:
  /// **'Open profile'**
  String get settingsQuickOpenProfile;

  /// No description provided for @settingsQuickSwitchWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Switch current'**
  String get settingsQuickSwitchWorkspace;

  /// No description provided for @settingsQuickDefaultWorkspace.
  ///
  /// In en, this message translates to:
  /// **'Default workspace'**
  String get settingsQuickDefaultWorkspace;

  /// No description provided for @settingsDataStatusLabel.
  ///
  /// In en, this message translates to:
  /// **'Data'**
  String get settingsDataStatusLabel;

  /// No description provided for @settingsDataStatusLive.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get settingsDataStatusLive;

  /// No description provided for @settingsDataStatusCached.
  ///
  /// In en, this message translates to:
  /// **'Cached'**
  String get settingsDataStatusCached;

  /// No description provided for @settingsDataStatusRefreshing.
  ///
  /// In en, this message translates to:
  /// **'Refreshing'**
  String get settingsDataStatusRefreshing;

  /// No description provided for @settingsPullToRefreshAction.
  ///
  /// In en, this message translates to:
  /// **'Refresh now'**
  String get settingsPullToRefreshAction;

  /// No description provided for @settingsSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get settingsSignOut;

  /// No description provided for @settingsSignOutDescription.
  ///
  /// In en, this message translates to:
  /// **'End your session on this device.'**
  String get settingsSignOutDescription;

  /// No description provided for @settingsSignOutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to sign out?'**
  String get settingsSignOutConfirm;

  /// No description provided for @settingsAboutSummary.
  ///
  /// In en, this message translates to:
  /// **'Tuturuuu mobile keeps your workspace tools, assistant, and day-to-day workflows within quick reach.'**
  String get settingsAboutSummary;

  /// No description provided for @settingsAboutSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'About the app'**
  String get settingsAboutSectionTitle;

  /// No description provided for @settingsAboutSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Release details and product information for this build.'**
  String get settingsAboutSectionDescription;

  /// No description provided for @settingsVersionLabel.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get settingsVersionLabel;

  /// No description provided for @settingsBuildLabel.
  ///
  /// In en, this message translates to:
  /// **'Build'**
  String get settingsBuildLabel;

  /// No description provided for @settingsPackageLabel.
  ///
  /// In en, this message translates to:
  /// **'Package'**
  String get settingsPackageLabel;

  /// No description provided for @settingsVersionTileDescription.
  ///
  /// In en, this message translates to:
  /// **'Installed release currently running on this device.'**
  String get settingsVersionTileDescription;

  /// No description provided for @settingsInfrastructureSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Infrastructure'**
  String get settingsInfrastructureSectionTitle;

  /// No description provided for @settingsInfrastructureSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Platform-wide controls available in the internal workspace.'**
  String get settingsInfrastructureSectionDescription;

  /// No description provided for @settingsMobileVersions.
  ///
  /// In en, this message translates to:
  /// **'Mobile versions'**
  String get settingsMobileVersions;

  /// No description provided for @settingsMobileVersionsTileDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage the effective and minimum versions enforced by the mobile app.'**
  String get settingsMobileVersionsTileDescription;

  /// No description provided for @settingsMobileVersionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Mobile versions'**
  String get settingsMobileVersionsTitle;

  /// No description provided for @settingsMobileVersionsPageDescription.
  ///
  /// In en, this message translates to:
  /// **'Manage the effective and minimum app versions enforced by the mobile app before users can continue.'**
  String get settingsMobileVersionsPageDescription;

  /// No description provided for @settingsMobileVersionsIosTitle.
  ///
  /// In en, this message translates to:
  /// **'iOS'**
  String get settingsMobileVersionsIosTitle;

  /// No description provided for @settingsMobileVersionsIosDescription.
  ///
  /// In en, this message translates to:
  /// **'Set the App Store threshold and update prompt for iPhone and iPad users.'**
  String get settingsMobileVersionsIosDescription;

  /// No description provided for @settingsMobileVersionsAndroidTitle.
  ///
  /// In en, this message translates to:
  /// **'Android'**
  String get settingsMobileVersionsAndroidTitle;

  /// No description provided for @settingsMobileVersionsAndroidDescription.
  ///
  /// In en, this message translates to:
  /// **'Set the Play Store threshold and update prompt for Android users.'**
  String get settingsMobileVersionsAndroidDescription;

  /// No description provided for @settingsMobileVersionsEffectiveVersion.
  ///
  /// In en, this message translates to:
  /// **'Effective version'**
  String get settingsMobileVersionsEffectiveVersion;

  /// No description provided for @settingsMobileVersionsEffectiveVersionDescription.
  ///
  /// In en, this message translates to:
  /// **'Versions below this threshold see a recommended update prompt.'**
  String get settingsMobileVersionsEffectiveVersionDescription;

  /// No description provided for @settingsMobileVersionsMinimumVersion.
  ///
  /// In en, this message translates to:
  /// **'Minimum version'**
  String get settingsMobileVersionsMinimumVersion;

  /// No description provided for @settingsMobileVersionsMinimumVersionDescription.
  ///
  /// In en, this message translates to:
  /// **'Versions below this threshold must update before continuing.'**
  String get settingsMobileVersionsMinimumVersionDescription;

  /// No description provided for @settingsMobileVersionsStoreUrl.
  ///
  /// In en, this message translates to:
  /// **'Store URL'**
  String get settingsMobileVersionsStoreUrl;

  /// No description provided for @settingsMobileVersionsStoreUrlDescription.
  ///
  /// In en, this message translates to:
  /// **'Required whenever either version threshold is set.'**
  String get settingsMobileVersionsStoreUrlDescription;

  /// No description provided for @settingsMobileVersionsVersionPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'1.2.3'**
  String get settingsMobileVersionsVersionPlaceholder;

  /// No description provided for @settingsMobileVersionsStoreUrlPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'https://apps.apple.com/app/id123456789'**
  String get settingsMobileVersionsStoreUrlPlaceholder;

  /// No description provided for @settingsMobileVersionsSave.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get settingsMobileVersionsSave;

  /// No description provided for @settingsMobileVersionsSaving.
  ///
  /// In en, this message translates to:
  /// **'Saving...'**
  String get settingsMobileVersionsSaving;

  /// No description provided for @settingsMobileVersionsSaveSuccess.
  ///
  /// In en, this message translates to:
  /// **'Mobile version policy saved.'**
  String get settingsMobileVersionsSaveSuccess;

  /// No description provided for @settingsMobileVersionsSaveError.
  ///
  /// In en, this message translates to:
  /// **'Failed to save mobile version policy.'**
  String get settingsMobileVersionsSaveError;

  /// No description provided for @settingsMobileVersionsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to load mobile version policies.'**
  String get settingsMobileVersionsLoadError;

  /// No description provided for @settingsMobileVersionsWorkspaceRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Internal workspace required'**
  String get settingsMobileVersionsWorkspaceRequiredTitle;

  /// No description provided for @settingsMobileVersionsWorkspaceRequiredDescription.
  ///
  /// In en, this message translates to:
  /// **'Switch to the internal workspace to manage platform mobile version policies.'**
  String get settingsMobileVersionsWorkspaceRequiredDescription;

  /// No description provided for @settingsMobileVersionsAccessDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Access required'**
  String get settingsMobileVersionsAccessDeniedTitle;

  /// No description provided for @settingsMobileVersionsAccessDeniedDescription.
  ///
  /// In en, this message translates to:
  /// **'You need the workspace roles permission in the internal workspace to manage mobile version policies.'**
  String get settingsMobileVersionsAccessDeniedDescription;

  /// No description provided for @settingsMobileVersionsValidationVersionFormat.
  ///
  /// In en, this message translates to:
  /// **'Use semantic version format x.y.z.'**
  String get settingsMobileVersionsValidationVersionFormat;

  /// No description provided for @settingsMobileVersionsValidationStoreUrlRequired.
  ///
  /// In en, this message translates to:
  /// **'Store URL is required when a version is set.'**
  String get settingsMobileVersionsValidationStoreUrlRequired;

  /// No description provided for @settingsMobileVersionsValidationEffectiveAtLeastMinimum.
  ///
  /// In en, this message translates to:
  /// **'Effective version must be greater than or equal to the minimum version.'**
  String get settingsMobileVersionsValidationEffectiveAtLeastMinimum;

  /// No description provided for @settingsLicensesSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Open-source licenses'**
  String get settingsLicensesSectionTitle;

  /// No description provided for @settingsLicensesSectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Review the third-party software notices bundled with the app.'**
  String get settingsLicensesSectionDescription;

  /// No description provided for @settingsLicenseViewerTitle.
  ///
  /// In en, this message translates to:
  /// **'Open license viewer'**
  String get settingsLicenseViewerTitle;

  /// No description provided for @settingsLicenseViewerDescription.
  ///
  /// In en, this message translates to:
  /// **'Browse Flutter, plugin, and package licenses included in this build.'**
  String get settingsLicenseViewerDescription;

  /// No description provided for @settingsLicenseVersionDescription.
  ///
  /// In en, this message translates to:
  /// **'Reference the installed version while reviewing notices.'**
  String get settingsLicenseVersionDescription;

  /// No description provided for @settingsMinutesUnit.
  ///
  /// In en, this message translates to:
  /// **'min'**
  String get settingsMinutesUnit;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileIdentitySectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get profileIdentitySectionTitle;

  /// No description provided for @profileIdentitySectionDescription.
  ///
  /// In en, this message translates to:
  /// **'Keep the core details people see about your account up to date.'**
  String get profileIdentitySectionDescription;

  /// No description provided for @profileAvatar.
  ///
  /// In en, this message translates to:
  /// **'Avatar'**
  String get profileAvatar;

  /// No description provided for @profileAvatarSet.
  ///
  /// In en, this message translates to:
  /// **'Photo attached'**
  String get profileAvatarSet;

  /// No description provided for @profileAvatarDescription.
  ///
  /// In en, this message translates to:
  /// **'Upload your profile picture'**
  String get profileAvatarDescription;

  /// No description provided for @profileAvatarSectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Avatar'**
  String get profileAvatarSectionTitle;

  /// No description provided for @profileAvatarActionDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose a new photo or refresh the one already attached.'**
  String get profileAvatarActionDescription;

  /// No description provided for @profileAvatarPickerDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose where to pick your new avatar image from.'**
  String get profileAvatarPickerDescription;

  /// No description provided for @workspaceAvatarPickerDescription.
  ///
  /// In en, this message translates to:
  /// **'Choose where to pick your new workspace avatar image from.'**
  String get workspaceAvatarPickerDescription;

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

  /// No description provided for @profileRemoveAvatarDescription.
  ///
  /// In en, this message translates to:
  /// **'Delete the current photo from your account profile.'**
  String get profileRemoveAvatarDescription;

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

  /// No description provided for @profileAccountStatusDescription.
  ///
  /// In en, this message translates to:
  /// **'Membership and verification details for this account.'**
  String get profileAccountStatusDescription;

  /// No description provided for @profileStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get profileStatus;

  /// No description provided for @profileStatusUnknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get profileStatusUnknown;

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

  /// No description provided for @profileDisplayNameDescription.
  ///
  /// In en, this message translates to:
  /// **'This name appears in collaborative surfaces across the app.'**
  String get profileDisplayNameDescription;

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

  /// No description provided for @profileFullNameDescription.
  ///
  /// In en, this message translates to:
  /// **'Use your legal or preferred full name for account records.'**
  String get profileFullNameDescription;

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

  /// No description provided for @profileEmailDescription.
  ///
  /// In en, this message translates to:
  /// **'Updating your email sends confirmation to both the old and new addresses.'**
  String get profileEmailDescription;

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

  /// No description provided for @profileMissingValue.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get profileMissingValue;

  /// No description provided for @profileDangerAction.
  ///
  /// In en, this message translates to:
  /// **'Danger'**
  String get profileDangerAction;

  /// No description provided for @profileEmailPendingChange.
  ///
  /// In en, this message translates to:
  /// **'Pending change to {email}'**
  String profileEmailPendingChange(String email);

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
  /// **'Workspaces'**
  String get workspacePickerTitle;

  /// No description provided for @workspaceDefaultPickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Default workspace'**
  String get workspaceDefaultPickerTitle;

  /// No description provided for @workspaceCurrentBadge.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get workspaceCurrentBadge;

  /// No description provided for @workspaceDefaultBadge.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get workspaceDefaultBadge;

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

  /// No description provided for @workspaceSystemBadge.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get workspaceSystemBadge;

  /// No description provided for @workspaceSystemSection.
  ///
  /// In en, this message translates to:
  /// **'Internal'**
  String get workspaceSystemSection;

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

  /// No description provided for @workspaceCreateDescription.
  ///
  /// In en, this message translates to:
  /// **'Create a fresh space for projects, habits, finance, and more.'**
  String get workspaceCreateDescription;

  /// No description provided for @workspaceCreateSuccess.
  ///
  /// In en, this message translates to:
  /// **'Workspace created.'**
  String get workspaceCreateSuccess;

  /// No description provided for @workspaceCreateSuccessAvatarWarning.
  ///
  /// In en, this message translates to:
  /// **'Workspace created, but profile picture failed to upload.'**
  String get workspaceCreateSuccessAvatarWarning;

  /// No description provided for @workspaceCreateError.
  ///
  /// In en, this message translates to:
  /// **'Failed to create workspace'**
  String get workspaceCreateError;

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

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{count} unread'**
  String notificationsSubtitle(int count);

  /// No description provided for @notificationsInbox.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get notificationsInbox;

  /// No description provided for @notificationsArchive.
  ///
  /// In en, this message translates to:
  /// **'Archive'**
  String get notificationsArchive;

  /// No description provided for @notificationsArchiveAll.
  ///
  /// In en, this message translates to:
  /// **'Archive all'**
  String get notificationsArchiveAll;

  /// No description provided for @notificationsArchiveAllError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t archive notifications right now'**
  String get notificationsArchiveAllError;

  /// No description provided for @notificationsMarkRead.
  ///
  /// In en, this message translates to:
  /// **'Mark as read'**
  String get notificationsMarkRead;

  /// No description provided for @notificationsMarkUnread.
  ///
  /// In en, this message translates to:
  /// **'Mark as unread'**
  String get notificationsMarkUnread;

  /// No description provided for @notificationsLoadingMore.
  ///
  /// In en, this message translates to:
  /// **'Loading more...'**
  String get notificationsLoadingMore;

  /// No description provided for @notificationsInboxEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No unread notifications'**
  String get notificationsInboxEmptyTitle;

  /// No description provided for @notificationsInboxEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'New activity, mentions, and invites will show up here.'**
  String get notificationsInboxEmptyMessage;

  /// No description provided for @notificationsArchiveEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No archived notifications'**
  String get notificationsArchiveEmptyTitle;

  /// No description provided for @notificationsArchiveEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Read notifications will move here after you\'ve cleared them.'**
  String get notificationsArchiveEmptyMessage;

  /// No description provided for @notificationsLoadErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t load notifications'**
  String get notificationsLoadErrorTitle;

  /// No description provided for @notificationsLoadErrorMessage.
  ///
  /// In en, this message translates to:
  /// **'Try again in a moment.'**
  String get notificationsLoadErrorMessage;

  /// No description provided for @notificationsAcceptInvite.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get notificationsAcceptInvite;

  /// No description provided for @notificationsDeclineInvite.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get notificationsDeclineInvite;

  /// No description provided for @notificationsInviteAccepted.
  ///
  /// In en, this message translates to:
  /// **'Invite accepted'**
  String get notificationsInviteAccepted;

  /// No description provided for @notificationsInviteDeclined.
  ///
  /// In en, this message translates to:
  /// **'Invite declined'**
  String get notificationsInviteDeclined;

  /// No description provided for @notificationsInviteActionError.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t update this invite right now'**
  String get notificationsInviteActionError;

  /// No description provided for @notificationsOpenAction.
  ///
  /// In en, this message translates to:
  /// **'Open task'**
  String get notificationsOpenAction;

  /// No description provided for @notificationsOpenUnsupported.
  ///
  /// In en, this message translates to:
  /// **'This notification can\'t be opened yet'**
  String get notificationsOpenUnsupported;

  /// No description provided for @notificationsJustNow.
  ///
  /// In en, this message translates to:
  /// **'Just now'**
  String get notificationsJustNow;

  /// No description provided for @notificationsMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}m ago'**
  String notificationsMinutesAgo(int count);

  /// No description provided for @notificationsHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}h ago'**
  String notificationsHoursAgo(int count);

  /// No description provided for @notificationsDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}d ago'**
  String notificationsDaysAgo(int count);

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

  /// No description provided for @mfaCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'6-digit code'**
  String get mfaCodeLabel;

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

  /// No description provided for @commonOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get commonOff;

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

  /// No description provided for @commonPressBackAgainToExit.
  ///
  /// In en, this message translates to:
  /// **'Press back again to exit'**
  String get commonPressBackAgainToExit;

  /// No description provided for @commonPressBackAgainToExitHint.
  ///
  /// In en, this message translates to:
  /// **'Press back again within 2 seconds to close the app.'**
  String get commonPressBackAgainToExitHint;

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

  /// No description provided for @settingsWorkspaceMembersTitle.
  ///
  /// In en, this message translates to:
  /// **'Members'**
  String get settingsWorkspaceMembersTitle;

  /// No description provided for @settingsWorkspaceMembersSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Invite people, review access, and manage links.'**
  String get settingsWorkspaceMembersSubtitle;

  /// No description provided for @settingsWorkspaceMembersAccessDenied.
  ///
  /// In en, this message translates to:
  /// **'You need member access to manage this workspace.'**
  String get settingsWorkspaceMembersAccessDenied;

  /// No description provided for @settingsWorkspaceMembersActiveSection.
  ///
  /// In en, this message translates to:
  /// **'Members ({count})'**
  String settingsWorkspaceMembersActiveSection(int count);

  /// No description provided for @settingsWorkspaceMembersEmpty.
  ///
  /// In en, this message translates to:
  /// **'No members yet.'**
  String get settingsWorkspaceMembersEmpty;

  /// No description provided for @settingsWorkspaceMembersPendingSection.
  ///
  /// In en, this message translates to:
  /// **'Pending ({count})'**
  String settingsWorkspaceMembersPendingSection(int count);

  /// No description provided for @settingsWorkspaceMembersPendingEmpty.
  ///
  /// In en, this message translates to:
  /// **'No pending invites.'**
  String get settingsWorkspaceMembersPendingEmpty;

  /// No description provided for @settingsWorkspaceMembersLinksSection.
  ///
  /// In en, this message translates to:
  /// **'Invite links'**
  String get settingsWorkspaceMembersLinksSection;

  /// No description provided for @settingsWorkspaceMembersLinksEmpty.
  ///
  /// In en, this message translates to:
  /// **'No invite links yet.'**
  String get settingsWorkspaceMembersLinksEmpty;

  /// No description provided for @settingsWorkspaceMembersInviteAction.
  ///
  /// In en, this message translates to:
  /// **'Invite'**
  String get settingsWorkspaceMembersInviteAction;

  /// No description provided for @settingsWorkspaceMembersLinkAction.
  ///
  /// In en, this message translates to:
  /// **'New link'**
  String get settingsWorkspaceMembersLinkAction;

  /// No description provided for @settingsWorkspaceMembersLinkCopied.
  ///
  /// In en, this message translates to:
  /// **'Invite link copied.'**
  String get settingsWorkspaceMembersLinkCopied;

  /// No description provided for @settingsWorkspaceMembersRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get settingsWorkspaceMembersRemoveTitle;

  /// No description provided for @settingsWorkspaceMembersRemoveMessage.
  ///
  /// In en, this message translates to:
  /// **'Remove {name} from this workspace?'**
  String settingsWorkspaceMembersRemoveMessage(String name);

  /// No description provided for @settingsWorkspaceMembersLinkDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete link'**
  String get settingsWorkspaceMembersLinkDeleteTitle;

  /// No description provided for @settingsWorkspaceMembersLinkDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Delete this invite link?'**
  String get settingsWorkspaceMembersLinkDeleteMessage;

  /// No description provided for @settingsWorkspaceMembersEmailField.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get settingsWorkspaceMembersEmailField;

  /// No description provided for @settingsWorkspaceMembersEmailPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'name@example.com'**
  String get settingsWorkspaceMembersEmailPlaceholder;

  /// No description provided for @settingsWorkspaceMembersEmailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address.'**
  String get settingsWorkspaceMembersEmailInvalid;

  /// No description provided for @settingsWorkspaceMembersInviteSent.
  ///
  /// In en, this message translates to:
  /// **'Invite sent.'**
  String get settingsWorkspaceMembersInviteSent;

  /// No description provided for @settingsWorkspaceMembersLinkLimitField.
  ///
  /// In en, this message translates to:
  /// **'Max uses'**
  String get settingsWorkspaceMembersLinkLimitField;

  /// No description provided for @settingsWorkspaceMembersLinkLimitPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Leave empty for unlimited'**
  String get settingsWorkspaceMembersLinkLimitPlaceholder;

  /// No description provided for @settingsWorkspaceMembersLinkLimitInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a positive whole number.'**
  String get settingsWorkspaceMembersLinkLimitInvalid;

  /// No description provided for @settingsWorkspaceMembersLinkCreated.
  ///
  /// In en, this message translates to:
  /// **'Invite link created.'**
  String get settingsWorkspaceMembersLinkCreated;

  /// No description provided for @settingsWorkspaceMembersCreatorChip.
  ///
  /// In en, this message translates to:
  /// **'Creator'**
  String get settingsWorkspaceMembersCreatorChip;

  /// No description provided for @settingsWorkspaceMembersPendingChip.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get settingsWorkspaceMembersPendingChip;

  /// No description provided for @settingsWorkspaceMembersLinkNever.
  ///
  /// In en, this message translates to:
  /// **'No expiry'**
  String get settingsWorkspaceMembersLinkNever;

  /// No description provided for @settingsWorkspaceMembersLinkExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get settingsWorkspaceMembersLinkExpired;

  /// No description provided for @settingsWorkspaceMembersLinkFull.
  ///
  /// In en, this message translates to:
  /// **'Full'**
  String get settingsWorkspaceMembersLinkFull;

  /// No description provided for @settingsWorkspaceMembersLinkActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get settingsWorkspaceMembersLinkActive;

  /// No description provided for @settingsWorkspaceMembersLinkCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get settingsWorkspaceMembersLinkCopy;

  /// No description provided for @settingsWorkspaceRolesTitle.
  ///
  /// In en, this message translates to:
  /// **'Roles'**
  String get settingsWorkspaceRolesTitle;

  /// No description provided for @settingsWorkspaceRolesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Control default access and workspace roles.'**
  String get settingsWorkspaceRolesSubtitle;

  /// No description provided for @settingsWorkspaceRolesAccessDenied.
  ///
  /// In en, this message translates to:
  /// **'You need role access to manage permissions.'**
  String get settingsWorkspaceRolesAccessDenied;

  /// No description provided for @settingsWorkspaceRolesCreate.
  ///
  /// In en, this message translates to:
  /// **'Create role'**
  String get settingsWorkspaceRolesCreate;

  /// No description provided for @settingsWorkspaceRolesDefaultTitle.
  ///
  /// In en, this message translates to:
  /// **'Default access'**
  String get settingsWorkspaceRolesDefaultTitle;

  /// No description provided for @settingsWorkspaceRolesListTitle.
  ///
  /// In en, this message translates to:
  /// **'Roles'**
  String get settingsWorkspaceRolesListTitle;

  /// No description provided for @settingsWorkspaceRolesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No custom roles yet.'**
  String get settingsWorkspaceRolesEmpty;

  /// No description provided for @settingsWorkspaceRolesDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete role'**
  String get settingsWorkspaceRolesDeleteTitle;

  /// No description provided for @settingsWorkspaceRolesDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Delete {name}?'**
  String settingsWorkspaceRolesDeleteMessage(String name);

  /// No description provided for @settingsWorkspaceRolesPermissionCount.
  ///
  /// In en, this message translates to:
  /// **'{count} permissions enabled'**
  String settingsWorkspaceRolesPermissionCount(int count);

  /// No description provided for @settingsWorkspaceRolesEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit role'**
  String get settingsWorkspaceRolesEdit;

  /// No description provided for @settingsWorkspaceRolesSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get settingsWorkspaceRolesSave;

  /// No description provided for @settingsWorkspaceRolesNameField.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get settingsWorkspaceRolesNameField;

  /// No description provided for @settingsWorkspaceRolesNamePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Role name'**
  String get settingsWorkspaceRolesNamePlaceholder;

  /// No description provided for @settingsWorkspaceRolesNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter a role name.'**
  String get settingsWorkspaceRolesNameRequired;

  /// No description provided for @settingsWorkspaceRolesPermissionsSection.
  ///
  /// In en, this message translates to:
  /// **'Permissions'**
  String get settingsWorkspaceRolesPermissionsSection;

  /// No description provided for @settingsWorkspaceRolesMembersSection.
  ///
  /// In en, this message translates to:
  /// **'Assigned members'**
  String get settingsWorkspaceRolesMembersSection;

  /// No description provided for @settingsWorkspaceRolesMembersEmpty.
  ///
  /// In en, this message translates to:
  /// **'No active members available.'**
  String get settingsWorkspaceRolesMembersEmpty;

  /// No description provided for @settingsWorkspaceRolesSaved.
  ///
  /// In en, this message translates to:
  /// **'Role saved.'**
  String get settingsWorkspaceRolesSaved;
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
