import 'package:mobile/l10n/l10n.dart';

enum AppCategory {
  work,
  money,
  communication,
  learning,
  tools;

  static AppCategory forModule(String id) => switch (id) {
    'tasks' ||
    'calendar' ||
    'drive' ||
    'documents' ||
    'notes' ||
    'crm' ||
    'cms' ||
    'timer' => work,
    'finance' || 'inventory' => money,
    'mail' || 'meet' || 'chat' => communication,
    'education' => learning,
    _ => tools,
  };

  String label(AppLocalizations l10n) => switch (this) {
    work => l10n.appsCategoryWork,
    money => l10n.appsCategoryMoney,
    communication => l10n.appsCategoryCommunication,
    learning => l10n.appsCategoryLearning,
    tools => l10n.appsCategoryTools,
  };
}
