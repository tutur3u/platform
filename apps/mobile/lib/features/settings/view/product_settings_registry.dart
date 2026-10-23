import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/assistant/view/assistant_settings_hub.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/view/mail_settings_hub.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:mobile/features/settings/view/product_settings_section.dart';

/// Current values behind the Apps rows, loaded once per Settings visit.
class AppSettingsSummaries {
  const AppSettingsSummaries({this.boardPicker, this.pomodoro});
  final bool? boardPicker;
  final PomodoroSettings? pomodoro;
}

/// One row in Settings > Apps. Routed apps open `/settings/apps/:id`; Mail
/// and Assistant open their account-scoped hubs.
class ProductSettingsEntry {
  const ProductSettingsEntry({
    required this.id,
    required this.icon,
    required this.title,
    required this.visible,
    required this.open,
    this.summary,
    this.keywords = _noKeywords,
  });
  final String id;
  final IconData icon;
  final String Function(BuildContext) title;
  final bool Function(BuildContext) visible;
  final Future<void> Function(BuildContext) open;
  final String? Function(BuildContext, AppSettingsSummaries)? summary;

  /// Search terms for settings that live on the app's sub-screen.
  final List<String> Function(AppLocalizations) keywords;
}

List<String> _noKeywords(AppLocalizations _) => const [];

bool _assistantSettingsReady(BuildContext context) {
  final auth = context.read<AuthCubit>().state;
  return auth.status == AuthStatus.authenticated &&
      !auth.isLoading &&
      auth.user != null &&
      context.read<WorkspaceCubit>().state.currentWorkspace != null;
}

Future<void> _push(BuildContext context, String appId) async {
  await context.push(Routes.settingsAppPath(appId));
}

final productSettingsRegistry = <ProductSettingsEntry>[
  ProductSettingsEntry(
    id: 'tasks',
    icon: shad.LucideIcons.squareKanban,
    title: (context) => context.l10n.navTasks,
    visible: (_) => true,
    open: (context) => _push(context, 'tasks'),
    summary: (context, values) =>
        taskBoardSummary(context.l10n, boardPicker: values.boardPicker),
    keywords: (l10n) => [
      l10n.settingsDefaultTaskBoardNavigation,
      l10n.taskBoardsTitle,
    ],
  ),
  ProductSettingsEntry(
    id: 'calendar',
    icon: shad.LucideIcons.calendar,
    title: (context) => context.l10n.navCalendar,
    visible: (context) => context.read<CalendarSettingsCubit?>() != null,
    open: (context) => _push(context, 'calendar'),
    summary: (context, _) => context.l10n.settingsFirstDaySummary(
      calendarFirstDayLabel(
        context.watch<CalendarSettingsCubit>().state,
        context.l10n,
      ),
    ),
    keywords: (l10n) => [
      l10n.settingsFirstDayOfWeek,
      l10n.calendarConnectionsTitle,
    ],
  ),
  ProductSettingsEntry(
    id: 'finance',
    icon: shad.LucideIcons.wallet,
    title: (context) => context.l10n.navFinance,
    visible: (context) => context.read<FinancePreferencesCubit?>() != null,
    open: (context) => _push(context, 'finance'),
    summary: (context, _) => financeAmountsLabel(
      context.l10n,
      showAmounts: context.watch<FinancePreferencesCubit>().state.showAmounts,
    ),
    keywords: (l10n) => [l10n.settingsFinanceAmounts],
  ),
  ProductSettingsEntry(
    id: 'timer',
    icon: shad.LucideIcons.timer,
    title: (context) => context.l10n.timerTitle,
    // Timer is opt-in; its routed sub-screen stays reachable by link.
    visible: (context) =>
        AppRegistry.moduleById('timer')?.visibleIn(context) ?? false,
    open: (context) => _push(context, 'timer'),
    summary: (context, values) => values.pomodoro == null
        ? null
        : pomodoroSummary(values.pomodoro!, context.l10n),
    keywords: (l10n) => [
      l10n.settingsPomodoroTitle,
      l10n.settingsApprovalThreshold,
    ],
  ),
  ProductSettingsEntry(
    id: 'mail',
    icon: shad.LucideIcons.mail,
    title: (context) => context.l10n.mailTitle,
    visible: (context) {
      final user = context.read<AuthCubit>().state.user;
      return user != null &&
          canDiscoverMail(user.email, appMetadata: user.appMetadata) &&
          context.read<WorkspaceCubit>().state.currentWorkspace != null;
    },
    summary: (context, _) => context.l10n.settingsMailSummary,
    keywords: (l10n) => [l10n.mailSwipeActions, l10n.mailSignature],
    open: (context) async {
      final workspaceId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      if (workspaceId == null) return;
      final location = GoRouterState.of(context).matchedLocation;
      await pushScopedSettingsPage(
        context,
        builder: (_, isCurrent) => MailSettingsHub(
          workspaceId: workspaceId,
          locations: {location},
          isScopeCurrent: isCurrent,
        ),
      );
    },
  ),
  ProductSettingsEntry(
    id: 'assistant',
    icon: shad.LucideIcons.sparkles,
    title: (context) => context.l10n.navAssistant,
    visible: _assistantSettingsReady,
    summary: (context, _) => context.l10n.settingsAssistantSummary,
    keywords: (l10n) => [l10n.assistantSettingsTitle],
    open: (context) async {
      if (!_assistantSettingsReady(context)) return;
      final workspaceId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      if (workspaceId == null) return;
      final location = GoRouterState.of(context).matchedLocation;
      await pushScopedSettingsPage(
        context,
        rootNavigator: true,
        builder: (_, isCurrent) => AssistantSettingsHub(
          workspaceId: workspaceId,
          locations: {location},
          isScopeCurrent: isCurrent,
        ),
      );
    },
  ),
];
