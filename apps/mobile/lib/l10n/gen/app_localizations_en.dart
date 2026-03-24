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
  String get loginSignIn => 'Sign in';

  @override
  String get authContinueWithGoogle => 'Continue with Google';

  @override
  String get authContinueWithEmail => 'or continue with email';

  @override
  String get authGoogleSignInFailed => 'Google sign-in failed. Please try again.';

  @override
  String get authGoogleBrowserLaunchFailed => 'Unable to open Google sign-in right now.';

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
  String get signUpAlreadyHaveAccountPrompt => 'Already have an account?';

  @override
  String get signUpSignIn => 'Sign in';

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
  String get appsHubTasksDescription => 'Assigned work, planning, and portfolio.';

  @override
  String get appsHubCalendarDescription => 'Agenda, upcoming events, and schedule views.';

  @override
  String get appsHubFinanceDescription => 'Wallets, categories, and transaction history.';

  @override
  String get appsHubTimerDescription => 'Tracking sessions, stats, and requests.';

  @override
  String get assistantComingSoon => 'Coming Soon';

  @override
  String get assistantSelectWorkspace => 'Select a workspace';

  @override
  String get assistantWorkspaceAwareDescription => 'Your AI assistant for planning, questions, and quick actions.';

  @override
  String get assistantHistoryTitle => 'Recent chats';

  @override
  String get assistantUntitledChat => 'Untitled chat';

  @override
  String get assistantPersonalWorkspace => 'Personal';

  @override
  String get assistantSettingsTitle => 'Assistant settings';

  @override
  String get assistantActionsTitle => 'Assistant actions';

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
  String get assistantContextUpdatedLabel => 'Workspace context updated';

  @override
  String get assistantPreferencesUpdatedLabel => 'Assistant preferences updated';

  @override
  String get assistantShowBottomNavLabel => 'Show bottom nav';

  @override
  String get assistantHideBottomNavLabel => 'Hide bottom nav';

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
  String get dashboardQuickLaunch => 'Quick launch';

  @override
  String get dashboardAssignedToMe => 'Assigned to me';

  @override
  String get dashboardUpcomingEvents => 'Upcoming events';

  @override
  String get dashboardOpenTasks => 'Open tasks';

  @override
  String get dashboardOpenCalendar => 'Open calendar';

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
  String get taskBoardDetailListView => 'List view';

  @override
  String get taskBoardDetailKanbanView => 'Kanban view';

  @override
  String get taskBoardDetailSearchPlaceholder => 'Search tasks';

  @override
  String get taskBoardDetailNoListsTitle => 'No lists yet';

  @override
  String get taskBoardDetailNoListsDescription => 'Create a list to start organizing tasks in this board.';

  @override
  String get taskBoardDetailNoTasksInList => 'No tasks in this list';

  @override
  String get taskBoardDetailNoMatchingTasks => 'No tasks match your search.';

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
  String get taskBoardDetailTaskDescriptionHint => 'Add description';

  @override
  String get taskBoardDetailTaskDescriptionComingSoon => 'Description editing is coming soon on mobile.';

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
  String get taskBoardDetailToday => 'today';

  @override
  String get taskBoardDetailTomorrow => 'tomorrow';

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
  String get taskBoardDetailNoMoveTargets => 'No other lists available for moving this task.';

  @override
  String get taskBoardDetailBoardActions => 'Board actions';

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
  String get taskLabelsColorInvalid => 'Choose one of the supported preset colors';

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
  String get financeCreateTransaction => 'Create transaction';

  @override
  String get financeEditTransaction => 'Edit transaction';

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
  String get financeDestinationWallet => 'Destination wallet';

  @override
  String get financeSelectDestinationWallet => 'Select destination wallet';

  @override
  String get financeTransferMode => 'Transfer mode';

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
  String get timerSessionStopSuccess => 'Session added successfully.';

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
    return '$count tasks';
  }

  @override
  String get timerTaskPickerSearch => 'Search tasks';

  @override
  String get timerTaskIdPlaceholder => 'Select a task';

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
  String get workspacePickerTitle => 'Workspaces';

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
