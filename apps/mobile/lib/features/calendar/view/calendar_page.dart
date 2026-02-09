import 'package:flutter/material.dart' hide Scaffold, AppBar;
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(title: Text(l10n.calendarTitle)),
      ],
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.calendar_today,
              size: 48,
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
            const shad.Gap(16),
            Text(
              l10n.calendarEmpty,
              style: shad.Theme.of(context).typography.p,
            ),
          ],
        ),
      ),
    );
  }
}

