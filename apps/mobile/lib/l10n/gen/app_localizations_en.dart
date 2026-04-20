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
  String get loginContinueWithEmail => 'Continue with email';

  @override
  String get loginOtpInstruction => 'Enter the 6-digit code we sent to your email.';

  @override
  String loginOtpRateLimitedInstruction(Object seconds) {
    return 'Enter your code below, or use password instead. Retry in ${seconds}s.';
  }

  @override
  String get loginResendOtp => 'Resend code';

  @override
  String loginRetryIn(Object seconds) {
    return 'Retry in ${seconds}s';
  }

  @override
  String loginRetryAfter(Object seconds) {
    return 'Try again in ${seconds}s';
  }

  @override
  String get loginSignIn => 'Sign in';

  @override
  String get loginSendOtp => 'Send code';

  @override
  String get loginUseOtpInstead => 'Use email code instead';

  @override
  String get loginUsePasswordInstead => 'Use password instead';

  @override
  String get loginVerifyOtp => 'Verify code';

  @override
  String get authContinueWithApple => 'Continue with Apple';

  @override
  String get authContinueWithGithub => 'Continue with GitHub';

  @override
  String get authContinueWithGoogle => 'Continue with Google';

  @override
  String get authContinueWithMicrosoft => 'Continue with Microsoft';

  @override
  String get authContinueWithEmail => 'or continue with email';

  @override
  String get authContinueWithSocial => 'or use a social account';

  @override
  String get authAppleSignInFailed => 'Apple sign-in failed. Please try again.';

  @override
  String get authAppleBrowserLaunchFailed => 'Unable to open Apple sign-in right now.';

  @override
  String get authGithubBrowserLaunchFailed => 'Unable to open GitHub sign-in right now.';

  @override
  String get authGoogleSignInFailed => 'Google sign-in failed. Please try again.';

  @override
  String get authGoogleBrowserLaunchFailed => 'Unable to open Google sign-in right now.';

  @override
  String get authMicrosoftBrowserLaunchFailed => 'Unable to open Microsoft sign-in right now.';

  @override
  String get authAddAccount => 'Add account';

  @override
  String get authAddAccountDescription => 'Sign in with another account on this device.';

  @override
  String get authAddAccountFailed => 'Couldn\'t start adding another account.';

  @override
  String get authAddAccountHint => 'You\'re adding another account to this device.';

  @override
  String get authAddAccountTitle => 'Add account';

  @override
  String get authLogOut => 'Log out';

  @override
  String get authLogOutCurrent => 'Log out current account';

  @override
  String get authLogOutConfirmDialogTitle => 'Log out from this device?';

  @override
  String get authLogOutConfirmDialogBody => 'We\'ll switch to another saved account if one is available.';

  @override
  String get authLogOutCurrentConfirm => 'Log out this account from this device? If another account exists, we will switch to it automatically.';

  @override
  String get authLogOutCurrentDescription => 'Sign out this account and switch to another saved account if available.';

  @override
  String get authLogOutCurrentFailed => 'Couldn\'t log out this account.';

  @override
  String get authLogOutCurrentSuccess => 'Logged out current account.';

  @override
  String get authNoStoredAccounts => 'No saved accounts yet.';

  @override
  String get authSwitchAccount => 'Manage accounts';

  @override
  String get authSwitchAccountDescription => 'Switch accounts or add another.';

  @override
  String get authSwitchAccountFailed => 'Couldn\'t switch account.';

  @override
  String get authSwitchAccountSuccess => 'Switched account.';

  @override
  String get authRemoveAccount => 'Remove account';

  @override
  String authRemoveAccountConfirm(Object name) {
    return 'Remove $name from this device? You\'ll need to sign in again.';
  }

  @override
  String get authRemoveAccountFailed => 'Couldn\'t remove this account.';

  @override
  String get authRemoveAccountSuccess => 'Account removed successfully.';

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
  String get signUpSubtitle => 'Choose a provider to continue.';

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
  String get signUpAlreadyHaveAccountPrompt => 'Already have an account?';

  @override
  String get signUpSignIn => 'Sign in';

  @override
  String get forgotPasswordTitle => 'Password help';

  @override
  String get forgotPasswordDescription => 'Use the web app to update your password.';

  @override
  String get forgotPasswordInstructions => 'Sign in on the web with a social account already linked to your email, then change your password from account settings.';

  @override
  String get forgotPasswordNote => 'Email-based password reset is not supported at this time.';

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
  String get appUpdateChecking => 'Checking app version...';

  @override
  String get appUpdateNow => 'Update now';

  @override
  String get appUpdateLater => 'Later';

  @override
  String get appUpdateRecommendedTitle => 'Update available';

  @override
  String get appUpdateRecommendedMessage => 'A newer version of the app is available. Update now for the latest fixes and improvements.';

  @override
  String get appUpdateRequiredTitle => 'Update required';

  @override
  String get appUpdateRequiredMessage => 'This app version is no longer supported. Update to continue using the app.';

  @override
  String get navHome => 'Home';

  @override
  String get navTasks => 'Tasks';

  @override
  String get navHabits => 'Habits';

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
  String get navBack => 'Back';

  @override
  String get commonClear => 'Clear';

  @override
  String get commonDone => 'Done';

  @override
  String get navMore => 'More';

  @override
  String get sort => 'Sort';

  @override
  String get sortBy => 'Sort by';

  @override
  String get appsHubSearchHint => 'Search apps';

  @override
  String get appsHubQuickAccess => 'Quick access';

  @override
  String get appsHubAllApps => 'All apps';

  @override
  String get appsHubEmpty => 'No apps found';

  @override
  String get appsHubHeroTitle => 'Workspace tools';

  @override
  String get appsHubHeroSubtitle => 'Choose a tool to open.';

  @override
  String get appsHubFeatured => 'Featured';

  @override
  String get appsHubMoreTools => 'More tools';

  @override
  String get appsHubSearchResults => 'Search results';

  @override
  String get appsHubOpenApp => 'Open';

  @override
  String get appsHubTasksDescription => 'Assignments, boards, estimates, and portfolio planning.';

  @override
  String get appsHubHabitsDescription => 'Track shared routines, streaks, and recurring progress.';

  @override
  String get appsHubCalendarDescription => 'See your agenda, upcoming events, and calendar views.';

  @override
  String get appsHubFinanceDescription => 'Manage wallets, categories, tags, and transaction history.';

  @override
  String get appsHubInventoryDescription => 'Run products, stock, sales, and booth operations in one place.';

  @override
  String get appsHubNotificationsDescription => 'Review inbox activity, alerts, and archived updates.';

  @override
  String get appsHubSettingsDescription => 'Adjust app, workspace, and personal preferences.';

  @override
  String get appsHubTimerDescription => 'Track sessions, review stats, and handle time requests.';

  @override
  String get habitsTitle => 'Habits';

  @override
  String get habitsOverviewLabel => 'Today';

  @override
  String get habitsTodayLabel => 'Today';

  @override
  String get habitsActivityLabel => 'Activity';

  @override
  String get habitsLibraryLabel => 'Library';

  @override
  String get habitsActivityTitle => 'Activity';

  @override
  String get habitsActivitySubtitle => 'Review the latest habit logs across every tracker in this workspace.';

  @override
  String get habitsLibraryTitle => 'Library';

  @override
  String get habitsLibrarySubtitle => 'Start from strong defaults for fitness, recovery, and disciplined daily routines.';

  @override
  String get habitsLoadError => 'Couldn\'t load habits right now';

  @override
  String get habitsSummarySubtitle => 'Track rituals, routines, and shared momentum across your workspace.';

  @override
  String get habitsSummaryVolume => 'Current volume';

  @override
  String get habitsSummaryTargetsMet => 'Targets met';

  @override
  String get habitsSummaryTopStreak => 'Top streak';

  @override
  String get habitsSummaryTrackers => 'Trackers';

  @override
  String get habitsScopeSelf => 'Self';

  @override
  String get habitsScopeTeam => 'Team';

  @override
  String get habitsScopeMember => 'Member';

  @override
  String get habitsMemberPickerLabel => 'View member';

  @override
  String get habitsSearchHint => 'Search habits, rituals, or metrics';

  @override
  String get habitsEmptyTitle => 'No habit trackers yet';

  @override
  String get habitsEmptyDescription => 'Create your first tracker to turn recurring habits into something the whole workspace can follow.';

  @override
  String get habitsTrackerNoDescription => 'No description yet';

  @override
  String get habitsCreateTrackerAction => 'Create tracker';

  @override
  String get habitsSaveTrackerAction => 'Save tracker';

  @override
  String get habitsCreateTrackerTitle => 'Create habit tracker';

  @override
  String get habitsEditTrackerTitle => 'Edit habit tracker';

  @override
  String get habitsCreateTrackerDescription => 'Define the goal, logging fields, and quick actions your workspace will use.';

  @override
  String get habitsEditTrackerDescription => 'Update the tracker structure, goal, and quick-add behavior.';

  @override
  String get habitsTemplateLabel => 'Start from a template';

  @override
  String get habitsNameLabel => 'Name';

  @override
  String get habitsNameRequired => 'Tracker name is required';

  @override
  String get habitsDescriptionLabel => 'Description';

  @override
  String get habitsTrackingModeLabel => 'Tracking mode';

  @override
  String get habitsModeDailySummary => 'Daily summary';

  @override
  String get habitsModeEventLog => 'Event log';

  @override
  String get habitsAggregationLabel => 'Aggregation';

  @override
  String get habitsAggregationSum => 'Sum';

  @override
  String get habitsAggregationMax => 'Max';

  @override
  String get habitsAggregationCountEntries => 'Count entries';

  @override
  String get habitsAggregationBooleanAny => 'Any complete';

  @override
  String get habitsTargetPeriodLabel => 'Target period';

  @override
  String get habitsPeriodDaily => 'Daily';

  @override
  String get habitsPeriodWeekly => 'Weekly';

  @override
  String get habitsTargetOperatorLabel => 'Target operator';

  @override
  String get habitsTargetOperatorEq => 'Exactly';

  @override
  String get habitsTargetOperatorGte => 'At least';

  @override
  String get habitsTargetValueLabel => 'Target value';

  @override
  String get habitsTargetValueRequired => 'Target value must be greater than zero';

  @override
  String get habitsStartDateLabel => 'Start date';

  @override
  String get habitsAppearanceLabel => 'Appearance';

  @override
  String get habitsIconLabel => 'Icon';

  @override
  String get habitsFieldsTitle => 'Fields';

  @override
  String get habitsFieldsRequired => 'Add at least one valid field';

  @override
  String get habitsAddField => 'Add field';

  @override
  String get habitsPrimaryMetricLabel => 'Primary metric';

  @override
  String get habitsPrimaryMetricRequired => 'Choose a primary metric field';

  @override
  String get habitsQuickAddValuesLabel => 'Quick-add values';

  @override
  String get habitsQuickAddValuesHint => 'Example: 1, 2, 3';

  @override
  String get habitsFreezeAllowanceLabel => 'Freeze allowance';

  @override
  String get habitsRecoveryWindowLabel => 'Recovery windows';

  @override
  String get habitsActiveLabel => 'Active';

  @override
  String get habitsFieldKeysUnique => 'Field keys must be unique';

  @override
  String get habitsSelectOptionsRequired => 'Select fields need at least one option';

  @override
  String get habitsComposerQuickCheck => 'Quick check';

  @override
  String get habitsComposerQuickIncrement => 'Quick increment';

  @override
  String get habitsComposerMeasurement => 'Measurement';

  @override
  String get habitsComposerWorkoutSession => 'Workout';

  @override
  String get habitsComposerAdvancedCustom => 'Custom';

  @override
  String habitsFieldCardTitle(int count) {
    return 'Field $count';
  }

  @override
  String get habitsFieldLabel => 'Field label';

  @override
  String get habitsFieldType => 'Field type';

  @override
  String get habitsFieldKey => 'Field key';

  @override
  String get habitsFieldUnit => 'Unit';

  @override
  String get habitsFieldOptions => 'Options';

  @override
  String get habitsFieldOptionsHint => 'Example: easy, medium, hard';

  @override
  String get habitsFieldRequired => 'Required field';

  @override
  String get habitsFieldTypeBoolean => 'Boolean';

  @override
  String get habitsFieldTypeNumber => 'Number';

  @override
  String get habitsFieldTypeDuration => 'Duration';

  @override
  String get habitsFieldTypeText => 'Text';

  @override
  String get habitsFieldTypeSelect => 'Select';

  @override
  String get habitsOverviewTab => 'Overview';

  @override
  String get habitsEntriesTab => 'Entries';

  @override
  String get habitsLeaderboardTab => 'Leaderboard';

  @override
  String get habitsLogEntryTitle => 'Log entry';

  @override
  String get habitsLogEntryDescription => 'Capture a habit update without leaving the habits area.';

  @override
  String get habitsLogEntryAction => 'Log entry';

  @override
  String get habitsLogMeasurementAction => 'Log measurement';

  @override
  String get habitsLogSessionAction => 'Log session';

  @override
  String get habitsCompleteNow => 'Complete now';

  @override
  String get habitsEntryDateLabel => 'Entry date';

  @override
  String get habitsEntryNoteLabel => 'Note';

  @override
  String get habitsEntryTagsLabel => 'Tags';

  @override
  String get habitsEntryTagsHint => 'Comma-separated tags';

  @override
  String get habitsSaveEntry => 'Save entry';

  @override
  String get habitsQuickCheckTitle => 'Quick check-in';

  @override
  String get habitsQuickCheckDescription => 'Use one tap when this habit is simply done or not done.';

  @override
  String get habitsQuickIncrementTitle => 'Quick increments';

  @override
  String get habitsQuickIncrementDescription => 'Adjust the running total with fast chips or enter a custom amount.';

  @override
  String get habitsMeasurementTitle => 'Measurement';

  @override
  String get habitsMeasurementDescription => 'Enter one focused measurement and compare it to the latest check-in.';

  @override
  String get habitsAdvancedComposerTitle => 'Custom entry';

  @override
  String get habitsAdvancedComposerDescription => 'Use a simple value entry for fully custom trackers.';

  @override
  String get habitsWorkoutSessionTitle => 'Workout session';

  @override
  String get habitsWorkoutSessionDescription => 'Add one or more exercise blocks with sets, reps, and optional load.';

  @override
  String get habitsWorkoutBlocksRequired => 'Add at least one exercise block';

  @override
  String get habitsWorkoutBlockTitle => 'Exercise block';

  @override
  String get habitsWorkoutExerciseName => 'Exercise';

  @override
  String get habitsWorkoutSets => 'Sets';

  @override
  String get habitsWorkoutReps => 'Reps';

  @override
  String get habitsWorkoutWeight => 'Weight';

  @override
  String get habitsWorkoutTotalSets => 'Total sets';

  @override
  String get habitsWorkoutTotalReps => 'Total reps';

  @override
  String get habitsWorkoutTotalVolume => 'Total volume';

  @override
  String get habitsAddExerciseBlock => 'Add exercise';

  @override
  String habitsLatestValueLabel(String value) {
    return 'Latest: $value';
  }

  @override
  String get habitsMarkDone => 'Mark done';

  @override
  String get habitsMarkedDone => 'Marked done';

  @override
  String get habitsFormRequiredField => 'Please complete the required fields';

  @override
  String get habitsFormInvalidNumber => 'Enter a valid number';

  @override
  String get habitsArchiveTrackerTitle => 'Archive habit tracker?';

  @override
  String get habitsArchiveTrackerMessage => 'This tracker will be removed from the active habits view.';

  @override
  String get habitsArchiveTrackerAction => 'Archive tracker';

  @override
  String get habitsDeleteEntryTitle => 'Delete entry?';

  @override
  String get habitsDeleteEntryMessage => 'This habit entry will be permanently removed.';

  @override
  String get habitsDeleteEntryAction => 'Delete entry';

  @override
  String get habitsEditTrackerAction => 'Edit tracker';

  @override
  String get habitsCurrentStreak => 'Current streak';

  @override
  String get habitsBestStreak => 'Best streak';

  @override
  String get habitsConsistencyLabel => 'Consistency';

  @override
  String get habitsRecoveryWindowTitle => 'Recovery window';

  @override
  String get habitsRecoveryWindowDescription => 'Use a repair or freeze when a streak period needs help staying intact.';

  @override
  String get habitsRepairStreakAction => 'Repair streak';

  @override
  String get habitsUseFreezeAction => 'Use freeze';

  @override
  String get habitsCurrentPeriodMetricsTitle => 'Current period metrics';

  @override
  String habitsEntriesCountLabel(int count) {
    return '$count entries';
  }

  @override
  String get habitsMemberSummariesTitle => 'Member summaries';

  @override
  String get habitsTeamSummaryTitle => 'Team summary';

  @override
  String get habitsTopStreakLabel => 'Top streak';

  @override
  String get habitsEntriesLabel => 'Entries';

  @override
  String get habitsNoEntries => 'No entries yet';

  @override
  String get habitsNoLeaderboard => 'No leaderboard data yet';

  @override
  String get habitsActivityEmptyTitle => 'No logs yet';

  @override
  String get habitsActivityEmptyBody => 'When someone logs a habit entry, it will appear here.';

  @override
  String get habitsActivityNoTrackers => 'Create a habit tracker first to start collecting activity.';

  @override
  String get habitsLibraryStrengthTitle => 'Strength';

  @override
  String get habitsLibraryStrengthSubtitle => 'Heavy sessions, structured lifts, and bodyweight output.';

  @override
  String get habitsLibraryHealthTitle => 'Health';

  @override
  String get habitsLibraryHealthSubtitle => 'Measurements and daily totals that keep your baseline visible.';

  @override
  String get habitsLibraryRecoveryTitle => 'Recovery';

  @override
  String get habitsLibraryRecoverySubtitle => 'Sleep, sauna, meditation, and reset rituals.';

  @override
  String get habitsLibraryDisciplineTitle => 'Discipline';

  @override
  String get habitsLibraryDisciplineSubtitle => 'Simple yes-or-no commitments you want to see every day.';

  @override
  String get habitsLibraryCustomizeTitle => 'Customize your own';

  @override
  String get habitsLibraryCustomizeDescription => 'Start from a blank tracker when the preset library is close but not exact.';

  @override
  String get habitsLibraryCustomizeAction => 'Customize';

  @override
  String get habitsLibraryGoalChip => 'Goal';

  @override
  String get habitsLibraryComposerChip => 'Composer';

  @override
  String habitsStreakChip(int count) {
    return '$count streak';
  }

  @override
  String habitsTargetChip(double count) {
    return '$count target';
  }

  @override
  String get habitsTeamMembers => 'Team members';

  @override
  String get habitsTodayTotalHint => 'Today\'s total';

  @override
  String get habitsQuickLogValueRequired => 'Enter a value before saving';

  @override
  String get habitsMetricMet => 'Met';

  @override
  String get habitsMetricPending => 'Pending';

  @override
  String get assistantComingSoon => 'Coming Soon';

  @override
  String get assistantSelectWorkspace => 'Select a workspace';

  @override
  String get assistantWorkspaceAwareDescription => 'Your AI assistant for planning, questions, and quick actions.';

  @override
  String get assistantHistoryTitle => 'Recent chats';

  @override
  String get assistantHistoryEmpty => 'No chats yet. Start a new conversation to create one.';

  @override
  String get assistantUntitledChat => 'Untitled chat';

  @override
  String get assistantPersonalWorkspace => 'Personal';

  @override
  String get assistantSettingsTitle => 'Assistant settings';

  @override
  String get assistantSendAction => 'Send message';

  @override
  String get assistantActionsTitle => 'Action';

  @override
  String get assistantRenameTitle => 'Rename Assistant';

  @override
  String get assistantRenameAction => 'Rename';

  @override
  String get assistantCancelAction => 'Cancel';

  @override
  String get assistantSaveAction => 'Save';

  @override
  String get assistantCreditsTitle => 'Credits';

  @override
  String get assistantConversationTitle => 'Conversation';

  @override
  String get assistantAttachFilesAction => 'Attach files';

  @override
  String get assistantEnterFullscreenAction => 'Enter fullscreen';

  @override
  String get assistantExitFullscreenAction => 'Exit fullscreen';

  @override
  String get assistantPersonalCredits => 'Personal credits';

  @override
  String get assistantWorkspaceCredits => 'Workspace credits';

  @override
  String get assistantTasksLabel => 'Tasks';

  @override
  String get assistantCalendarLabel => 'Calendar';

  @override
  String get assistantActiveLabel => 'active';

  @override
  String get assistantDoneTodayLabel => 'done today';

  @override
  String get assistantUpcomingLabel => 'upcoming';

  @override
  String get assistantYouLabel => 'You';

  @override
  String get assistantThinkingStatus => 'Thinking...';

  @override
  String get assistantReasoningLabel => 'Reasoning';

  @override
  String get assistantAskPlaceholder => 'Ask anything...';

  @override
  String get assistantQueuedPrefix => 'Queued:';

  @override
  String get assistantQuickPromptCalendar => 'Summarize my calendar for today';

  @override
  String get assistantQuickPromptTasks => 'Show my most urgent tasks';

  @override
  String get assistantQuickPromptFocus => 'Help me plan my next focus block';

  @override
  String get assistantQuickPromptExpense => 'Log a quick expense for lunch';

  @override
  String get assistantNewConversation => 'New conversation';

  @override
  String get assistantExportChat => 'Export chat';

  @override
  String get assistantModelLabel => 'Model';

  @override
  String get assistantModeFast => 'Fast';

  @override
  String get assistantModeThinking => 'Thinking';

  @override
  String get assistantImmersiveLabel => 'Immersive';

  @override
  String get assistantStandardLabel => 'Standard';

  @override
  String get assistantViewOnlyLabel => 'View only';

  @override
  String get assistantEditableLabel => 'Editable';

  @override
  String get assistantSourceLabel => 'Source';

  @override
  String get assistantSourcePersonal => 'Personal';

  @override
  String get assistantSourceWorkspace => 'Workspace';

  @override
  String get assistantToolLabel => 'Tool';

  @override
  String get assistantInputLabel => 'Input';

  @override
  String get assistantOutputLabel => 'Output';

  @override
  String get assistantSeeMoreLabel => 'See more';

  @override
  String get assistantSeeLessLabel => 'See less';

  @override
  String get assistantExportShareText => 'Chat export';

  @override
  String get assistantAttachmentClearAction => 'Clear attachments';

  @override
  String get assistantAttachmentSheetTitle => 'Attachments';

  @override
  String get assistantAttachmentUploadPending => 'Wait for attachment uploads to finish before sending.';

  @override
  String get assistantContextUpdatedLabel => 'Workspace context updated';

  @override
  String get assistantPreferencesUpdatedLabel => 'Assistant preferences updated';

  @override
  String get assistantStarterBacklog => 'Backlog cleanup';

  @override
  String get assistantStarterCaptionBacklog => 'Break open tasks into a clean next-step list.';

  @override
  String get assistantStarterCaptionDraft => 'Shape a concise update before you send it.';

  @override
  String get assistantStarterCaptionFocus => 'Let Mira surface the best next move.';

  @override
  String get assistantStarterCaptionPlan => 'Balance meetings, tasks, and real focus time.';

  @override
  String get assistantStarterDraft => 'Team update';

  @override
  String get assistantStarterFocus => 'Today\'s focus';

  @override
  String get assistantStarterPlan => 'Day plan';

  @override
  String get assistantStarterSubtitle => 'Pick a quick starter or type your own.';

  @override
  String get assistantStarterTitle => 'Need a place to start?';

  @override
  String get assistantShowBottomNavLabel => 'Show bottom nav';

  @override
  String get assistantHideBottomNavLabel => 'Hide bottom nav';

  @override
  String assistantLiveAccessSummary(String workspace, String source) {
    return '$workspace • $source';
  }

  @override
  String assistantLiveAccessUsingPersonal(String tier) {
    return 'Using personal $tier';
  }

  @override
  String assistantLiveAccessUsingWorkspace(String tier) {
    return 'Using workspace $tier';
  }

  @override
  String get assistantLiveCameraPreview => 'Live camera';

  @override
  String get assistantLiveConnect => 'Start live session';

  @override
  String get assistantLiveDescriptionConnecting => 'Creating a direct Gemini Live session for text, audio, and camera input.';

  @override
  String get assistantLiveDescriptionError => 'The live session hit an error. Retry or start a fresh session.';

  @override
  String get assistantLiveDescriptionIdle => 'Start a live session to talk, type, or stream camera context into the same assistant chat.';

  @override
  String get assistantLiveDescriptionListening => 'Microphone streaming is active. Mira will keep listening for new audio input.';

  @override
  String get assistantLiveDescriptionPreparing => 'Minting an ephemeral token and restoring the last resumable live session.';

  @override
  String get assistantLiveDescriptionReady => 'Live text and audio are ready. Type a turn, talk, or share your camera feed.';

  @override
  String get assistantLiveDescriptionReconnecting => 'The session is reconnecting with the latest resumable handle and restored history.';

  @override
  String get assistantLiveDisconnect => 'End live session';

  @override
  String get assistantLiveDraftAssistant => 'Mira is replying';

  @override
  String get assistantLiveDraftUser => 'You are speaking';

  @override
  String get assistantLiveHideCamera => 'Hide camera';

  @override
  String get assistantLiveInsightsTitle => 'Live insights';

  @override
  String get assistantLiveListen => 'Open mic';

  @override
  String get assistantLiveMute => 'Mute mic';

  @override
  String get assistantLiveNoMessagesBody => 'Use voice, text, or attachments to start a chat. Everything from the live session will sync back into this thread.';

  @override
  String get assistantLiveNoMessagesTitle => 'Your live assistant is ready';

  @override
  String get assistantLivePermissionDenied => 'Camera or microphone access is blocked. Enable permissions to use the full live mode.';

  @override
  String assistantLiveReconnectBanner(String timeLeft) {
    return 'Session rotation detected. Reconnecting with about $timeLeft remaining.';
  }

  @override
  String get assistantLiveShowCamera => 'Show camera';

  @override
  String get assistantLiveStatusAvailable => 'Available';

  @override
  String get assistantLiveStatusConnecting => 'Connecting';

  @override
  String get assistantLiveStatusDisconnected => 'Offline';

  @override
  String get assistantLiveStatusError => 'Needs attention';

  @override
  String get assistantLiveStatusPreparing => 'Preparing';

  @override
  String get assistantLiveStatusReady => 'Live';

  @override
  String get assistantLiveStatusReconnecting => 'Reconnecting';

  @override
  String get assistantLiveStatusSyncing => 'Syncing';

  @override
  String get assistantLiveStatusUnavailable => 'Unavailable';

  @override
  String get assistantLiveSubtitle => 'Gemini 3.1 Flash Live with voice, camera, attachments, and unified chat history.';

  @override
  String get assistantLiveTierRequired => 'Live voice is available on PLUS and above.';

  @override
  String get assistantLiveTitle => 'Live assistant';

  @override
  String get assistantLiveInfoAccessHeading => 'Current access';

  @override
  String get assistantLiveInfoDismiss => 'Got it';

  @override
  String assistantLiveWorkspaceTierLabel(String tier) {
    return 'Workspace $tier';
  }

  @override
  String get assistantMermaidDiagramLabel => 'Diagram';

  @override
  String get assistantMermaidRenderError => 'Couldn\'t render this Mermaid diagram.';

  @override
  String get assistantMermaidZoomHint => 'Pinch or use the zoom controls to inspect the diagram in fullscreen.';

  @override
  String get assistantMermaidZoomIn => 'Zoom in';

  @override
  String get assistantMermaidZoomOut => 'Zoom out';

  @override
  String get assistantMermaidZoomReset => 'Reset zoom';

  @override
  String get assistantCopyMessageAction => 'Copy message';

  @override
  String get assistantCopiedMessageAction => 'Copied';

  @override
  String get assistantScrollToBottomAction => 'Scroll to bottom';

  @override
  String get assistantToolCompleted => 'Completed';

  @override
  String get assistantToolGeneratedImage => 'Generated image';

  @override
  String get assistantToolImageUnavailable => 'The generated image is unavailable right now.';

  @override
  String get assistantToolNoActionNeeded => 'No tools were needed for this reply.';

  @override
  String get assistantToolSelectedTools => 'Selected tools';

  @override
  String get assistantToolsLabel => 'Tools';

  @override
  String assistantCreditsSummary(int remaining, String tier) {
    return '$remaining remaining • $tier';
  }

  @override
  String get dashboardGreeting => 'Welcome back!';

  @override
  String get dashboardQuickActions => 'Quick actions';

  @override
  String get dashboardTodayTitle => 'Today at a glance';

  @override
  String get dashboardActiveTasksLabel => 'Active tasks';

  @override
  String get dashboardQuickLaunch => 'Quick launch';

  @override
  String get dashboardAssignedToMe => 'Assigned to me';

  @override
  String get dashboardUpcomingEvents => 'Upcoming events';

  @override
  String get dashboardOpenTasks => 'Open';

  @override
  String get dashboardOpenCalendar => 'Open';

  @override
  String get dashboardNoAssignedTasks => 'No active tasks assigned to you.';

  @override
  String get dashboardNoAssignedTasksDescription => 'You\'re clear for now. New work will appear here.';

  @override
  String get dashboardNoUpcomingEvents => 'No upcoming timed events in the next 7 days.';

  @override
  String get dashboardNoUpcomingEventsDescription => 'Your schedule looks open.';

  @override
  String get dashboardTaskOverdue => 'Overdue';

  @override
  String get dashboardTaskToday => 'Today';

  @override
  String get dashboardTaskTomorrow => 'Tomorrow';

  @override
  String get dashboardTaskUpcoming => 'Upcoming';

  @override
  String get dashboardTaskNoDate => 'No due date';

  @override
  String get dashboardEventAllDay => 'All day';

  @override
  String dashboardTasksMetric(Object count) {
    return '$count active';
  }

  @override
  String dashboardOverdueMetric(Object count) {
    return '$count overdue';
  }

  @override
  String dashboardEventsMetric(Object count) {
    return '$count next up';
  }

  @override
  String get tasksTitle => 'Tasks';

  @override
  String get tasksEmpty => 'No tasks yet';

  @override
  String get tasksLoadError => 'Couldn\'t load tasks right now';

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
  String get tasksGoodMorning => 'Good morning';

  @override
  String get tasksGoodAfternoon => 'Good afternoon';

  @override
  String get tasksGoodEvening => 'Good evening';

  @override
  String get tasksGoodNight => 'Good night';

  @override
  String get tasksRequiresAttention => 'Requires attention';

  @override
  String get tasksCompleteByEndOfDay => 'Complete by end of day';

  @override
  String get tasksPlanAhead => 'Plan ahead';

  @override
  String get tasksCompleted => 'Completed';

  @override
  String tasksCompletedCount(int count) {
    return '$count completed';
  }

  @override
  String get tasksPriorityCritical => 'Critical';

  @override
  String get tasksPriorityHigh => 'High';

  @override
  String get tasksPriorityNormal => 'Normal';

  @override
  String get tasksPriorityLow => 'Low';

  @override
  String get tasksUntitled => 'Untitled task';

  @override
  String get taskBoardsTitle => 'Boards';

  @override
  String get taskBoardsCreate => 'Create board';

  @override
  String get taskBoardsEdit => 'Edit board';

  @override
  String get taskBoardsDelete => 'Delete board';

  @override
  String get taskBoardsDeleteForever => 'Delete forever';

  @override
  String get taskBoardsDuplicate => 'Duplicate board';

  @override
  String get taskBoardsArchive => 'Archive board';

  @override
  String get taskBoardsUnarchive => 'Unarchive board';

  @override
  String get taskBoardsRestore => 'Restore board';

  @override
  String get taskBoardsCreated => 'Board created.';

  @override
  String get taskBoardsUpdated => 'Board updated.';

  @override
  String get taskBoardsDeleted => 'Board moved to recently deleted.';

  @override
  String get taskBoardsDeletedForever => 'Board permanently deleted.';

  @override
  String get taskBoardsDuplicated => 'Board duplicated.';

  @override
  String get taskBoardsArchived => 'Board archived.';

  @override
  String get taskBoardsUnarchived => 'Board unarchived.';

  @override
  String get taskBoardsRestored => 'Board restored.';

  @override
  String get taskBoardsLoadError => 'Couldn\'t load boards right now';

  @override
  String get taskBoardsNameLabel => 'Board name';

  @override
  String get taskBoardsNamePlaceholder => 'Untitled board';

  @override
  String get taskBoardsNameRequired => 'Board name is required';

  @override
  String get taskBoardsIconLabel => 'Board icon';

  @override
  String get taskBoardsIconPlaceholder => 'Select icon';

  @override
  String get taskBoardsIconPickerTitle => 'Select board icon';

  @override
  String get taskBoardsIconPickerSearch => 'Search icons';

  @override
  String get taskBoardsIconPickerEmpty => 'No icons found';

  @override
  String get taskBoardsAccessDeniedTitle => 'Access restricted';

  @override
  String get taskBoardsAccessDeniedDescription => 'You need project management permission in this workspace to manage task boards.';

  @override
  String get taskBoardsFilterAll => 'All';

  @override
  String get taskBoardsFilterActive => 'Active';

  @override
  String get taskBoardsFilterArchived => 'Archived';

  @override
  String get taskBoardsFilterRecentlyDeleted => 'Recently deleted';

  @override
  String get taskBoardsPageSize => 'Page size';

  @override
  String taskBoardsPageSizeOption(int count) {
    return '$count items';
  }

  @override
  String taskBoardsPageInfo(int current, int total) {
    return 'Page $current of $total';
  }

  @override
  String taskBoardsListsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count lists',
      one: '$count list',
    );
    return '$_temp0';
  }

  @override
  String taskBoardsTasksCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tasks',
      one: '$count task',
    );
    return '$_temp0';
  }

  @override
  String get taskBoardsCreatedAt => 'Created';

  @override
  String get taskBoardsRecentlyDeleted => 'Recently deleted';

  @override
  String get taskBoardsDeleteConfirm => 'Move this board to recently deleted?';

  @override
  String get taskBoardsDeleteForeverConfirm => 'Permanently delete this board? This action cannot be undone.';

  @override
  String get taskBoardsEmptyTitle => 'No boards yet';

  @override
  String get taskBoardsEmptyDescription => 'Create your first board to organize tasks.';

  @override
  String get taskBoardsEmptyArchivedTitle => 'No archived boards';

  @override
  String get taskBoardsEmptyArchivedDescription => 'Archived boards will appear here.';

  @override
  String get taskBoardsEmptyDeletedTitle => 'No recently deleted boards';

  @override
  String get taskBoardsEmptyDeletedDescription => 'Deleted boards will appear here before permanent removal.';

  @override
  String get taskBoardDetailLoadError => 'Couldn\'t load board details right now';

  @override
  String get taskBoardDetailUntitledBoard => 'Untitled board';

  @override
  String get taskBoardDetailUntitledList => 'Untitled list';

  @override
  String get taskBoardDetailUntitledTask => 'Untitled task';

  @override
  String get taskBoardDetailListView => 'List';

  @override
  String get taskBoardDetailKanbanView => 'Kanban';

  @override
  String get taskBoardDetailTimelineView => 'Timeline';

  @override
  String get taskBoardDetailSearchTitle => 'Search tasks';

  @override
  String get taskBoardDetailSearchPlaceholder => 'Search tasks';

  @override
  String get taskBoardDetailSearchDone => 'Done';

  @override
  String get taskBoardDetailNoListsTitle => 'No lists yet';

  @override
  String get taskBoardDetailNoListsDescription => 'Create a list to start organizing tasks in this board.';

  @override
  String get taskBoardDetailNoTasksInList => 'No tasks in this list';

  @override
  String get taskBoardDetailNoMatchingTasks => 'No tasks match your search.';

  @override
  String get taskBoardDetailTimelineEmptyTitle => 'No scheduled tasks yet';

  @override
  String get taskBoardDetailTimelineEmptyDescription => 'Add start and end dates to tasks to place them on the timeline.';

  @override
  String get taskBoardDetailTimelineUnscheduledTitle => 'Unscheduled tasks';

  @override
  String get taskBoardDetailTaskActions => 'Task actions';

  @override
  String get taskBoardDetailMoveTask => 'Move task';

  @override
  String get taskBoardDetailTaskMoved => 'Task moved.';

  @override
  String get taskBoardDetailCreateTask => 'Create task';

  @override
  String get taskBoardDetailEditTask => 'Edit task';

  @override
  String get taskBoardDetailTaskTitleLabel => 'Title';

  @override
  String get taskBoardDetailTaskTitleHint => 'Untitled task';

  @override
  String get taskBoardDetailTaskTitleRequired => 'Task title is required';

  @override
  String get taskBoardDetailTaskDescriptionLabel => 'Description';

  @override
  String get taskBoardDetailTaskEditDescription => 'Edit description';

  @override
  String get taskBoardDetailTaskDescriptionHint => 'Add description';

  @override
  String get taskBoardDetailTaskDescriptionComingSoon => 'Description editing is coming soon on mobile.';

  @override
  String get taskBoardDetailTaskDescriptionDone => 'Done';

  @override
  String get taskBoardDetailTaskDescriptionPersonalOnly => 'Description editing is currently available only in personal workspaces.';

  @override
  String get taskBoardDetailTaskDescriptionImageSourceTitle => 'Add image';

  @override
  String get taskBoardDetailTaskDescriptionImageSourceCamera => 'Camera';

  @override
  String get taskBoardDetailTaskDescriptionImageSourceGallery => 'Gallery';

  @override
  String get taskBoardDetailTaskDescriptionToolbarBlockquote => 'Block quote';

  @override
  String get taskBoardDetailTaskDescriptionToolbarBold => 'Bold';

  @override
  String get taskBoardDetailTaskDescriptionToolbarBulletList => 'Bullet list';

  @override
  String get taskBoardDetailTaskDescriptionToolbarCodeBlock => 'Code block';

  @override
  String get taskBoardDetailTaskDescriptionToolbarHeading1 => 'Heading 1';

  @override
  String get taskBoardDetailTaskDescriptionToolbarHeading2 => 'Heading 2';

  @override
  String get taskBoardDetailTaskDescriptionToolbarHeading3 => 'Heading 3';

  @override
  String get taskBoardDetailTaskDescriptionToolbarHighlight => 'Highlight';

  @override
  String get taskBoardDetailTaskDescriptionToolbarInlineCode => 'Inline code';

  @override
  String get taskBoardDetailTaskDescriptionToolbarInsertImage => 'Insert image';

  @override
  String get taskBoardDetailTaskDescriptionToolbarItalic => 'Italic';

  @override
  String get taskBoardDetailTaskDescriptionToolbarOrderedList => 'Ordered list';

  @override
  String get taskBoardDetailTaskDescriptionToolbarStrikethrough => 'Strikethrough';

  @override
  String get taskBoardDetailTaskDescriptionToolbarSubscript => 'Subscript';

  @override
  String get taskBoardDetailTaskDescriptionToolbarSuperscript => 'Superscript';

  @override
  String get taskBoardDetailTaskDescriptionToolbarTaskList => 'Task list';

  @override
  String get taskBoardDetailTaskDescriptionTableAddColumn => 'Add column';

  @override
  String get taskBoardDetailTaskDescriptionTableAddRow => 'Add row';

  @override
  String get taskBoardDetailTaskDescriptionTableRemoveColumn => 'Remove column';

  @override
  String get taskBoardDetailTaskDescriptionTableRemoveRow => 'Remove row';

  @override
  String get taskBoardDetailTaskDescriptionToolbarUnderline => 'Underline';

  @override
  String get taskBoardDetailTaskListLabel => 'List';

  @override
  String get taskBoardDetailTaskListSelect => 'Choose list';

  @override
  String get taskBoardDetailPriority => 'Priority';

  @override
  String get taskBoardDetailTaskDates => 'Dates';

  @override
  String get taskBoardDetailTaskStartDate => 'Start date';

  @override
  String get taskBoardDetailTaskEndDate => 'End date';

  @override
  String get taskBoardDetailTaskEstimation => 'Estimation';

  @override
  String get taskBoardDetailTaskEstimationNone => 'No estimate';

  @override
  String get taskBoardDetailTaskAssignees => 'Assignees';

  @override
  String get taskBoardDetailTaskLabels => 'Labels';

  @override
  String get taskBoardDetailTaskProjects => 'Projects';

  @override
  String get taskBoardDetailTaskSelectAssignees => 'Select assignees';

  @override
  String get taskBoardDetailTaskSelectLabels => 'Select labels';

  @override
  String get taskBoardDetailTaskSelectProjects => 'Select projects';

  @override
  String get taskBoardDetailEditorDetailsTab => 'Details';

  @override
  String get taskBoardDetailEditorRelationshipsTab => 'Relationships';

  @override
  String get taskBoardDetailParentTask => 'Parent task';

  @override
  String get taskBoardDetailChildTasks => 'Child tasks';

  @override
  String get taskBoardDetailBlockedBy => 'Blocked by';

  @override
  String get taskBoardDetailBlocking => 'Blocking';

  @override
  String get taskBoardDetailRelatedTasks => 'Related tasks';

  @override
  String get taskBoardDetailAddParentTask => 'Add parent task';

  @override
  String get taskBoardDetailAddChildTask => 'Add child task';

  @override
  String get taskBoardDetailAddBlockedByTask => 'Add blocker';

  @override
  String get taskBoardDetailAddBlockingTask => 'Add blocked task';

  @override
  String get taskBoardDetailAddRelatedTask => 'Add related task';

  @override
  String get taskBoardDetailOpenRelatedTask => 'Open related task';

  @override
  String get taskBoardDetailRemoveRelationship => 'Remove relationship';

  @override
  String get taskBoardDetailUnableToOpenLinkedTask => 'This linked task can\'t be opened from here.';

  @override
  String get taskBoardDetailSelectTask => 'Select task';

  @override
  String get taskBoardDetailSearchTasks => 'Search tasks';

  @override
  String get taskBoardDetailNoAvailableRelationshipTasks => 'No available tasks for this relationship.';

  @override
  String get taskBoardDetailRelationshipAdded => 'Relationship added.';

  @override
  String get taskBoardDetailRelationshipRemoved => 'Relationship removed.';

  @override
  String get taskBoardDetailNone => 'None';

  @override
  String get taskBoardDetailNoDate => 'No date';

  @override
  String taskBoardDetailDueAt(String date) {
    return 'Due $date';
  }

  @override
  String taskBoardDetailStartsAt(String date) {
    return 'Starts $date';
  }

  @override
  String get taskBoardDetailOverdue => 'Overdue';

  @override
  String get taskBoardDetailToday => 'Today';

  @override
  String get taskBoardDetailTomorrow => 'Tomorrow';

  @override
  String get taskBoardDetailYesterday => 'yesterday';

  @override
  String taskBoardDetailInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'in $count days',
      one: 'in $count day',
    );
    return '$_temp0';
  }

  @override
  String taskBoardDetailDaysAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count days ago',
      one: '$count day ago',
    );
    return '$_temp0';
  }

  @override
  String get taskBoardDetailInvalidDateRange => 'End date must be on or after start date';

  @override
  String get taskBoardDetailTaskSaved => 'Task updated.';

  @override
  String get taskBoardDetailTaskCreated => 'Task created.';

  @override
  String get taskBoardDetailTaskDeleted => 'Task deleted.';

  @override
  String get taskBoardDetailTaskDeletedForever => 'Task permanently deleted.';

  @override
  String get taskBoardDetailTaskRestored => 'Task restored.';

  @override
  String get taskBoardDetailBulkActions => 'Bulk actions';

  @override
  String taskBoardDetailBulkAllSuccess(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tasks',
      one: '$count task',
    );
    return 'Updated $_temp0.';
  }

  @override
  String get taskBoardDetailBulkClearAssignees => 'Clear assignees';

  @override
  String get taskBoardDetailBulkClearLabels => 'Clear labels';

  @override
  String get taskBoardDetailBulkClearProjects => 'Clear projects';

  @override
  String get taskBoardDetailBulkMarkClosed => 'Mark as closed';

  @override
  String get taskBoardDetailBulkMarkDone => 'Mark as done';

  @override
  String get taskBoardDetailBulkMoveToBoard => 'Move to board';

  @override
  String taskBoardDetailBulkPartialSuccess(int success, int failed) {
    return 'Updated $success tasks, $failed failed.';
  }

  @override
  String get taskBoardDetailEnterBulkSelect => 'Select tasks';

  @override
  String get taskBoardDetailExitBulkSelect => 'Clear selection';

  @override
  String get taskBoardDetailNoTasksSelected => 'No tasks selected';

  @override
  String get taskBoardDetailNextWeek => 'Next week';

  @override
  String get taskBoardDetailQuickActions => 'Quick actions';

  @override
  String get taskBoardDetailProperties => 'Properties';

  @override
  String get taskBoardDetailMove => 'Move';

  @override
  String get taskBoardDetailSetDueDate => 'Set due date';

  @override
  String get taskBoardDetailSetEstimation => 'Set estimation';

  @override
  String get taskBoardDetailPriorityNone => 'No priority';

  @override
  String get taskBoardDetailRecycleBin => 'Recycle Bin';

  @override
  String get taskBoardDetailRecycleBinDescription => 'Deleted tasks from this board. Select tasks to restore or permanently delete them.';

  @override
  String get taskBoardDetailRecycleBinEmpty => 'No deleted tasks';

  @override
  String get taskBoardDetailRecycleBinEmptyHint => 'Deleted tasks will appear here.';

  @override
  String get taskBoardDetailSelectAllTasks => 'Select all tasks';

  @override
  String taskBoardDetailDeletedTasksCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count deleted tasks',
      one: '$count deleted task',
    );
    return '$_temp0';
  }

  @override
  String taskBoardDetailSelectedCount(int selected, int total) {
    return '$selected of $total selected';
  }

  @override
  String taskBoardDetailRestoreTasks(int count) {
    return 'Restore ($count)';
  }

  @override
  String taskBoardDetailDeleteTasks(int count) {
    return 'Delete ($count)';
  }

  @override
  String taskBoardDetailFromList(String list) {
    return 'from: $list';
  }

  @override
  String taskBoardDetailDeletedAgo(String time) {
    return 'Deleted $time';
  }

  @override
  String get taskBoardDetailPriorityCritical => 'Critical';

  @override
  String get taskBoardDetailPriorityHigh => 'High';

  @override
  String get taskBoardDetailPriorityNormal => 'Normal';

  @override
  String get taskBoardDetailPriorityLow => 'Low';

  @override
  String taskBoardDetailPoints(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count pts',
      one: '$count pt',
    );
    return '$_temp0';
  }

  @override
  String taskBoardDetailNProjects(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count projects',
      one: '$count project',
    );
    return '$_temp0';
  }

  @override
  String get taskBoardDetailNoMoveTargets => 'No other lists available for moving this task.';

  @override
  String get taskBoardDetailRemoveDueDate => 'Remove due date';

  @override
  String get taskBoardDetailSelectAllFiltered => 'Select visible';

  @override
  String get taskBoardDetailSetCustomDate => 'Set custom date';

  @override
  String get taskBoardDetailThisWeek => 'This week';

  @override
  String get taskBoardDetailBoardActions => 'Board actions';

  @override
  String get taskBoardDetailManageBoardLayout => 'Manage board layout';

  @override
  String get taskBoardDetailManageBoardLayoutDescription => 'Manage board columns by status and reorder lists within each status.';

  @override
  String get taskBoardDetailRefresh => 'Refresh board';

  @override
  String get taskBoardDetailRenameBoard => 'Rename board';

  @override
  String get taskBoardDetailBoardRenamed => 'Board renamed.';

  @override
  String get taskBoardDetailCreateList => 'Create list';

  @override
  String get taskBoardDetailEditList => 'Edit list';

  @override
  String get taskBoardDetailRenameList => 'Rename list';

  @override
  String get taskBoardDetailListActions => 'List actions';

  @override
  String get taskBoardDetailListCreated => 'List created.';

  @override
  String get taskBoardDetailListRenamed => 'List renamed.';

  @override
  String get taskBoardDetailListUpdated => 'List updated.';

  @override
  String get taskBoardDetailListDeleted => 'List deleted.';

  @override
  String get taskBoardDetailDeleteList => 'Delete list';

  @override
  String get taskBoardDetailDeleteListTitle => 'Delete list?';

  @override
  String get taskBoardDetailDeleteListDescription => 'Are you sure you want to delete this list? All tasks in this list will also be deleted. This action cannot be undone.';

  @override
  String get taskBoardDetailDeleteTask => 'Delete task';

  @override
  String get taskBoardDetailDeleteTaskForever => 'Delete task forever';

  @override
  String get taskBoardDetailDeleteTaskForeverDescription => 'Permanently delete this task from the recycle bin? This action cannot be undone.';

  @override
  String get taskBoardDetailDeleteForever => 'Delete forever';

  @override
  String get taskBoardDetailDeleteTaskTitle => 'Delete task?';

  @override
  String get taskBoardDetailDeleteTaskDescription => 'Move this task to the recycle bin?';

  @override
  String get taskBoardDetailMoveListToStatus => 'Move list to status';

  @override
  String get taskBoardDetailCannotMoveToClosedStatus => 'Cannot move lists to or from closed status';

  @override
  String get taskBoardDetailCannotCreateMoreClosedLists => 'Only one closed list is allowed per board.';

  @override
  String get taskBoardDetailClosedListCapacityHint => '1 closed list max';

  @override
  String get taskBoardDetailAddNewList => 'Add new list';

  @override
  String get taskBoardDetailNoListsInStatus => 'No lists in this status';

  @override
  String get taskBoardDetailListsReordered => 'Lists reordered.';

  @override
  String get taskBoardDetailMoveListDown => 'Move list down';

  @override
  String get taskBoardDetailMoveListUp => 'Move list up';

  @override
  String taskBoardDetailMovedToStatus(String status) {
    return 'Moved to $status';
  }

  @override
  String get taskBoardDetailNameRequired => 'Name is required';

  @override
  String get taskBoardDetailListNameLabel => 'List name';

  @override
  String get taskBoardDetailStatusCategoryLabel => 'Status category';

  @override
  String get taskBoardDetailColorLabel => 'Color';

  @override
  String get taskBoardDetailFilters => 'Filters';

  @override
  String get taskBoardDetailFiltersActive => 'Filters active';

  @override
  String get taskBoardDetailFilterLists => 'Lists';

  @override
  String get taskBoardDetailFilterStatuses => 'Statuses';

  @override
  String get taskBoardDetailFilterAssignees => 'Assignees';

  @override
  String get taskBoardDetailFilterLabels => 'Labels';

  @override
  String get taskBoardDetailFilterProjects => 'Projects';

  @override
  String get taskBoardDetailNoFilterOptions => 'No options available';

  @override
  String get taskBoardDetailStatusNotStarted => 'Not started';

  @override
  String get taskBoardDetailStatusActive => 'Active';

  @override
  String get taskBoardDetailStatusDone => 'Done';

  @override
  String get taskBoardDetailStatusClosed => 'Closed';

  @override
  String get taskBoardDetailStatusDocuments => 'Documents';

  @override
  String get taskBoardDetailColorGray => 'Gray';

  @override
  String get taskBoardDetailColorRed => 'Red';

  @override
  String get taskBoardDetailColorBlue => 'Blue';

  @override
  String get taskBoardDetailColorGreen => 'Green';

  @override
  String get taskBoardDetailColorYellow => 'Yellow';

  @override
  String get taskBoardDetailColorOrange => 'Orange';

  @override
  String get taskBoardDetailColorPurple => 'Purple';

  @override
  String get taskBoardDetailColorPink => 'Pink';

  @override
  String get taskBoardDetailColorIndigo => 'Indigo';

  @override
  String get taskBoardDetailColorCyan => 'Cyan';

  @override
  String get taskBoardDetailClearFilters => 'Clear filters';

  @override
  String get taskBoardDetailApplyFilters => 'Apply filters';

  @override
  String get taskPlanningTitle => 'Planning';

  @override
  String get taskEstimatesTitle => 'Estimations';

  @override
  String get taskLabelsTab => 'Labels';

  @override
  String get taskLabelsCreate => 'Create label';

  @override
  String get taskLabelsEdit => 'Edit label';

  @override
  String get taskLabelsDelete => 'Delete label';

  @override
  String get taskLabelsDeleteConfirm => 'Delete this label?';

  @override
  String get taskLabelsCreated => 'Label created.';

  @override
  String get taskLabelsUpdated => 'Label updated.';

  @override
  String get taskLabelsDeleted => 'Label deleted.';

  @override
  String get taskLabelsName => 'Label name';

  @override
  String get taskLabelsNameRequired => 'Label name is required';

  @override
  String get taskLabelsColorInvalid => 'Enter a valid hex color';

  @override
  String get taskLabelsEmptyTitle => 'No labels yet';

  @override
  String get taskLabelsEmptyDescription => 'Create labels to tag and organize task work.';

  @override
  String get taskEstimatesDescription => 'Configure estimation methods for your task boards and review their current coverage.';

  @override
  String get taskEstimatesAccessDeniedTitle => 'Access restricted';

  @override
  String get taskEstimatesAccessDeniedDescription => 'You need project management permission in this workspace to change task board estimation settings.';

  @override
  String get taskEstimatesTotalBoards => 'Total boards';

  @override
  String get taskEstimatesConfiguredBoards => 'Configured';

  @override
  String get taskEstimatesExtendedRangeBoards => 'Extended range';

  @override
  String get taskEstimatesDistributionTitle => 'Estimation methods';

  @override
  String get taskEstimatesBoardConfigTitle => 'Board estimation configuration';

  @override
  String get taskEstimatesNoBoardsTitle => 'No boards found';

  @override
  String get taskEstimatesNoBoardsDescription => 'Create a task board first, then come back here to configure its estimation method.';

  @override
  String get taskEstimatesExtendedBadge => 'Extended';

  @override
  String taskEstimatesDialogTitle(String boardName) {
    return 'Edit $boardName';
  }

  @override
  String get taskEstimatesDialogEstimationMethod => 'Estimation method';

  @override
  String taskEstimatesDialogRangeTitle(String label) {
    return '$label range';
  }

  @override
  String get taskEstimatesDialogEstimationOptions => 'Estimation options';

  @override
  String get taskEstimatesDialogSelectedConfiguration => 'Selected configuration';

  @override
  String get taskEstimatesDialogSave => 'Update estimation';

  @override
  String get taskEstimatesRangeStandard => 'Standard range';

  @override
  String get taskEstimatesRangeExtended => 'Extended range';

  @override
  String get taskEstimatesUnnamedBoard => 'Untitled board';

  @override
  String get taskEstimatesAllowZeroEstimates => 'Allow zero estimates';

  @override
  String get taskEstimatesAllowZeroEstimatesDescription => 'When enabled, tasks can be estimated as 0 and contribute 0 to totals.';

  @override
  String get taskEstimatesCountUnestimatedIssues => 'Count unestimated issues';

  @override
  String get taskEstimatesCountUnestimatedIssuesDescription => 'When enabled, unestimated tasks contribute 1 estimate unit to totals. When disabled, they contribute 0.';

  @override
  String get taskEstimatesUpdateSuccess => 'Estimation updated successfully.';

  @override
  String get taskEstimatesTypeNoneLabel => 'None';

  @override
  String get taskEstimatesTypeNoneDescription => 'No estimation is configured for this board.';

  @override
  String get taskEstimatesTypeFibonacciLabel => 'Fibonacci';

  @override
  String get taskEstimatesTypeFibonacciStandardZeroEnabled => 'Fibonacci sequence: 0, 1, 2, 3, 5, 8.';

  @override
  String get taskEstimatesTypeFibonacciStandardZeroDisabled => 'Fibonacci sequence: 1, 2, 3, 5, 8.';

  @override
  String get taskEstimatesTypeFibonacciExtendedZeroEnabled => 'Extended Fibonacci sequence: 0, 1, 2, 3, 5, 8, 13, 21.';

  @override
  String get taskEstimatesTypeFibonacciExtendedZeroDisabled => 'Extended Fibonacci sequence: 1, 2, 3, 5, 8, 13, 21.';

  @override
  String get taskEstimatesTypeLinearLabel => 'Linear';

  @override
  String get taskEstimatesTypeLinearStandardZeroEnabled => 'Linear sequence: 0, 1, 2, 3, 4, 5.';

  @override
  String get taskEstimatesTypeLinearStandardZeroDisabled => 'Linear sequence: 1, 2, 3, 4, 5.';

  @override
  String get taskEstimatesTypeLinearExtendedZeroEnabled => 'Extended linear sequence: 0, 1, 2, 3, 4, 5, 6, 7.';

  @override
  String get taskEstimatesTypeLinearExtendedZeroDisabled => 'Extended linear sequence: 1, 2, 3, 4, 5, 6, 7.';

  @override
  String get taskEstimatesTypeExponentialLabel => 'Exponential';

  @override
  String get taskEstimatesTypeExponentialStandardZeroEnabled => 'Exponential sequence: 0, 1, 2, 4, 8, 16.';

  @override
  String get taskEstimatesTypeExponentialStandardZeroDisabled => 'Exponential sequence: 1, 2, 4, 8, 16.';

  @override
  String get taskEstimatesTypeExponentialExtendedZeroEnabled => 'Extended exponential sequence: 0, 1, 2, 4, 8, 16, 32, 64.';

  @override
  String get taskEstimatesTypeExponentialExtendedZeroDisabled => 'Extended exponential sequence: 1, 2, 4, 8, 16, 32, 64.';

  @override
  String get taskEstimatesTypeTshirtLabel => 'T-shirt';

  @override
  String get taskEstimatesTypeTshirtStandard => 'T-shirt sizes: -, XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtExtended => 'Extended T-shirt sizes: -, XS, S, M, L, XL, XXL, XXXL.';

  @override
  String get taskPortfolioTitle => 'Portfolio';

  @override
  String get taskPortfolioProjectsTab => 'Projects';

  @override
  String get taskPortfolioInitiativesTab => 'Initiatives';

  @override
  String get taskPortfolioAccessDeniedTitle => 'Access restricted';

  @override
  String get taskPortfolioAccessDeniedDescription => 'You need project management permission in this workspace to manage projects and initiatives.';

  @override
  String get taskPortfolioProjectsEmptyTitle => 'No projects yet';

  @override
  String get taskPortfolioProjectsEmptyDescription => 'Create your first project to organize work beyond individual tasks.';

  @override
  String get taskPortfolioInitiativesEmptyTitle => 'No initiatives yet';

  @override
  String get taskPortfolioInitiativesEmptyDescription => 'Create an initiative to group related projects under a shared outcome.';

  @override
  String get taskPortfolioNoDescription => 'No description yet';

  @override
  String get taskPortfolioProjectTasksLinked => 'tasks linked';

  @override
  String get taskPortfolioProjectCompletedTasks => 'completed';

  @override
  String get taskPortfolioInitiativeProjectsLinked => 'projects linked';

  @override
  String get taskPortfolioCreateProject => 'Create project';

  @override
  String get taskPortfolioEditProject => 'Edit project';

  @override
  String get taskPortfolioDeleteProject => 'Delete project';

  @override
  String get taskPortfolioDeleteProjectConfirm => 'Delete this project?';

  @override
  String get taskPortfolioProjectCreated => 'Project created.';

  @override
  String get taskPortfolioProjectUpdated => 'Project updated.';

  @override
  String get taskPortfolioProjectDeleted => 'Project deleted.';

  @override
  String get taskPortfolioProjectName => 'Project name';

  @override
  String get taskPortfolioProjectNameRequired => 'Project name is required';

  @override
  String get taskPortfolioProjectDescriptionHint => 'Describe the project goals';

  @override
  String get taskPortfolioProjectStatus => 'Project status';

  @override
  String get taskPortfolioProjectPriority => 'Priority';

  @override
  String get taskPortfolioProjectHealth => 'Health status';

  @override
  String get taskPortfolioProjectLead => 'Project lead';

  @override
  String get taskPortfolioProjectNoHealth => 'No health status';

  @override
  String get taskPortfolioProjectNoLead => 'No lead assigned';

  @override
  String get taskPortfolioProjectStartDate => 'Start date';

  @override
  String get taskPortfolioProjectEndDate => 'End date';

  @override
  String get taskPortfolioProjectArchived => 'Archived';

  @override
  String get taskPortfolioProjectArchivedHint => 'Hide this project from active planning views.';

  @override
  String get taskPortfolioPickDate => 'Pick date';

  @override
  String get taskPortfolioClearSelection => 'Clear';

  @override
  String get taskPortfolioProjectStatusActive => 'Active';

  @override
  String get taskPortfolioProjectStatusBacklog => 'Backlog';

  @override
  String get taskPortfolioProjectStatusPlanned => 'Planned';

  @override
  String get taskPortfolioProjectStatusInProgress => 'In progress';

  @override
  String get taskPortfolioProjectStatusInReview => 'In review';

  @override
  String get taskPortfolioProjectStatusInTesting => 'In testing';

  @override
  String get taskPortfolioProjectStatusCompleted => 'Completed';

  @override
  String get taskPortfolioProjectStatusCancelled => 'Cancelled';

  @override
  String get taskPortfolioProjectStatusOnHold => 'On hold';

  @override
  String get taskPortfolioProjectPriorityCritical => 'Critical';

  @override
  String get taskPortfolioProjectPriorityHigh => 'High';

  @override
  String get taskPortfolioProjectPriorityNormal => 'Normal';

  @override
  String get taskPortfolioProjectPriorityLow => 'Low';

  @override
  String get taskPortfolioCreateInitiative => 'Create initiative';

  @override
  String get taskPortfolioEditInitiative => 'Edit initiative';

  @override
  String get taskPortfolioDeleteInitiative => 'Delete initiative';

  @override
  String get taskPortfolioDeleteInitiativeConfirm => 'Delete this initiative?';

  @override
  String get taskPortfolioInitiativeCreated => 'Initiative created.';

  @override
  String get taskPortfolioInitiativeUpdated => 'Initiative updated.';

  @override
  String get taskPortfolioInitiativeDeleted => 'Initiative deleted.';

  @override
  String get taskPortfolioInitiativeName => 'Initiative name';

  @override
  String get taskPortfolioInitiativeNameRequired => 'Initiative name is required';

  @override
  String get taskPortfolioInitiativeDescriptionHint => 'Describe the initiative outcome';

  @override
  String get taskPortfolioInitiativeStatus => 'Initiative status';

  @override
  String get taskPortfolioInitiativeStatusActive => 'Active';

  @override
  String get taskPortfolioInitiativeStatusCompleted => 'Completed';

  @override
  String get taskPortfolioInitiativeStatusOnHold => 'On hold';

  @override
  String get taskPortfolioInitiativeStatusCancelled => 'Cancelled';

  @override
  String get taskPortfolioManageProjects => 'Manage projects';

  @override
  String get taskPortfolioLinkedProjects => 'Linked projects';

  @override
  String get taskPortfolioNoLinkedProjects => 'No linked projects yet';

  @override
  String get taskPortfolioProjectHealthOnTrack => 'On track';

  @override
  String get taskPortfolioProjectHealthAtRisk => 'At risk';

  @override
  String get taskPortfolioProjectHealthOffTrack => 'Off track';

  @override
  String taskPortfolioProjectTasksProgress(int completed, int total) {
    return '$completed of $total tasks';
  }

  @override
  String get taskPortfolioLinkProject => 'Link project';

  @override
  String get taskPortfolioNoAvailableProjects => 'Select project';

  @override
  String get taskPortfolioAllProjectsLinked => 'All workspace projects are already linked.';

  @override
  String get taskPortfolioProjectLinked => 'Project linked.';

  @override
  String get taskPortfolioProjectUnlinked => 'Project unlinked.';

  @override
  String get taskPortfolioProjectDetailsTitle => 'Project details';

  @override
  String get taskPortfolioProjectNotFoundTitle => 'Project not found';

  @override
  String get taskPortfolioProjectNotFoundDescription => 'This project is no longer available in the current workspace.';

  @override
  String get taskPortfolioProjectTimeline => 'Timeline';

  @override
  String get taskPortfolioProjectTasks => 'Tasks';

  @override
  String get taskPortfolioLinkedTasks => 'Linked tasks';

  @override
  String get taskPortfolioUnlinkTask => 'Unlink task';

  @override
  String get taskPortfolioProjectStats => 'Project stats';

  @override
  String get taskPortfolioNoLinkedTasks => 'No linked tasks yet';

  @override
  String get taskPortfolioLinkTask => 'Link task';

  @override
  String get taskPortfolioSearchTasksHint => 'Search tasks';

  @override
  String get taskPortfolioNoMatchingTasks => 'No tasks match your search.';

  @override
  String get taskPortfolioSelectTask => 'Select task';

  @override
  String get taskPortfolioSelectTaskHint => 'Choose a task';

  @override
  String get taskPortfolioNoAvailableTasks => 'All available tasks are already linked to this project.';

  @override
  String get taskPortfolioProjectCompletion => 'Completion';

  @override
  String get taskPortfolioTaskLinked => 'Task linked.';

  @override
  String get taskPortfolioTaskUnlinked => 'Task unlinked.';

  @override
  String get taskPortfolioProjectUpdates => 'Project updates';

  @override
  String get taskPortfolioUpdatePlaceholder => 'Share the latest progress, blockers, or wins...';

  @override
  String get taskPortfolioPostUpdate => 'Post update';

  @override
  String get taskPortfolioPostingUpdate => 'Posting...';

  @override
  String get taskPortfolioNoProjectUpdates => 'No updates yet';

  @override
  String get taskPortfolioUnknownUser => 'Unknown user';

  @override
  String get taskPortfolioUpdateEdited => 'Edited';

  @override
  String get taskPortfolioEditUpdate => 'Edit update';

  @override
  String get taskPortfolioDeleteUpdate => 'Delete update';

  @override
  String get taskPortfolioDeleteUpdateConfirm => 'Delete this update?';

  @override
  String get taskPortfolioUpdateCannotBeEmpty => 'Update content cannot be empty';

  @override
  String get taskPortfolioUpdatePosted => 'Update posted.';

  @override
  String get taskPortfolioUpdateSaved => 'Update saved.';

  @override
  String get taskPortfolioUpdateDeleted => 'Update deleted.';

  @override
  String get taskEstimatesTypeTshirtStandardZeroEnabled => 'T-shirt sizes: -, XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtStandardZeroDisabled => 'T-shirt sizes: XS, S, M, L, XL.';

  @override
  String get taskEstimatesTypeTshirtExtendedZeroEnabled => 'Extended T-shirt sizes: -, XS, S, M, L, XL, XXL, XXXL.';

  @override
  String get taskEstimatesTypeTshirtExtendedZeroDisabled => 'Extended T-shirt sizes: XS, S, M, L, XL, XXL, XXXL.';

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
  String get calendarYearView => 'Year';

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
  String get inventoryAddCategory => 'Add category';

  @override
  String get inventoryAddOwner => 'Add owner';

  @override
  String get inventoryAddUnit => 'Add unit';

  @override
  String get inventoryAddWarehouse => 'Add warehouse';

  @override
  String get inventoryAuditEmpty => 'Inventory activity will appear here after products, stock, and sales are updated.';

  @override
  String get inventoryAuditEventArchived => 'Archived';

  @override
  String get inventoryAuditEventCreated => 'Created';

  @override
  String get inventoryAuditEventDeleted => 'Deleted';

  @override
  String get inventoryAuditEventReactivated => 'Reactivated';

  @override
  String get inventoryAuditEventSaleCreated => 'Sale created';

  @override
  String get inventoryAuditEventUpdated => 'Updated';

  @override
  String get inventoryAuditLabel => 'Audit';

  @override
  String get inventoryAuditActorLabel => 'Actor';

  @override
  String get inventoryAuditAfter => 'After';

  @override
  String get inventoryAuditBefore => 'Before';

  @override
  String get inventoryAuditChangedFields => 'Changed fields';

  @override
  String inventoryAuditChanges(int count) {
    return '$count changes';
  }

  @override
  String get inventoryAuditRecentSubtitle => 'Follow product, stock, setup, and sale changes across the workspace.';

  @override
  String get inventoryAuditRecentTitle => 'Recent activity';

  @override
  String get inventoryAuditNoChanges => 'No field changes';

  @override
  String get inventoryAuditOccurredAt => 'Occurred at';

  @override
  String get inventoryAuditSubtitle => 'Track who changed products, stock, setup, and sales.';

  @override
  String get inventoryAuditSubject => 'Subject';

  @override
  String get inventoryCheckoutAvailableProductsSubtitle => 'Adjust quantities directly from the available booth inventory.';

  @override
  String get inventoryCheckoutAvailableProductsTitle => 'Available products';

  @override
  String get inventoryCheckoutAutoCategory => 'Auto-linked category';

  @override
  String get inventoryCheckoutAllCategories => 'All categories';

  @override
  String get inventoryCheckoutBrowseTab => 'Browse';

  @override
  String get inventoryCheckoutCartEmpty => 'Add products from the browse tab to review and submit the sale.';

  @override
  String get inventoryCheckoutCartTab => 'Cart';

  @override
  String get inventoryCheckoutCartTotal => 'Cart total';

  @override
  String get inventoryCheckoutCheckoutDetailsSubtitle => 'Choose where the sale lands before submitting the invoice.';

  @override
  String get inventoryCheckoutCheckoutDetailsTitle => 'Checkout details';

  @override
  String get inventoryCheckoutCategoryOverride => 'Category override';

  @override
  String get inventoryCheckoutCategoryRequired => 'Choose an income category before creating the sale.';

  @override
  String get inventoryCheckoutEmpty => 'No sellable inventory is available yet.';

  @override
  String get inventoryCheckoutManualCategoryRequired => 'Choose an income category when the cart mixes linked categories or has no linked category.';

  @override
  String get inventoryCheckoutNoSearchResults => 'No products match the current search.';

  @override
  String get inventoryCheckoutNoWalletSelected => 'No wallet selected';

  @override
  String get inventoryCheckoutProductsRequired => 'Add at least one product before creating the sale.';

  @override
  String get inventoryCheckoutSelectedItems => 'Selected lines';

  @override
  String get inventoryCheckoutSubtitle => 'Build a quick booth sale and send it through invoices.';

  @override
  String get inventoryCheckoutSubmit => 'Create sale';

  @override
  String get inventoryCheckoutTotalItems => 'Total items';

  @override
  String get inventoryCheckoutTitle => 'Sell';

  @override
  String get inventoryCheckoutValidationError => 'Select a wallet, resolve the category, and add at least one product.';

  @override
  String get inventoryCheckoutWalletRequired => 'Choose a wallet before creating the sale.';

  @override
  String get inventoryCheckoutWallet => 'Wallet';

  @override
  String get inventoryCreateProduct => 'Create product';

  @override
  String get inventoryEditProduct => 'Edit product';

  @override
  String get inventoryManageCategories => 'Product categories';

  @override
  String get inventoryManageCategoriesSubtitle => 'Group products into clear shelves, menus, or collections.';

  @override
  String get inventoryManageEmpty => 'Nothing configured yet.';

  @override
  String get inventoryManageLabel => 'Manage';

  @override
  String get inventoryManageNameRequired => 'Enter a name.';

  @override
  String get inventoryManageOwners => 'Owners';

  @override
  String get inventoryManageOwnersSubtitle => 'Keep attribution separate from the staff member operating the booth.';

  @override
  String get inventoryManageSubtitle => 'Configure the owners and lookup data the booth depends on.';

  @override
  String get inventoryManageUnits => 'Units';

  @override
  String get inventoryManageUnitsSubtitle => 'Define how stock is counted, sold, and displayed.';

  @override
  String get inventoryManageWarehouses => 'Warehouses';

  @override
  String get inventoryManageWarehousesSubtitle => 'Separate stock locations so low-stock checks stay accurate.';

  @override
  String get inventoryNoBreakdownData => 'No breakdown data yet.';

  @override
  String get inventoryNoLinkedFinanceCategory => 'No linked finance category';

  @override
  String get inventoryNoLowStockProducts => 'No low-stock products right now.';

  @override
  String get inventoryOverviewCategories => 'By category';

  @override
  String get inventoryOverviewCategoriesSubtitle => 'See which product groups are bringing in revenue.';

  @override
  String get inventoryOverviewExpense => 'Expense';

  @override
  String get inventoryOverviewIncome => 'Income';

  @override
  String get inventoryOverviewLabel => 'Overview';

  @override
  String get inventoryOverviewLowStock => 'Low stock';

  @override
  String get inventoryOverviewLowStockSubtitle => 'Products that need attention before the next sale.';

  @override
  String get inventoryOverviewOwners => 'By owner';

  @override
  String get inventoryOverviewOwnersSubtitle => 'Break down sales by the owner assigned to each product.';

  @override
  String get inventoryOverviewRecentSales => 'Recent sales';

  @override
  String get inventoryOverviewRecentSalesSubtitle => 'Latest invoice-backed booth sales from inventory.';

  @override
  String get inventoryOverviewSalesRevenue => 'Inventory revenue';

  @override
  String get inventoryOverviewSubtitle => 'Watch revenue, inventory pressure, and owner performance together.';

  @override
  String get inventoryOwnerArchived => 'Archived';

  @override
  String get inventoryProductAddInventoryRow => 'Add stock row';

  @override
  String get inventoryProductAmount => 'Amount';

  @override
  String get inventoryProductAmountRequired => 'Enter an amount.';

  @override
  String get inventoryProductCategory => 'Product category';

  @override
  String get inventoryProductCategoryRequired => 'Choose a product category.';

  @override
  String get inventoryProductDescription => 'Description';

  @override
  String get inventoryProductDetailsSubtitle => 'Name the product, assign ownership, and link finance defaults.';

  @override
  String get inventoryProductDetailsTitle => 'Product details';

  @override
  String get inventoryProductEditorSubtitle => 'Create booth-ready products with fixed prices and stock rows.';

  @override
  String get inventoryProductFinanceCategory => 'Linked finance category';

  @override
  String get inventoryProductInventory => 'Inventory rows';

  @override
  String get inventoryProductInventoryRows => 'Rows';

  @override
  String get inventoryProductInventorySubtitle => 'Each row represents a unit, warehouse, quantity, threshold, and price.';

  @override
  String get inventoryProductManufacturer => 'Manufacturer';

  @override
  String get inventoryProductMinAmount => 'Minimum amount';

  @override
  String get inventoryProductMinAmountRequired => 'Enter a minimum amount.';

  @override
  String get inventoryProductName => 'Product name';

  @override
  String get inventoryProductNameRequired => 'Enter a product name.';

  @override
  String get inventoryProductNumberInvalid => 'Enter a valid number.';

  @override
  String get inventoryProductOwner => 'Owner';

  @override
  String get inventoryProductOwnerRequired => 'Choose an owner.';

  @override
  String get inventoryProductPrice => 'Price';

  @override
  String get inventoryProductPriceRequired => 'Enter a price.';

  @override
  String inventoryProductAvailableSummary(String amount, String price) {
    return '$amount available • $price';
  }

  @override
  String get inventoryProductSaved => 'Product saved.';

  @override
  String get inventoryProductUntitled => 'Untitled product';

  @override
  String get inventoryProductUnit => 'Unit';

  @override
  String get inventoryProductUnitRequired => 'Choose a unit.';

  @override
  String get inventoryProductUsage => 'Usage';

  @override
  String get inventoryProductValidationError => 'Complete the required product, owner, category, and stock fields.';

  @override
  String get inventoryProductWarehouse => 'Warehouse';

  @override
  String get inventoryProductWarehouseRequired => 'Choose a warehouse.';

  @override
  String get inventoryProductsEmpty => 'Create products to start tracking stock and selling from the booth.';

  @override
  String get inventoryProductsLabel => 'Products';

  @override
  String get inventoryProductsListSubtitle => 'Tap a product to edit details, pricing, or stock rows.';

  @override
  String get inventoryProductsListTitle => 'Product catalog';

  @override
  String get inventoryProductsSubtitle => 'Search, review, and edit products prepared for the booth.';

  @override
  String get inventoryRealtimeDisabled => 'Realtime is disabled for this workspace.';

  @override
  String get inventoryRealtimeEnabled => 'Realtime enabled';

  @override
  String get inventorySaleCreated => 'Inventory sale created.';

  @override
  String get inventorySaleDeleted => 'Sale deleted.';

  @override
  String get inventorySaleUpdated => 'Sale updated.';

  @override
  String get inventorySalesEmpty => 'Sales created from invoices will appear here.';

  @override
  String get inventorySalesDelete => 'Delete sale';

  @override
  String get inventorySalesDeleteConfirm => 'Delete this sale and restore its stock?';

  @override
  String get inventorySalesEdit => 'Edit sale';

  @override
  String get inventorySalesFallbackTitle => 'Inventory sale';

  @override
  String inventorySalesItemsCount(int count) {
    return '$count items';
  }

  @override
  String get inventorySalesLabel => 'Sales';

  @override
  String inventorySalesCreatorBadge(String name) {
    return 'By $name';
  }

  @override
  String get inventorySalesLineItems => 'Line items';

  @override
  String get inventorySalesNote => 'Note';

  @override
  String get inventorySalesRecentSubtitle => 'Review the latest invoice-backed inventory sales.';

  @override
  String get inventorySalesRecentTitle => 'Sale history';

  @override
  String get inventorySalesSave => 'Save sale';

  @override
  String get inventorySalesSubtitle => 'Monitor completed inventory sales and payment destinations.';

  @override
  String get inventorySalesTitle => 'Title';

  @override
  String get inventorySaveProduct => 'Save product';

  @override
  String get inventorySearchProducts => 'Search products';

  @override
  String get inventoryTitle => 'Inventory';

  @override
  String get financeOverviewLabel => 'Overview';

  @override
  String get financeActivityLabel => 'Activity';

  @override
  String get financeManageLabel => 'Manage';

  @override
  String get financeOverviewEyebrow => 'Workspace snapshot';

  @override
  String financeOverviewCrossCurrencyHint(String currency) {
    return 'Includes converted balances across wallets. Base currency: $currency.';
  }

  @override
  String financeOverviewSingleCurrencyHint(String currency) {
    return 'Everything is already tracked in $currency.';
  }

  @override
  String get financeWallets => 'Wallets';

  @override
  String get financeTransactions => 'Transactions';

  @override
  String get financeCategories => 'Categories';

  @override
  String get financeRecentTransactions => 'Recent transactions';

  @override
  String get financeOverviewActionsSubtitle => 'Jump into the next thing you need to do.';

  @override
  String get financeOverviewCreateTransactionHint => 'Capture income, expenses, or transfers quickly.';

  @override
  String get financeOverviewWalletsHint => 'Review balances and tune each account.';

  @override
  String get financeOverviewManageHint => 'Shape categories, tags, and finance structure.';

  @override
  String get financeOverviewWalletSectionTitle => 'Wallets';

  @override
  String get financeOverviewWalletSectionSubtitle => 'Your most important balances at a glance.';

  @override
  String get financeOverviewNoWalletsBody => 'Create your first wallet to start tracking balances, transfers, and categories.';

  @override
  String get financeOverviewActivityTitle => 'Activity';

  @override
  String get financeOverviewActivitySubtitle => 'The latest movement across your wallets.';

  @override
  String get financeOverviewNoTransactionsBody => 'Transactions appear here once you start logging money in and out.';

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
  String get financeWalletMetadata => 'Wallet metadata';

  @override
  String get financeWalletBalance => 'Balance';

  @override
  String get financeWalletCurrency => 'Currency';

  @override
  String get financeWalletSelectCurrency => 'Select currency';

  @override
  String get financeWalletSearchCurrency => 'Search currencies';

  @override
  String get financeCurrencyPickerSubtitle => 'Choose the code that best matches how this wallet is tracked.';

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
  String get financeWalletDialogSubtitle => 'Set up how this wallet should look and behave in finance.';

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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count available',
      one: '1 available',
      zero: 'No images',
    );
    return '$_temp0';
  }

  @override
  String get financeWalletClearImage => 'Clear image';

  @override
  String get financeNoTransactions => 'No transactions yet';

  @override
  String get financeNoCategories => 'No categories yet';

  @override
  String get financeTags => 'Tags';

  @override
  String get financeNoTags => 'No tags yet';

  @override
  String get financeManageCategoriesTitle => 'Categories';

  @override
  String get financeManageCategoriesSubtitle => 'Group transactions into clear spending and income buckets.';

  @override
  String get financeManageTagsTitle => 'Tags';

  @override
  String get financeManageTagsSubtitle => 'Use tags for lightweight labels and flexible reporting.';

  @override
  String get financeManageCategoriesEmptyBody => 'Create categories for recurring income and expense patterns.';

  @override
  String get financeManageTagsEmptyBody => 'Create tags for ad-hoc labels like trips, subscriptions, or projects.';

  @override
  String get financeCreateTag => 'Create tag';

  @override
  String get financeEditTag => 'Edit tag';

  @override
  String get financeDeleteTag => 'Delete tag';

  @override
  String get financeDeleteTagConfirm => 'Delete this tag?';

  @override
  String get financeTagName => 'Tag name';

  @override
  String get financeTagNameRequired => 'Tag name is required';

  @override
  String get financeTagDialogSubtitle => 'Describe the label and choose a color that is easy to scan.';

  @override
  String get financeBasic => 'Basic';

  @override
  String get financeIncome => 'Income';

  @override
  String get financeExpense => 'Expense';

  @override
  String get financeFrequentlyUsedCategories => 'Frequently used';

  @override
  String get financeHideAmounts => 'Hide amounts';

  @override
  String get financeViewAll => 'View all';

  @override
  String get financeSearchTransactions => 'Search transactions';

  @override
  String get financeSearchCategories => 'Search categories';

  @override
  String get financeSearchWallets => 'Search wallets';

  @override
  String get financeShowAmounts => 'Show amounts';

  @override
  String get financeNoSearchResults => 'No matching transactions';

  @override
  String get financeActivityDefaultHint => 'Search and review money movement by day.';

  @override
  String get financeActivitySearchHint => 'Search is open. Filter by merchant, wallet, or category.';

  @override
  String get financeActivitySearchEmptyBody => 'Try a different keyword, wallet, or category name.';

  @override
  String get financeActivityClearSearch => 'Clear search';

  @override
  String financeActivitySearchResults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count transactions matched',
      one: '1 transaction matched',
      zero: 'No matches yet',
    );
    return '$_temp0';
  }

  @override
  String get financeTransactionDetails => 'Transaction details';

  @override
  String get financeCreateTransaction => 'Create transaction';

  @override
  String get financeEditTransaction => 'Edit transaction';

  @override
  String get financeTransactionDialogSubtitle => 'Capture the amount, source, and visibility settings in one place.';

  @override
  String get financeDeleteTransaction => 'Delete transaction';

  @override
  String get financeDeleteTransactionConfirm => 'Delete this transaction?';

  @override
  String get financeTransactionCreated => 'Transaction created';

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
  String get financePickerWalletSubtitle => 'Pick the wallet this transaction should affect.';

  @override
  String get financePickerCategorySubtitle => 'Choose the bucket that best describes the transaction.';

  @override
  String get financePickerTagSubtitle => 'Select an optional label for extra context.';

  @override
  String get financePickerLoadingOptions => 'Loading wallets, categories, and tags...';

  @override
  String get financeNoTag => 'No tag';

  @override
  String get financeDestinationWallet => 'Destination wallet';

  @override
  String get financeSourceWallet => 'Source wallet';

  @override
  String get financeSelectDestinationWallet => 'Select destination wallet';

  @override
  String get financeTransferMode => 'Transfer mode';

  @override
  String get financeTransferModeEditHint => 'Transfer mode can only be edited for existing transfers.';

  @override
  String get financeDestinationAmountOptional => 'Destination amount';

  @override
  String get financeSelectWalletAndCategoryFirst => 'Choose a wallet and category first';

  @override
  String get financeSelectWalletAndDestinationFirst => 'Choose source and destination wallets first';

  @override
  String get financeWalletsMustBeDifferent => 'Source and destination wallets must be different';

  @override
  String get financeInvalidAmount => 'Enter a valid amount';

  @override
  String get financeInvalidDestinationAmount => 'Enter a valid destination amount';

  @override
  String get financeExcludedFromReports => 'Excluded from reports';

  @override
  String get financeReportOptIn => 'Include in reports';

  @override
  String get financeConfidentialAmount => 'Confidential amount';

  @override
  String get financeConfidentialDescription => 'Confidential description';

  @override
  String get financeConfidentialCategory => 'Confidential category';

  @override
  String get financeStatisticsSummary => 'Statistics summary';

  @override
  String get financeTotalTransactions => 'Total transactions';

  @override
  String get financeWalletNotFound => 'Wallet not found';

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
  String get financeCategoryDialogSubtitle => 'Define how this category should look and whether it counts as income or expense.';

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
  String get financeNetBalance => 'Net balance';

  @override
  String get financeYourWallets => 'Your wallets';

  @override
  String get financeQuickActions => 'Quick actions';

  @override
  String financeWalletSummaryHint(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count wallets are ready to use',
      one: '1 wallet is ready to use',
      zero: 'No wallets configured yet',
    );
    return '$_temp0';
  }

  @override
  String get financeAddTransaction => 'Add';

  @override
  String get financeAddFirstTransaction => 'Add first transaction';

  @override
  String get financeCreateFirstWallet => 'Create first wallet';

  @override
  String get financeTransfer => 'Transfer';

  @override
  String get financeTransactionCountShort => 'tx';

  @override
  String get financeExchangeRate => 'Exchange rate';

  @override
  String get financeDestinationAmountAuto => 'Auto';

  @override
  String get financeDestinationAmountOverride => 'Manual';

  @override
  String get financeDestinationAmountAutoHint => 'Auto-filled from live exchange rate';

  @override
  String get financeDestinationAmountOverrideHint => 'Using custom amount — tap to switch to auto';

  @override
  String get financeInvertRate => 'Invert rate';

  @override
  String get timerTitle => 'Timer';

  @override
  String get timerStart => 'Start';

  @override
  String get timerStop => 'Stop';

  @override
  String get timerHistory => 'History';

  @override
  String get timerRunning => 'Running';

  @override
  String get timerRunningSessionNoDetails => 'No category or task linked';

  @override
  String get timerRunningSessionNoTitle => 'Untitled session';

  @override
  String get timerPaused => 'Paused';

  @override
  String get timerStopped => 'Stopped';

  @override
  String get timerSessionPauseSuccess => 'Session paused successfully.';

  @override
  String get timerSessionResumeSuccess => 'Session resumed successfully.';

  @override
  String get timerSessionStopSuccess => 'Session stopped successfully.';

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
  String get timerCategoryColor => 'Color';

  @override
  String get timerCategoryColorLime => 'Lime';

  @override
  String get timerCategoryColorTeal => 'Teal';

  @override
  String get timerCategoryColorSky => 'Sky';

  @override
  String get timerCategoryColorRose => 'Rose';

  @override
  String get timerCategoryDescription => 'Description';

  @override
  String get timerCategoryColorNone => 'None';

  @override
  String get timerCreateCategory => 'Create category';

  @override
  String get timerCategoryCreateInProgress => 'Creating category...';

  @override
  String get timerCategoryCreateSuccess => 'Category created';

  @override
  String get timerSelectCategory => 'Select category';

  @override
  String get timerAdvanced => 'Advanced';

  @override
  String get timerSessionDescription => 'Description';

  @override
  String get timerLinkTask => 'Task';

  @override
  String get timerTaskPickerAllTasks => 'All tasks';

  @override
  String get timerTaskPickerAssignedToMe => 'Assigned to me';

  @override
  String timerTaskPickerAssignees(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count assignees',
      one: '$count assignee',
      zero: 'No assignees',
    );
    return '$_temp0';
  }

  @override
  String get timerTaskPickerNoMatchingTasks => 'No matching tasks';

  @override
  String get timerTaskPickerNoTask => 'No linked task';

  @override
  String timerTaskPickerResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tasks',
      one: '$count task',
      zero: 'No tasks',
    );
    return '$_temp0';
  }

  @override
  String get timerTaskPickerSearch => 'Search tasks';

  @override
  String get timerTaskIdPlaceholder => 'Select a task';

  @override
  String timerAttachmentCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count attachments',
      one: '1 attachment',
      zero: 'No attachments',
    );
    return '$_temp0';
  }

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
  String get timerStatsTitle => 'Statistics';

  @override
  String get timerStatsPersonal => 'Personal';

  @override
  String get timerStatsWorkspace => 'Workspace';

  @override
  String get timerActivityHeatmap => 'Activity';

  @override
  String timerHeatmapTrackedThisYear(String duration) {
    return 'Tracked $duration this year';
  }

  @override
  String get timerHeatmapStartTracking => 'Start tracking to build your activity pattern';

  @override
  String get timerHeatmapViewOriginal => 'Original';

  @override
  String get timerHeatmapViewHybrid => 'Hybrid';

  @override
  String get timerHeatmapViewCalendarOnly => 'Calendar';

  @override
  String get timerHeatmapViewCompactCards => 'Cards';

  @override
  String get timerHeatmapLegendLess => 'Less';

  @override
  String get timerHeatmapLegendMore => 'More';

  @override
  String timerHeatmapMonthCompact(int month) {
    return '$month';
  }

  @override
  String timerHeatmapMonthNarrowColumn(int month) {
    return '$month';
  }

  @override
  String get timerHeatmapYearPattern => 'Activity Pattern';

  @override
  String timerHeatmapActiveDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count active days',
      one: '$count active day',
    );
    return '$_temp0';
  }

  @override
  String get timerHeatmapMon => 'Mo';

  @override
  String get timerHeatmapTue => 'Tu';

  @override
  String get timerHeatmapWed => 'We';

  @override
  String get timerHeatmapThu => 'Th';

  @override
  String get timerHeatmapFri => 'Fr';

  @override
  String get timerHeatmapSat => 'Sa';

  @override
  String get timerHeatmapSun => 'Su';

  @override
  String timerHeatmapSessions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count sessions',
      one: '$count session',
    );
    return '$_temp0';
  }

  @override
  String get timerHeatmapTotal => 'Total';

  @override
  String get timerHeatmapSessionsLabel => 'Sessions';

  @override
  String get timerHeatmapActiveDaysLabel => 'Active days';

  @override
  String get timerHeatmapLessThanMinute => '<1m';

  @override
  String get timerHeatmapNoActivityYet => 'No activity yet';

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
  String get timerPomodoroSettingsDescription => 'Tune focus sessions, breaks, and the automation between them.';

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
  String get timerRequestsFilterAllStatuses => 'All';

  @override
  String get timerRequestsFilterTitle => 'Filter requests';

  @override
  String get timerRequestsFilterStatusLabel => 'Status';

  @override
  String get timerRequestsFilterUserLabel => 'User';

  @override
  String get timerRequestsFilterAllUsers => 'All users';

  @override
  String get timerRequestsFilterClear => 'Clear filters';

  @override
  String get timerRequestsFilterApply => 'Apply filters';

  @override
  String get timerRequestPending => 'Pending';

  @override
  String get timerRequestApproved => 'Approved';

  @override
  String get timerRequestRejected => 'Rejected';

  @override
  String get timerRequestNeedsInfo => 'Needs info';

  @override
  String timerRequestInfoRequestedBy(String name) {
    return 'Info requested by $name';
  }

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
  String taskBoardDetailTaskAssigneeCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count assignees',
      one: '$count assignee',
    );
    return '$_temp0';
  }

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
  String get timerRequestsStatusChangeGracePeriodLabel => 'Approved/rejected status change grace period (minutes)';

  @override
  String get timerRequestsStatusChangeGracePeriodHelp => 'Set how many minutes approvers can revert a request between Approved and Rejected in either direction. Set to 0 to disable both actions.';

  @override
  String get timerRequestsStatusChangeGracePeriodInvalid => 'Enter a whole number greater than or equal to 0 for status revert grace period.';

  @override
  String get timerRequestsThresholdUpdated => 'Request threshold updated.';

  @override
  String get timerRequestRevertToApproved => 'Revert to Approved';

  @override
  String get timerRequestRevertToRejected => 'Revert to Rejected';

  @override
  String get timerRequestLastModifiedBy => 'Last modified by';

  @override
  String timerRequestApprovedByAt(String name, String date) {
    return 'Approved by $name on $date';
  }

  @override
  String timerRequestRejectedByAt(String name, String date) {
    return 'Rejected by $name on $date';
  }

  @override
  String get timerAutoStartBreaks => 'Auto-start breaks';

  @override
  String get timerAutoStartFocus => 'Auto-start focus';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonClearSearch => 'Clear search';

  @override
  String get commonNoSearchResults => 'No matching results';

  @override
  String get timerTotalSessions => 'Total sessions';

  @override
  String get timerActiveUsers => 'Active users';

  @override
  String get timerGoalsTitle => 'Goals';

  @override
  String get timerGoalsSubtitle => 'Track your daily and weekly focus targets';

  @override
  String get timerGoalsAdd => 'Add goal';

  @override
  String get timerGoalsCreate => 'Create goal';

  @override
  String get timerGoalsCreateTitle => 'Create goal';

  @override
  String get timerGoalsCreateSuccess => 'Goal created';

  @override
  String get timerGoalsEdit => 'Edit';

  @override
  String get timerGoalsEditTitle => 'Edit goal';

  @override
  String get timerGoalsSave => 'Save goal';

  @override
  String get timerGoalsUpdateSuccess => 'Goal updated';

  @override
  String get timerGoalsDelete => 'Delete';

  @override
  String get timerGoalsDeleteTitle => 'Delete goal?';

  @override
  String get timerGoalsDeleteDescription => 'This action cannot be undone.';

  @override
  String get timerGoalsDeleteSuccess => 'Goal deleted';

  @override
  String get timerGoalsOperationFailed => 'Could not save your goal changes.';

  @override
  String get timerGoalsEmptyTitle => 'No goals yet';

  @override
  String get timerGoalsEmptyDescription => 'Create your first goal to measure daily and weekly progress.';

  @override
  String get timerGoalsCategory => 'Category';

  @override
  String get timerGoalsGeneral => 'General';

  @override
  String get timerGoalsDailyMinutes => 'Daily target (minutes)';

  @override
  String get timerGoalsWeeklyMinutesOptional => 'Weekly target (minutes, optional)';

  @override
  String get timerGoalsDailyValidation => 'Daily target must be greater than 0.';

  @override
  String get timerGoalsWeeklyValidation => 'Weekly target must be greater than 0.';

  @override
  String get timerGoalsActive => 'Active';

  @override
  String get timerGoalsInactive => 'Inactive';

  @override
  String get timerGoalsActiveLabel => 'Goal is active';

  @override
  String get timerGoalsDailyProgress => 'Daily progress';

  @override
  String get timerGoalsWeeklyProgress => 'Weekly progress';

  @override
  String get timerGoalsDailyTarget => 'Daily target';

  @override
  String get timerGoalsWeeklyTarget => 'Weekly target';

  @override
  String timerGoalsActiveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# active goals',
      one: '# active goal',
    );
    return '$_temp0';
  }

  @override
  String get timerHourUnitShort => 'h';

  @override
  String get timerMinuteUnitShort => 'm';

  @override
  String timerDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count days',
      one: '$count day',
    );
    return '$_temp0';
  }

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsNavApp => 'App';

  @override
  String get settingsNavWorkspace => 'Workspace';

  @override
  String get settingsNavYou => 'You';

  @override
  String get settingsAccountTab => 'Account';

  @override
  String get settingsPreferencesTab => 'Preferences';

  @override
  String get settingsAboutTab => 'About';

  @override
  String get settingsLicensesTab => 'Licenses';

  @override
  String get settingsProfile => 'Profile';

  @override
  String get settingsProfileDescription => 'Manage your personal details and avatar.';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsLanguageDescription => 'Choose the language used throughout the app.';

  @override
  String get settingsAppVersion => 'App version';

  @override
  String get settingsLanguageSystem => 'System default';

  @override
  String get settingsLanguageSystemDescription => 'Follow your device language automatically.';

  @override
  String get settingsLanguageEnglish => 'English';

  @override
  String get settingsLanguageVietnamese => 'Vietnamese';

  @override
  String get settingsTheme => 'Theme';

  @override
  String get settingsThemeDescription => 'Adjust the app appearance for your device and preference.';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeSystem => 'System';

  @override
  String get settingsThemeSystemDescription => 'Match your device appearance automatically.';

  @override
  String get settingsFinanceAmounts => 'Finance amounts';

  @override
  String get settingsFinanceAmountsDescription => 'Show or hide balances and transaction amounts across finance screens.';

  @override
  String get settingsSwitchWorkspace => 'Switch workspace';

  @override
  String get settingsSwitchWorkspaceDescription => 'Move between personal and team contexts.';

  @override
  String get settingsCalendar => 'Calendar';

  @override
  String get settingsFirstDayOfWeek => 'First day of week';

  @override
  String get settingsFirstDayOfWeekDescription => 'Control how calendars and weekly summaries start.';

  @override
  String get settingsFirstDayAuto => 'Auto';

  @override
  String get settingsFirstDayAutoDescription => 'Use your workspace or locale defaults when available.';

  @override
  String get settingsFirstDaySunday => 'Sunday';

  @override
  String get settingsFirstDayMonday => 'Monday';

  @override
  String get settingsFirstDaySaturday => 'Saturday';

  @override
  String get settingsHeroDescription => 'Personal setup, workspace context, and release details in one place.';

  @override
  String get settingsSignedInAs => 'Signed in as';

  @override
  String get settingsCurrentWorkspace => 'Current workspace';

  @override
  String get settingsCurrentWorkspaceDescription => 'Choose the workspace you are using right now.';

  @override
  String get settingsDefaultWorkspace => 'Default workspace';

  @override
  String get settingsDefaultWorkspaceDescription => 'The app opens here by default on every launch.';

  @override
  String get settingsWorkspacePropertiesTitle => 'Workspace information';

  @override
  String get settingsWorkspacePropertiesDescription => 'Update the workspace name and avatar.';

  @override
  String get settingsWorkspacePropertiesNoAccess => 'You need workspace settings permission to edit these properties.';

  @override
  String get settingsWorkspacePropertiesPermissionLoading => 'Checking your workspace permissions...';

  @override
  String get settingsWorkspacePropertiesUpdated => 'Workspace information updated.';

  @override
  String get settingsWorkspacePropertiesNameRequired => 'Workspace name cannot be empty';

  @override
  String get settingsWorkspaceAvatar => 'Workspace avatar';

  @override
  String get settingsWorkspaceAvatarDescription => 'Upload a new image or remove the current avatar.';

  @override
  String get settingsWorkspaceAvatarRemovePending => 'The current avatar will be removed when you save.';

  @override
  String get settingsWorkspaceNameHint => 'Workspace name';

  @override
  String get settingsNoEmail => 'No email available';

  @override
  String get settingsNoWorkspaceSelected => 'No workspace selected';

  @override
  String get settingsWorkspaceActive => 'Active';

  @override
  String get settingsAccountSectionTitle => 'Account';

  @override
  String get settingsAccountSectionDescription => 'Profile access and session controls.';

  @override
  String get settingsWorkspaceSectionTitle => 'Workspace';

  @override
  String get settingsWorkspaceSectionDescription => 'See your current context and switch when needed.';

  @override
  String get settingsWorkspaceSectionManageTitle => 'Workspace setup';

  @override
  String get settingsWorkspaceAccessTitle => 'Access';

  @override
  String get settingsWorkspaceDefaultCurrencyTitle => 'Default currency';

  @override
  String get settingsWorkspaceDefaultCurrencyDescription => 'Use one currency as the default for finance and invoice flows in this workspace.';

  @override
  String get settingsWorkspaceDefaultCurrencyField => 'Currency';

  @override
  String get settingsPreferencesSectionTitle => 'Preferences';

  @override
  String get settingsPreferencesSectionDescription => 'Language, appearance, and calendar defaults.';

  @override
  String get settingsDangerSectionTitle => 'Session';

  @override
  String get settingsDangerSectionDescription => 'Sign out and end access on this device.';

  @override
  String get settingsQuickOpenProfile => 'Open profile';

  @override
  String get settingsQuickSwitchWorkspace => 'Switch current';

  @override
  String get settingsQuickDefaultWorkspace => 'Default workspace';

  @override
  String get settingsDataStatusLabel => 'Data';

  @override
  String get settingsDataStatusLive => 'Live';

  @override
  String get settingsDataStatusCached => 'Cached';

  @override
  String get settingsDataStatusRefreshing => 'Refreshing';

  @override
  String get settingsPullToRefreshAction => 'Refresh now';

  @override
  String get settingsSignOut => 'Sign out';

  @override
  String get settingsSignOutDescription => 'End your session on this device.';

  @override
  String get settingsSignOutConfirm => 'Are you sure you want to sign out?';

  @override
  String get settingsAboutSummary => 'Tuturuuu mobile keeps your workspace tools, assistant, and day-to-day workflows within quick reach.';

  @override
  String get settingsAboutSectionTitle => 'About the app';

  @override
  String get settingsAboutSectionDescription => 'Release details and product information for this build.';

  @override
  String get settingsVersionLabel => 'Version';

  @override
  String get settingsBuildLabel => 'Build';

  @override
  String get settingsPackageLabel => 'Package';

  @override
  String get settingsVersionTileDescription => 'Installed release currently running on this device.';

  @override
  String get settingsInfrastructureSectionTitle => 'Infrastructure';

  @override
  String get settingsInfrastructureSectionDescription => 'Platform-wide controls available in the internal workspace.';

  @override
  String get settingsMobileVersions => 'Mobile versions';

  @override
  String get settingsMobileVersionsTileDescription => 'Manage the effective and minimum versions enforced by the mobile app and OTP rollout controls.';

  @override
  String get settingsMobileVersionsTitle => 'Mobile versions';

  @override
  String get settingsMobileVersionsPageDescription => 'Manage the effective and minimum app versions enforced by the mobile app before users can continue, plus OTP rollout controls for mobile and web.';

  @override
  String get settingsMobileVersionsIosTitle => 'iOS';

  @override
  String get settingsMobileVersionsIosDescription => 'Set the App Store threshold and update prompt for iPhone and iPad users.';

  @override
  String get settingsMobileVersionsAndroidTitle => 'Android';

  @override
  String get settingsMobileVersionsAndroidDescription => 'Set the Play Store threshold and update prompt for Android users.';

  @override
  String get settingsMobileVersionsOtpEnabled => 'Enable OTP login';

  @override
  String get settingsMobileVersionsIosOtpDescription => 'Allow iOS app logins to use email verification codes.';

  @override
  String get settingsMobileVersionsAndroidOtpDescription => 'Allow Android app logins to use email verification codes.';

  @override
  String get settingsMobileVersionsWebOtpTitle => 'Web OTP';

  @override
  String get settingsMobileVersionsWebOtpDescription => 'Allow the marketing web login to use email verification-code sign-in.';

  @override
  String get settingsMobileVersionsEffectiveVersion => 'Effective version';

  @override
  String get settingsMobileVersionsEffectiveVersionDescription => 'Versions below this threshold see a recommended update prompt.';

  @override
  String get settingsMobileVersionsMinimumVersion => 'Minimum version';

  @override
  String get settingsMobileVersionsMinimumVersionDescription => 'Versions below this threshold must update before continuing.';

  @override
  String get settingsMobileVersionsStoreUrl => 'Store URL';

  @override
  String get settingsMobileVersionsStoreUrlDescription => 'Required whenever either version threshold is set.';

  @override
  String get settingsMobileVersionsVersionPlaceholder => '1.2.3';

  @override
  String get settingsMobileVersionsStoreUrlPlaceholder => 'https://apps.apple.com/app/id123456789';

  @override
  String get settingsMobileVersionsSave => 'Save changes';

  @override
  String get settingsMobileVersionsSaving => 'Saving...';

  @override
  String get settingsMobileVersionsSaveSuccess => 'Mobile version policy saved.';

  @override
  String get settingsMobileVersionsSaveError => 'Failed to save mobile version policy.';

  @override
  String get settingsMobileVersionsLoadError => 'Failed to load mobile version policies.';

  @override
  String get settingsMobileVersionsWorkspaceRequiredTitle => 'Internal workspace required';

  @override
  String get settingsMobileVersionsWorkspaceRequiredDescription => 'Switch to the internal workspace to manage platform mobile version policies.';

  @override
  String get settingsMobileVersionsAccessDeniedTitle => 'Access required';

  @override
  String get settingsMobileVersionsAccessDeniedDescription => 'You need the workspace roles permission in the internal workspace to manage mobile version policies.';

  @override
  String get settingsMobileVersionsValidationVersionFormat => 'Use semantic version format x.y.z.';

  @override
  String get settingsMobileVersionsValidationStoreUrlRequired => 'Store URL is required when a version is set.';

  @override
  String get settingsMobileVersionsValidationEffectiveAtLeastMinimum => 'Effective version must be greater than or equal to the minimum version.';

  @override
  String get settingsLicensesSectionTitle => 'Open-source licenses';

  @override
  String get settingsLicensesSectionDescription => 'Review the third-party software notices bundled with the app.';

  @override
  String get settingsLicenseViewerTitle => 'Open license viewer';

  @override
  String get settingsLicenseViewerDescription => 'Browse Flutter, plugin, and package licenses included in this build.';

  @override
  String get settingsLicenseVersionDescription => 'Reference the installed version while reviewing notices.';

  @override
  String get settingsMinutesUnit => 'min';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileIdentitySectionTitle => 'Identity';

  @override
  String get profileIdentitySectionDescription => 'Keep the core details people see about your account up to date.';

  @override
  String get profileAvatar => 'Avatar';

  @override
  String get profileAvatarSet => 'Photo attached';

  @override
  String get profileAvatarDescription => 'Upload your profile picture';

  @override
  String get profileAvatarSectionTitle => 'Avatar';

  @override
  String get profileAvatarActionDescription => 'Choose a new photo or refresh the one already attached.';

  @override
  String get profileAvatarPickerDescription => 'Choose where to pick your new avatar image from.';

  @override
  String get workspaceAvatarPickerDescription => 'Choose where to pick your new workspace avatar image from.';

  @override
  String get profileUploadAvatar => 'Upload avatar';

  @override
  String get profileChangeAvatar => 'Change avatar';

  @override
  String get profileRemoveAvatar => 'Remove avatar';

  @override
  String get profileRemoveAvatarDescription => 'Delete the current photo from your account profile.';

  @override
  String get profileRemoveConfirm => 'Remove avatar?';

  @override
  String get profileAccountStatus => 'Account status';

  @override
  String get profileAccountStatusDescription => 'Membership and verification details for this account.';

  @override
  String get profileStatus => 'Status';

  @override
  String get profileStatusUnknown => 'Unknown';

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
  String get profileDisplayNameDescription => 'This name appears in collaborative surfaces across the app.';

  @override
  String get profileDisplayNameRequired => 'Display name cannot be empty';

  @override
  String get profileFullName => 'Full name';

  @override
  String get profileFullNameHint => 'Your full name';

  @override
  String get profileFullNameDescription => 'Use your legal or preferred full name for account records.';

  @override
  String get profileFullNameRequired => 'Full name cannot be empty';

  @override
  String get profileEmail => 'Email';

  @override
  String get profileEmailHint => 'example@tuturuuu.com';

  @override
  String get profileEmailDescription => 'Updating your email sends confirmation to both the old and new addresses.';

  @override
  String get profileInvalidEmail => 'Please enter a valid email address';

  @override
  String get profileCurrentEmail => 'Current email';

  @override
  String get profileNewEmail => 'New email';

  @override
  String get profileMissingValue => 'Not set';

  @override
  String get profileDangerAction => 'Danger';

  @override
  String profileEmailPendingChange(String email) {
    return 'Pending change to $email';
  }

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
  String get workspacePickerTitle => 'Workspaces';

  @override
  String get workspaceDefaultPickerTitle => 'Default workspace';

  @override
  String get workspaceCurrentBadge => 'Current';

  @override
  String get workspaceDefaultBadge => 'Default';

  @override
  String get workspacePersonalBadge => 'Personal';

  @override
  String get workspacePersonalSection => 'Personal';

  @override
  String get workspaceSystemBadge => 'System';

  @override
  String get workspaceSystemSection => 'Internal';

  @override
  String get workspaceTeamSection => 'Team workspaces';

  @override
  String get workspaceCreateTitle => 'Create workspace';

  @override
  String get workspaceCreateDescription => 'Create a fresh space for projects, habits, finance, and more.';

  @override
  String get workspaceCreateSuccess => 'Workspace created.';

  @override
  String get workspaceCreateSuccessAvatarWarning => 'Workspace created, but profile picture failed to upload.';

  @override
  String get workspaceCreateError => 'Failed to create workspace';

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
  String get notificationsTitle => 'Notifications';

  @override
  String notificationsSubtitle(int count) {
    return '$count unread';
  }

  @override
  String get notificationsInbox => 'Inbox';

  @override
  String get notificationsArchive => 'Archive';

  @override
  String get notificationsArchiveAll => 'Archive all';

  @override
  String get notificationsArchiveAllError => 'Couldn\'t archive notifications right now';

  @override
  String get notificationsMarkRead => 'Mark as read';

  @override
  String get notificationsMarkUnread => 'Mark as unread';

  @override
  String get notificationsLoadingMore => 'Loading more...';

  @override
  String get notificationsInboxEmptyTitle => 'No unread notifications';

  @override
  String get notificationsInboxEmptyMessage => 'New activity, mentions, and invites will show up here.';

  @override
  String get notificationsArchiveEmptyTitle => 'No archived notifications';

  @override
  String get notificationsArchiveEmptyMessage => 'Read notifications will move here after you\'ve cleared them.';

  @override
  String get notificationsLoadErrorTitle => 'Couldn\'t load notifications';

  @override
  String get notificationsLoadErrorMessage => 'Try again in a moment.';

  @override
  String get notificationsAcceptInvite => 'Accept';

  @override
  String get notificationsDeclineInvite => 'Decline';

  @override
  String get notificationsInviteAccepted => 'Invite accepted';

  @override
  String get notificationsInviteDeclined => 'Invite declined';

  @override
  String get notificationsInviteActionError => 'Couldn\'t update this invite right now';

  @override
  String get notificationsOpenAction => 'Open task';

  @override
  String get notificationsOpenUnsupported => 'This notification can\'t be opened yet';

  @override
  String get notificationsJustNow => 'Just now';

  @override
  String notificationsMinutesAgo(int count) {
    return '${count}m ago';
  }

  @override
  String notificationsHoursAgo(int count) {
    return '${count}h ago';
  }

  @override
  String notificationsDaysAgo(int count) {
    return '${count}d ago';
  }

  @override
  String get mfaTitle => 'Two-factor authentication';

  @override
  String get mfaSubtitle => 'Enter the code from your authenticator app';

  @override
  String get mfaCodeLabel => '6-digit code';

  @override
  String get mfaVerify => 'Verify';

  @override
  String get mfaInvalidCode => 'Invalid verification code. Please try again.';

  @override
  String get mfaSignOut => 'Sign out';

  @override
  String get captchaError => 'Security check failed. Please try again.';

  @override
  String get commonOff => 'Off';

  @override
  String get commonOn => 'On';

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
  String get commonShowLess => 'Show less';

  @override
  String get commonShowMore => 'Show more';

  @override
  String get commonPressBackAgainToExit => 'Press back again to exit';

  @override
  String get commonPressBackAgainToExitHint => 'Press back again within 2 seconds to close the app.';

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

  @override
  String get settingsWorkspaceMembersTitle => 'Members';

  @override
  String get settingsWorkspaceMembersSubtitle => 'Invite people, review access, and manage links.';

  @override
  String get settingsWorkspaceMembersAccessDenied => 'You need member access to manage this workspace.';

  @override
  String settingsWorkspaceMembersActiveSection(int count) {
    return 'Members ($count)';
  }

  @override
  String get settingsWorkspaceMembersEmpty => 'No members yet.';

  @override
  String settingsWorkspaceMembersPendingSection(int count) {
    return 'Pending ($count)';
  }

  @override
  String get settingsWorkspaceMembersPendingEmpty => 'No pending invites.';

  @override
  String get settingsWorkspaceMembersLinksSection => 'Invite links';

  @override
  String get settingsWorkspaceMembersLinksEmpty => 'No invite links yet.';

  @override
  String get settingsWorkspaceMembersInviteAction => 'Invite';

  @override
  String get settingsWorkspaceMembersLinkAction => 'New link';

  @override
  String get settingsWorkspaceMembersLinkCopied => 'Invite link copied.';

  @override
  String get settingsWorkspaceMembersRemoveTitle => 'Remove';

  @override
  String settingsWorkspaceMembersRemoveMessage(String name) {
    return 'Remove $name from this workspace?';
  }

  @override
  String get settingsWorkspaceMembersLinkDeleteTitle => 'Delete link';

  @override
  String get settingsWorkspaceMembersLinkDeleteMessage => 'Delete this invite link?';

  @override
  String get settingsWorkspaceMembersEmailField => 'Email';

  @override
  String get settingsWorkspaceMembersEmailPlaceholder => 'name@example.com';

  @override
  String get settingsWorkspaceMembersEmailInvalid => 'Enter a valid email address.';

  @override
  String get settingsWorkspaceMembersInviteSent => 'Invite sent.';

  @override
  String get settingsWorkspaceMembersLinkLimitField => 'Max uses';

  @override
  String get settingsWorkspaceMembersLinkLimitPlaceholder => 'Leave empty for unlimited';

  @override
  String get settingsWorkspaceMembersLinkLimitInvalid => 'Enter a positive whole number.';

  @override
  String get settingsWorkspaceMembersLinkCreated => 'Invite link created.';

  @override
  String get settingsWorkspaceMembersCreatorChip => 'Creator';

  @override
  String get settingsWorkspaceMembersPendingChip => 'Pending';

  @override
  String get settingsWorkspaceMembersLinkNever => 'No expiry';

  @override
  String get settingsWorkspaceMembersLinkExpired => 'Expired';

  @override
  String get settingsWorkspaceMembersLinkFull => 'Full';

  @override
  String get settingsWorkspaceMembersLinkActive => 'Active';

  @override
  String get settingsWorkspaceMembersLinkCopy => 'Copy';

  @override
  String get settingsWorkspaceRolesTitle => 'Roles';

  @override
  String get settingsWorkspaceRolesSubtitle => 'Control default access and workspace roles.';

  @override
  String get settingsWorkspaceRolesAccessDenied => 'You need role access to manage permissions.';

  @override
  String get settingsWorkspaceRolesCreate => 'Create role';

  @override
  String get settingsWorkspaceRolesDefaultTitle => 'Default access';

  @override
  String get settingsWorkspaceRolesListTitle => 'Roles';

  @override
  String get settingsWorkspaceRolesEmpty => 'No custom roles yet.';

  @override
  String get settingsWorkspaceRolesDeleteTitle => 'Delete role';

  @override
  String settingsWorkspaceRolesDeleteMessage(String name) {
    return 'Delete $name?';
  }

  @override
  String settingsWorkspaceRolesPermissionCount(int count) {
    return '$count permissions enabled';
  }

  @override
  String get settingsWorkspaceRolesEdit => 'Edit role';

  @override
  String get settingsWorkspaceRolesSave => 'Save';

  @override
  String get settingsWorkspaceRolesNameField => 'Name';

  @override
  String get settingsWorkspaceRolesNamePlaceholder => 'Role name';

  @override
  String get settingsWorkspaceRolesNameRequired => 'Enter a role name.';

  @override
  String get settingsWorkspaceRolesPermissionsSection => 'Permissions';

  @override
  String get settingsWorkspaceRolesMembersSection => 'Assigned members';

  @override
  String get settingsWorkspaceRolesMembersEmpty => 'No active members available.';

  @override
  String get settingsWorkspaceRolesSaved => 'Role saved.';

  @override
  String get settingsWorkspaceSecretsTitle => 'Secrets';

  @override
  String get settingsWorkspaceSecretsSubtitle => 'Manage workspace secrets and storage rollout.';

  @override
  String get settingsWorkspaceSecretsAccessDeniedTitle => 'Access required';

  @override
  String get settingsWorkspaceSecretsAccessDeniedDescription => 'You need the manage workspace secrets permission in the internal workspace to open this page.';

  @override
  String get settingsWorkspaceSecretsWorkspaceRequiredTitle => 'Workspace required';

  @override
  String get settingsWorkspaceSecretsWorkspaceRequiredDescription => 'Select a workspace before opening secrets management.';

  @override
  String settingsWorkspaceSecretsPageDescription(String workspaceName) {
    return 'Manage secrets and storage rollout for $workspaceName.';
  }

  @override
  String get settingsWorkspaceSecretsTotalSecrets => 'All secrets';

  @override
  String get settingsWorkspaceSecretsVisibleSecrets => 'Visible';

  @override
  String get settingsWorkspaceSecretsActiveBackend => 'Active backend';

  @override
  String get settingsWorkspaceSecretsCreate => 'Create secret';

  @override
  String get settingsWorkspaceSecretsRolloutTitle => 'Storage rollout';

  @override
  String get settingsWorkspaceSecretsRolloutDescription => 'Inspect the current Drive backend, confirm required provider secrets, and migrate files between providers when needed.';

  @override
  String get settingsWorkspaceSecretsProviderSecrets => 'Provider secrets';

  @override
  String get settingsWorkspaceSecretsZipAutomation => 'ZIP automation';

  @override
  String get settingsWorkspaceSecretsStateEnabled => 'Enabled';

  @override
  String get settingsWorkspaceSecretsAutoExtractBlocked => 'Needs proxy secrets';

  @override
  String get settingsWorkspaceSecretsStateDisabled => 'Disabled';

  @override
  String get settingsWorkspaceSecretsSelected => 'Selected';

  @override
  String get settingsWorkspaceSecretsRecommended => 'Recommended';

  @override
  String get settingsWorkspaceSecretsObjects => 'Objects';

  @override
  String get settingsWorkspaceSecretsInventory => 'Inventory';

  @override
  String get settingsWorkspaceSecretsUnavailable => 'Unavailable';

  @override
  String get settingsWorkspaceSecretsReadyMessage => 'This backend is ready to receive Drive files.';

  @override
  String get settingsWorkspaceSecretsMissingMessage => 'Add the required secrets before routing Drive traffic here.';

  @override
  String get settingsWorkspaceSecretsMigrating => 'Migrating...';

  @override
  String settingsWorkspaceSecretsCopyInto(String provider) {
    return 'Copy into $provider';
  }

  @override
  String get settingsWorkspaceSecretsAutoExtractTitle => 'Auto extract';

  @override
  String get settingsWorkspaceSecretsAutoExtractDescription => 'Track whether automatic ZIP extraction is enabled and whether the proxy credentials are ready.';

  @override
  String get settingsWorkspaceSecretsAutoExtractSwitch => 'Switch';

  @override
  String get settingsWorkspaceSecretsAutoExtractProxyUrl => 'Proxy URL';

  @override
  String get settingsWorkspaceSecretsAutoExtractProxyToken => 'Shared token';

  @override
  String get settingsWorkspaceSecretsStatePresent => 'Present';

  @override
  String get settingsWorkspaceSecretsStateMissing => 'Missing';

  @override
  String get settingsWorkspaceSecretsProviderSecretsTitle => 'Provider secrets';

  @override
  String get settingsWorkspaceSecretsProviderSecretsDescription => 'Edit the secrets that define which storage provider Drive uses for this workspace.';

  @override
  String get settingsWorkspaceSecretsProxySecretsTitle => 'ZIP proxy secrets';

  @override
  String get settingsWorkspaceSecretsProxySecretsDescription => 'Configure the optional secrets used by the ZIP extraction proxy.';

  @override
  String get settingsWorkspaceSecretsDriveStorageProviderDescription => 'Selects the Drive backend for this workspace. Use \"supabase\" for the current path or \"r2\" to route Drive through Cloudflare R2.';

  @override
  String get settingsWorkspaceSecretsDriveR2BucketDescription => 'Cloudflare R2 bucket name used for Drive objects when the provider is set to \"r2\".';

  @override
  String get settingsWorkspaceSecretsDriveR2EndpointDescription => 'S3-compatible R2 endpoint, for example https://<account-id>.r2.cloudflarestorage.com.';

  @override
  String get settingsWorkspaceSecretsDriveR2AccessKeyIdDescription => 'Access key ID for the Cloudflare R2 token used by the server-side Drive adapter.';

  @override
  String get settingsWorkspaceSecretsDriveR2SecretAccessKeyDescription => 'Secret access key for the Cloudflare R2 token used by the server-side Drive adapter.';

  @override
  String get settingsWorkspaceSecretsDriveAutoExtractZipDescription => 'Enables automatic ZIP extraction after uploads. Disabled by default.';

  @override
  String get settingsWorkspaceSecretsDriveAutoExtractProxyUrlDescription => 'HTTPS URL for the self-hosted ZIP extraction proxy. Only used when auto extraction is enabled.';

  @override
  String get settingsWorkspaceSecretsDriveAutoExtractProxyTokenDescription => 'Shared bearer token used to authenticate requests to the ZIP extraction proxy.';

  @override
  String get settingsWorkspaceSecretsNoValue => 'No value';

  @override
  String get settingsWorkspaceSecretsConfigured => 'Configured';

  @override
  String get settingsWorkspaceSecretsMissing => 'Missing';

  @override
  String get settingsWorkspaceSecretsRequired => 'Required';

  @override
  String get settingsWorkspaceSecretsOptional => 'Optional';

  @override
  String get settingsWorkspaceSecretsAdd => 'Add';

  @override
  String get settingsWorkspaceSecretsListTitle => 'Secrets list';

  @override
  String get settingsWorkspaceSecretsListDescription => 'Search, edit, and remove workspace secrets. Boolean values can be toggled inline.';

  @override
  String get settingsWorkspaceSecretsSearchPlaceholder => 'Search secrets';

  @override
  String get settingsWorkspaceSecretsEmptyTitle => 'No secrets found';

  @override
  String get settingsWorkspaceSecretsEmptyDescription => 'Create a secret or adjust the search query to see matching entries.';

  @override
  String get settingsWorkspaceSecretsEdit => 'Edit';

  @override
  String get settingsWorkspaceSecretsDeleteTitle => 'Delete';

  @override
  String settingsWorkspaceSecretsDeleteMessage(String name) {
    return 'Delete $name?';
  }

  @override
  String get settingsWorkspaceSecretsDeleteSuccess => 'Secret deleted.';

  @override
  String get settingsWorkspaceSecretsNameField => 'Name';

  @override
  String get settingsWorkspaceSecretsNamePlaceholder => 'SECRET_NAME';

  @override
  String get settingsWorkspaceSecretsValueField => 'Value';

  @override
  String get settingsWorkspaceSecretsValuePlaceholder => 'Secret value';

  @override
  String get settingsWorkspaceSecretsEditorDescription => 'Update the secret name and value used by this workspace.';

  @override
  String get settingsWorkspaceSecretsSaving => 'Saving...';

  @override
  String get settingsWorkspaceSecretsSave => 'Save secret';

  @override
  String get settingsWorkspaceSecretsNameRequired => 'Enter a secret name.';

  @override
  String get settingsWorkspaceSecretsValueRequired => 'Enter a secret value.';

  @override
  String get settingsWorkspaceSecretsSaveSuccess => 'Secret saved.';

  @override
  String get settingsWorkspaceSecretsSaveError => 'Failed to save secret.';

  @override
  String get settingsWorkspaceSecretsLoadError => 'Failed to load workspace secrets.';

  @override
  String settingsWorkspaceSecretsMigrationSuccess(int filesCopied, String provider) {
    return 'Copied $filesCopied files into $provider.';
  }

  @override
  String get settingsWorkspaceSecretsMigrationError => 'Failed to migrate workspace storage.';

  @override
  String get settingsWorkspaceSecretsProviderSupabaseTitle => 'Supabase';

  @override
  String get settingsWorkspaceSecretsProviderSupabaseDescription => 'The current built-in Drive storage backend.';

  @override
  String get settingsWorkspaceSecretsProviderR2Title => 'Cloudflare R2';

  @override
  String get settingsWorkspaceSecretsProviderR2Description => 'An S3-compatible backend for external Drive storage.';
}
