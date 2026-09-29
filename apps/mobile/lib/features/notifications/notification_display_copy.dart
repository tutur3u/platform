import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

typedef NotificationDisplayCopy = ({String title, String? body});

const _appPrefixes = <(String, String)>[
  ('mail', 'mail'),
  ('email', 'mail'),
  ('task', 'task'),
  ('deadline', 'task'),
  ('calendar', 'calendar'),
  ('event', 'calendar'),
  ('finance', 'finance'),
  ('wallet', 'finance'),
  ('transaction', 'finance'),
  ('invoice', 'finance'),
  ('inventory', 'inventory'),
  ('product', 'inventory'),
  ('stock', 'inventory'),
  ('checkout', 'inventory'),
  ('note', 'notes'),
  ('document', 'documents'),
  ('chat', 'chat'),
  ('meet', 'meet'),
  ('drive', 'drive'),
  ('file', 'drive'),
  ('folder', 'drive'),
  ('education', 'education'),
  ('course', 'education'),
  ('quiz', 'education'),
  ('cms', 'cms'),
  ('content', 'cms'),
  ('crm', 'crm'),
  ('contact', 'crm'),
  ('habit', 'habits'),
  ('timer', 'timer'),
  ('time_tracking', 'timer'),
  ('storefront', 'storefront'),
  ('assistant', 'assistant'),
  ('ai', 'assistant'),
  ('workspace', 'workspace'),
  ('member', 'workspace'),
  ('security', 'security'),
  ('mfa', 'security'),
  ('login', 'security'),
];

String? _nonEmpty(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

String _appId(AppNotification notification) {
  for (final source in [notification.type, notification.entityType]) {
    final normalized = source?.toLowerCase() ?? '';
    for (final (prefix, appId) in _appPrefixes) {
      if (normalized == prefix || normalized.startsWith('${prefix}_')) {
        return appId;
      }
    }
  }
  return 'tuturuuu';
}

String notificationAppLabel(
  AppNotification notification,
  AppLocalizations l10n,
) => switch (_appId(notification)) {
  'mail' => l10n.mailTitle,
  'task' => l10n.notificationTaskAppLabel,
  'calendar' => l10n.navCalendar,
  'finance' => l10n.navFinance,
  'inventory' => l10n.inventoryTitle,
  'notes' => l10n.notesTitle,
  'documents' => l10n.documentsTitle,
  'chat' => l10n.chatTitle,
  'meet' => l10n.meetTitle,
  'drive' => l10n.driveTitle,
  'education' => l10n.educationTitle,
  'cms' => l10n.cmsTitleApp,
  'crm' => l10n.crmTitle,
  'habits' => l10n.navHabits,
  'timer' => l10n.navTimer,
  'storefront' => l10n.storefrontTitle,
  'assistant' => l10n.navAssistant,
  'workspace' => l10n.notificationWorkspaceAppLabel,
  'security' => l10n.notificationSecurityAppLabel,
  _ => l10n.appTitle,
};

NotificationDisplayCopy notificationDisplayCopy(
  AppNotification notification,
  AppLocalizations l10n,
) {
  final app = notificationAppLabel(notification, l10n);
  final rawTitle = _nonEmpty(notification.title) ?? app;
  final itemTitle = switch (_appId(notification)) {
    'task' => _nonEmpty(notification.data['task_name']),
    'calendar' =>
      _nonEmpty(notification.data['event_title']) ??
          _nonEmpty(notification.data['event_name']),
    'meet' => _nonEmpty(notification.data['meeting_title']),
    _ => null,
  };
  final prefix = '$app:';
  final title =
      itemTitle ??
      (rawTitle.toLowerCase().startsWith(prefix.toLowerCase())
          ? rawTitle.substring(prefix.length).trim()
          : rawTitle);
  final description = _nonEmpty(notification.description);
  final bodyParts = <String>[
    if (itemTitle != null && rawTitle != itemTitle) rawTitle,
    if (description != null && description != title) description,
  ];
  return (
    title: '$app: $title',
    body: bodyParts.isEmpty ? null : bodyParts.join(' · '),
  );
}
