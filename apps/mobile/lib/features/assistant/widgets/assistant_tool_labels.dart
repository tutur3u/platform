import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Product-level groups for Mira tool names (`packages/ai` `MIRA_TOOL_NAMES`).
enum AssistantToolKind {
  tasksRead,
  taskCreate,
  taskUpdate,
  taskComplete,
  taskDelete,
  boardsRead,
  boardsWrite,
  calendarRead,
  calendarWrite,
  emailRead,
  emailDraft,
  financeRead,
  financeWrite,
  timeRead,
  timeWrite,
  healthRead,
  healthWrite,
  dayOverview,
  memorySave,
  memoryRead,
  memoryWrite,
  image,
  qrCode,
  webSearch,
  checks,
  file,
  workspace,
  settings,
  openApp,
  view,
  other,
}

const Map<String, AssistantToolKind> _exactKinds = {
  'get_task': AssistantToolKind.tasksRead,
  'search_tasks': AssistantToolKind.tasksRead,
  'get_my_tasks': AssistantToolKind.tasksRead,
  'get_schedulable_tasks': AssistantToolKind.tasksRead,
  'create_task': AssistantToolKind.taskCreate,
  'complete_task': AssistantToolKind.taskComplete,
  'delete_task': AssistantToolKind.taskDelete,
  'list_boards': AssistantToolKind.boardsRead,
  'list_task_lists': AssistantToolKind.boardsRead,
  'list_task_labels': AssistantToolKind.boardsRead,
  'list_projects': AssistantToolKind.boardsRead,
  'get_calendar_connections': AssistantToolKind.calendarRead,
  'get_upcoming_events': AssistantToolKind.calendarRead,
  'check_e2ee_status': AssistantToolKind.calendarRead,
  'preview_calendar_schedule': AssistantToolKind.calendarRead,
  'list_recent_emails': AssistantToolKind.emailRead,
  'get_email_thread': AssistantToolKind.emailRead,
  'draft_email_reply': AssistantToolKind.emailDraft,
  'get_spending_summary': AssistantToolKind.financeRead,
  'get_body_weight_history': AssistantToolKind.healthRead,
  'list_habit_trackers': AssistantToolKind.healthRead,
  'log_body_weight': AssistantToolKind.healthWrite,
  'log_habit_entry': AssistantToolKind.healthWrite,
  'get_day_overview': AssistantToolKind.dayOverview,
  'remember': AssistantToolKind.memorySave,
  'recall': AssistantToolKind.memoryRead,
  'list_memories': AssistantToolKind.memoryRead,
  'delete_memory': AssistantToolKind.memoryWrite,
  'merge_memories': AssistantToolKind.memoryWrite,
  'create_image': AssistantToolKind.image,
  'create_qr_code': AssistantToolKind.qrCode,
  'google_search': AssistantToolKind.webSearch,
  'run_parallel_checks': AssistantToolKind.checks,
  'convert_file_to_markdown': AssistantToolKind.file,
  'open_app': AssistantToolKind.openApp,
  'render_ui': AssistantToolKind.view,
  'show_workspace_artifact': AssistantToolKind.view,
};

AssistantToolKind assistantToolKind(String? toolName) {
  final name = toolName ?? '';
  final exact = _exactKinds[name];
  if (exact != null) return exact;
  final reads =
      name.startsWith('list_') ||
      name.startsWith('get_') ||
      name.startsWith('search_') ||
      name.startsWith('read_') ||
      name.startsWith('check_') ||
      name.startsWith('preview_');
  bool has(String fragment) => name.contains(fragment);
  if (has('task_assignee') ||
      has('task_labels') ||
      name.endsWith('task_to_project') ||
      name.endsWith('task_from_project') ||
      name == 'update_task') {
    return AssistantToolKind.taskUpdate;
  }
  if (has('board') || has('task_list') || has('task_label') || has('project')) {
    return reads ? AssistantToolKind.boardsRead : AssistantToolKind.boardsWrite;
  }
  if (has('event') || has('calendar') || has('e2ee')) {
    return reads
        ? AssistantToolKind.calendarRead
        : AssistantToolKind.calendarWrite;
  }
  if (has('wallet') ||
      has('transaction') ||
      has('currency') ||
      has('spending')) {
    return reads
        ? AssistantToolKind.financeRead
        : AssistantToolKind.financeWrite;
  }
  if (has('time_track') || has('timer')) {
    return reads ? AssistantToolKind.timeRead : AssistantToolKind.timeWrite;
  }
  if (has('workspace')) return AssistantToolKind.workspace;
  if (has('settings') ||
      has('theme') ||
      has('sidebar') ||
      has('immersive') ||
      has('user_name')) {
    return AssistantToolKind.settings;
  }
  return AssistantToolKind.other;
}

