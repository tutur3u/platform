import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/projects/projects_location.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Inbox navbar action that opens every thread on Projects. Mount it
/// anywhere in the Inbox page.
class ProjectsInboxAction extends StatelessWidget {
  const ProjectsInboxAction({super.key});

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'mastermind-projects-entry',
    locations: const {Routes.mastermindInbox},
    actions: [
      ShellActionSpec(
        id: 'mastermind-all-threads',
        icon: LucideIcons.folder,
        tooltip: context.l10n.mastermindProjectsAllThreads,
        onPressed: () => context.go(projectsLocation()),
      ),
    ],
  );
}
