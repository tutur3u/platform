import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/dashboard/view/personal_agenda.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// Home's Agenda owns a personal scope, independent of the global workspace.
class HomePage extends StatefulWidget {
  const HomePage({this.replayToken = 0, super.key});
  final int replayToken;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _agenda = false;
  bool _agendaVisited = false;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Offstage(
        offstage: _agenda,
        child: TickerMode(
          enabled: !_agenda,
          child: DashboardPage(
            replayToken: widget.replayToken,
            active: !_agenda,
          ),
        ),
      ),
      if (_agendaVisited)
        Offstage(
          offstage: !_agenda,
          child: TickerMode(
            enabled: _agenda,
            child: PersonalAgenda(replayToken: widget.replayToken),
          ),
        ),
      ShellTitleOverride(
        ownerId: 'home-views',
        locations: const {Routes.home},
        title: _agenda ? context.l10n.homePersonalAgenda : context.l10n.navHome,
      ),
      ShellChromeActions(
        ownerId: 'home-views',
        locations: const {Routes.home},
        onResetSection: () => setState(() => _agenda = false),
        actions: [
          ShellActionSpec(
            id: 'home-view-home',
            segmentGroup: 'home-views',
            icon: Icons.home_outlined,
            tooltip: context.l10n.navHome,
            highlighted: !_agenda,
            callbackToken: _agenda,
            onPressed: () => setState(() => _agenda = false),
          ),
          ShellActionSpec(
            id: 'home-view-agenda',
            segmentGroup: 'home-views',
            icon: Icons.calendar_month_outlined,
            tooltip: context.l10n.homePersonalAgenda,
            highlighted: _agenda,
            callbackToken: _agenda,
            onPressed: () => setState(() {
              _agendaVisited = true;
              _agenda = true;
            }),
          ),
        ],
      ),
    ],
  );
}
