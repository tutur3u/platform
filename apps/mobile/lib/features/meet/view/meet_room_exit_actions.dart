import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

enum MeetExitChoice { leave, end }

Future<MeetExitChoice?> showMeetExitChoice(BuildContext context) =>
    showAdaptiveSheet<MeetExitChoice>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                sheetContext.l10n.meetLeaveOrEnd,
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.logout),
                title: Text(sheetContext.l10n.meetLeave),
                onTap: () => Navigator.pop(sheetContext, MeetExitChoice.leave),
              ),
              ListTile(
                leading: const Icon(Icons.call_end),
                title: Text(sheetContext.l10n.meetEndForEveryone),
                onTap: () => Navigator.pop(sheetContext, MeetExitChoice.end),
              ),
            ],
          ),
        ),
      ),
    );

class MeetHostActionsMenu extends StatelessWidget {
  const MeetHostActionsMenu({
    required this.onLeaveOrEnd,
    required this.onCosts,
    required this.onSettings,
    super.key,
  });

  final VoidCallback onLeaveOrEnd;
  final VoidCallback onCosts;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopupMenuButton<String>(
      onSelected: (action) {
        if (action == 'end') onLeaveOrEnd();
        if (action == 'costs') onCosts();
        if (action == 'settings') onSettings();
      },
      itemBuilder: (_) => [
        PopupMenuItem(
          value: 'settings',
          child: Row(
            children: [
              const Icon(Icons.tune_outlined),
              const SizedBox(width: 10),
              Text(l10n.meetSettings),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'costs',
          child: Row(
            children: [
              const Icon(Icons.paid_outlined),
              const SizedBox(width: 10),
              Text(l10n.meetEstimatedCosts),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'end',
          child: Row(
            children: [
              const Icon(Icons.call_end),
              const SizedBox(width: 10),
              Text(l10n.meetEndForEveryone),
            ],
          ),
        ),
      ],
    );
  }
}
