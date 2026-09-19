import 'package:flutter/widgets.dart';
import 'package:mobile/l10n/l10n.dart';

String appDescription(BuildContext context, String moduleId) {
  return switch (moduleId) {
    'habits' => context.l10n.appsHubHabitsDescription,
    'tasks' => context.l10n.appsHubTasksDescription,
    'chat' => context.l10n.appsHubChatDescription,
    'calendar' => context.l10n.appsHubCalendarDescription,
    'mail' => context.l10n.appsHubMailDescription,
    'cms' => context.l10n.appsHubCmsDescription,
    'finance' => context.l10n.appsHubFinanceDescription,
    'drive' => context.l10n.appsHubDriveDescription,
    'documents' => context.l10n.appsHubDocumentsDescription,
    'education' => context.l10n.appsHubEducationDescription,
    'crm' => context.l10n.appsHubCrmDescription,
    'meet' => context.l10n.appsHubMeetDescription,
    'inventory' => context.l10n.appsHubInventoryDescription,
    'notifications' => context.l10n.appsHubNotificationsDescription,
    'settings' => context.l10n.appsHubSettingsDescription,
    'timer' => context.l10n.appsHubTimerDescription,
    _ => '',
  };
}