/// `get_upcoming_events` -> `Get upcoming events` for unmapped tools.
String humanizeAssistantToolName(String toolName) {
  final words = toolName
      .replaceAllMapped(
        RegExp('([a-z0-9])([A-Z])'),
        (match) => '${match[1]} ${match[2]}',
      )
      .split(RegExp(r'[_\-\s.]+'))
      .where((word) => word.isNotEmpty)
      .map((word) => word.toLowerCase())
      .toList(growable: false);
  if (words.isEmpty) return toolName;
  final first = words.first;
  words[0] = '${first[0].toUpperCase()}${first.substring(1)}';
  return words.join(' ');
}

/// The localized step label, in progressive form while the call runs.
String assistantToolStepLabel(
  AppLocalizations l10n,
  String? toolName, {
  required bool running,
}) {
  final r = running;
  return switch (assistantToolKind(toolName)) {
    AssistantToolKind.tasksRead =>
      r
          ? l10n.assistantToolLabelTasksReadRunning
          : l10n.assistantToolLabelTasksRead,
    AssistantToolKind.taskCreate =>
      r
          ? l10n.assistantToolLabelTaskCreateRunning
          : l10n.assistantToolLabelTaskCreate,
    AssistantToolKind.taskUpdate =>
      r
          ? l10n.assistantToolLabelTaskUpdateRunning
          : l10n.assistantToolLabelTaskUpdate,
    AssistantToolKind.taskComplete =>
      r
          ? l10n.assistantToolLabelTaskCompleteRunning
          : l10n.assistantToolLabelTaskComplete,
    AssistantToolKind.taskDelete =>
      r
          ? l10n.assistantToolLabelTaskDeleteRunning
          : l10n.assistantToolLabelTaskDelete,
    AssistantToolKind.boardsRead =>
      r
          ? l10n.assistantToolLabelBoardsReadRunning
          : l10n.assistantToolLabelBoardsRead,
    AssistantToolKind.boardsWrite =>
      r
          ? l10n.assistantToolLabelBoardsWriteRunning
          : l10n.assistantToolLabelBoardsWrite,
    AssistantToolKind.calendarRead =>
      r
          ? l10n.assistantToolLabelCalendarReadRunning
          : l10n.assistantToolLabelCalendarRead,
    AssistantToolKind.calendarWrite =>
      r
          ? l10n.assistantToolLabelCalendarWriteRunning
          : l10n.assistantToolLabelCalendarWrite,
    AssistantToolKind.emailRead =>
      r
          ? l10n.assistantToolLabelEmailReadRunning
          : l10n.assistantToolLabelEmailRead,
    AssistantToolKind.emailDraft =>
      r
          ? l10n.assistantToolLabelEmailDraftRunning
          : l10n.assistantToolLabelEmailDraft,
    AssistantToolKind.financeRead =>
      r
          ? l10n.assistantToolLabelFinanceReadRunning
          : l10n.assistantToolLabelFinanceRead,
    AssistantToolKind.financeWrite =>
      r
          ? l10n.assistantToolLabelFinanceWriteRunning
          : l10n.assistantToolLabelFinanceWrite,
    AssistantToolKind.timeRead =>
      r
          ? l10n.assistantToolLabelTimeReadRunning
          : l10n.assistantToolLabelTimeRead,
    AssistantToolKind.timeWrite =>
      r
          ? l10n.assistantToolLabelTimeWriteRunning
          : l10n.assistantToolLabelTimeWrite,
    AssistantToolKind.healthRead =>
      r
          ? l10n.assistantToolLabelHealthReadRunning
          : l10n.assistantToolLabelHealthRead,
    AssistantToolKind.healthWrite =>
      r
          ? l10n.assistantToolLabelHealthWriteRunning
          : l10n.assistantToolLabelHealthWrite,
    AssistantToolKind.dayOverview =>
      r
          ? l10n.assistantToolLabelDayOverviewRunning
          : l10n.assistantToolLabelDayOverview,
    AssistantToolKind.memorySave =>
      r
          ? l10n.assistantToolLabelMemorySaveRunning
          : l10n.assistantToolLabelMemorySave,
    AssistantToolKind.memoryRead =>
      r
          ? l10n.assistantToolLabelMemoryReadRunning
          : l10n.assistantToolLabelMemoryRead,
    AssistantToolKind.memoryWrite =>
      r
          ? l10n.assistantToolLabelMemoryWriteRunning
          : l10n.assistantToolLabelMemoryWrite,
    AssistantToolKind.image =>
      r ? l10n.assistantToolLabelImageRunning : l10n.assistantToolLabelImage,
    AssistantToolKind.qrCode =>
      r ? l10n.assistantToolLabelQrCodeRunning : l10n.assistantToolLabelQrCode,
    AssistantToolKind.webSearch =>
      r
          ? l10n.assistantToolLabelWebSearchRunning
          : l10n.assistantToolLabelWebSearch,
    AssistantToolKind.checks =>
      r ? l10n.assistantToolLabelChecksRunning : l10n.assistantToolLabelChecks,
    AssistantToolKind.file =>
      r ? l10n.assistantToolLabelFileRunning : l10n.assistantToolLabelFile,
    AssistantToolKind.workspace =>
      r
          ? l10n.assistantToolLabelWorkspaceRunning
          : l10n.assistantToolLabelWorkspace,
    AssistantToolKind.settings =>
      r
          ? l10n.assistantToolLabelSettingsRunning
          : l10n.assistantToolLabelSettings,
    AssistantToolKind.openApp =>
      r
          ? l10n.assistantToolLabelOpenAppRunning
          : l10n.assistantToolLabelOpenApp,
    AssistantToolKind.view =>
      r ? l10n.assistantToolLabelViewRunning : l10n.assistantToolLabelView,
    AssistantToolKind.other =>
      toolName == null || toolName.trim().isEmpty
          ? l10n.assistantToolLabel
          : humanizeAssistantToolName(toolName),
  };
}

