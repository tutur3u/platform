import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class TimeTrackerPage extends StatelessWidget {
  const TimeTrackerPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.timerTitle)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '00:00:00',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                fontWeight: FontWeight.w300,
                fontFeatures: [const FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.play_arrow),
              label: Text(l10n.timerStart),
            ),
          ],
        ),
      ),
    );
  }
}
