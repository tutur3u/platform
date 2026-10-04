import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mobile_versions/view/mobile_version_settings_page.dart';
import 'package:mobile/features/profile/view/profile_page.dart';
import 'package:mobile/features/reminders/reminder_settings_page.dart';
import 'package:mobile/features/security/account/account_security_page.dart';
import 'package:mobile/features/security/mfa_approval/view/mfa_request_page.dart';
import 'package:mobile/features/security/qr_login/view/qr_login_scanner_page.dart';
import 'package:mobile/features/settings/view/internal_accounts_page.dart';
import 'package:mobile/features/settings/view/offline_module_page.dart';
import 'package:mobile/features/settings/view/offline_page.dart';
import 'package:mobile/features/settings/view/release_notes_page.dart';
import 'package:mobile/features/settings/view/settings_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_members_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_roles_page.dart';
import 'package:mobile/features/settings/view/settings_workspace_secrets_page.dart';
import 'package:mobile/features/shell/view/manage_accounts_page.dart';

/// Account, device and workspace settings share the app shell.
List<RouteBase> settingsRoutes() => [
  GoRoute(path: Routes.profileEdit, redirect: (_, _) => Routes.settingsProfile),
  GoRoute(
    path: Routes.profileAccounts,
    redirect: (_, _) => Routes.settingsAccounts,
  ),
  GoRoute(
    path: Routes.settingsPreferences,
    redirect: (context, state) => Routes.settings,
  ),
  GoRoute(
    path: Routes.settingsExperiments,
    builder: (context, state) =>
        const SettingsPage(section: SettingsSectionDestination.experiments),
  ),
  GoRoute(
    path: Routes.settingsInfrastructure,
    builder: (context, state) =>
        const SettingsPage(section: SettingsSectionDestination.infrastructure),
  ),
  GoRoute(
    path: Routes.settingsAbout,
    builder: (context, state) =>
        const SettingsPage(section: SettingsSectionDestination.about),
  ),
  GoRoute(
    path: Routes.settingsWhatsNew,
    builder: (context, state) => const ReleaseNotesPage(),
  ),
  GoRoute(
    path: Routes.settingsReminders,
    builder: (context, state) => const ReminderSettingsPage(),
  ),
  GoRoute(
    path: Routes.settingsSession,
    builder: (context, state) =>
        const SettingsPage(section: SettingsSectionDestination.session),
  ),
  GoRoute(
    path: Routes.settingsAccountSecurity,
    builder: (context, state) => const AccountSecurityPage(),
  ),
  GoRoute(
    path: Routes.settingsMfaApproval,
    builder: (context, state) => MfaRequestPage(
      challengeId: state.uri.queryParameters['challengeId'] ?? '',
      userId: state.uri.queryParameters['userId'] ?? '',
    ),
  ),
  GoRoute(
    path: Routes.settingsQrLoginScan,
    builder: (context, state) => const QrLoginScannerPage(),
  ),
  GoRoute(
    path: Routes.settingsWorkspace,
    builder: (context, state) => const SettingsWorkspacePage(),
  ),
  GoRoute(
    path: Routes.settingsWorkspaceSecrets,
    builder: (context, state) => const SettingsWorkspaceSecretsPage(),
  ),
  GoRoute(
    path: Routes.settingsWorkspaceMembers,
    builder: (context, state) => const SettingsWorkspaceMembersPage(),
  ),
  GoRoute(
    path: Routes.settingsWorkspaceRoles,
    builder: (context, state) => const SettingsWorkspaceRolesPage(),
  ),
  GoRoute(
    path: Routes.settingsMobileVersions,
    builder: (context, state) => const MobileVersionSettingsPage(),
  ),
  GoRoute(path: Routes.settingsProfile, builder: (_, _) => const ProfilePage()),
  GoRoute(
    path: Routes.settingsAccounts,
    builder: (_, _) => const ManageAccountsPage(),
  ),
  GoRoute(
    path: Routes.settingsInternalAccounts,
    builder: (_, _) => const InternalAccountsPage(embedded: true),
  ),
  GoRoute(
    path: Routes.settingsOffline,
    builder: (_, _) => const OfflinePage(embedded: true),
  ),
  GoRoute(
    path: Routes.settingsOfflineModule,
    redirect: (_, state) =>
        const {
          'finance',
          'inventory',
          'tasks',
          'calendar',
        }.contains(state.pathParameters['moduleId'])
        ? null
        : Routes.settingsOffline,
    builder: (_, state) => OfflineModulePage(
      moduleId: state.pathParameters['moduleId']!,
      embedded: true,
    ),
  ),
];