IconData assistantToolStepIcon(String? toolName) =>
    switch (assistantToolKind(toolName)) {
      AssistantToolKind.tasksRead ||
      AssistantToolKind.taskUpdate => LucideIcons.listTodo,
      AssistantToolKind.taskCreate => LucideIcons.listPlus,
      AssistantToolKind.taskComplete => LucideIcons.circleCheck,
      AssistantToolKind.taskDelete ||
      AssistantToolKind.memoryWrite => LucideIcons.trash2,
      AssistantToolKind.boardsRead ||
      AssistantToolKind.boardsWrite => LucideIcons.kanban,
      AssistantToolKind.calendarRead ||
      AssistantToolKind.calendarWrite => LucideIcons.calendar,
      AssistantToolKind.emailRead ||
      AssistantToolKind.emailDraft => LucideIcons.mail,
      AssistantToolKind.financeRead ||
      AssistantToolKind.financeWrite => LucideIcons.wallet,
      AssistantToolKind.timeRead ||
      AssistantToolKind.timeWrite => LucideIcons.timer,
      AssistantToolKind.healthRead ||
      AssistantToolKind.healthWrite => LucideIcons.activity,
      AssistantToolKind.dayOverview => LucideIcons.sun,
      AssistantToolKind.memorySave ||
      AssistantToolKind.memoryRead => LucideIcons.brain,
      AssistantToolKind.image => LucideIcons.image,
      AssistantToolKind.qrCode => LucideIcons.qrCode,
      AssistantToolKind.webSearch => LucideIcons.globe,
      AssistantToolKind.checks => LucideIcons.listChecks,
      AssistantToolKind.file => LucideIcons.fileText,
      AssistantToolKind.workspace => LucideIcons.building2,
      AssistantToolKind.settings => LucideIcons.settings,
      AssistantToolKind.openApp => LucideIcons.appWindow,
      AssistantToolKind.view => LucideIcons.layoutDashboard,
      AssistantToolKind.other => LucideIcons.wrench,
    };
