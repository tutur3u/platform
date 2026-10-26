import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// The trailing Search action of the root tabs that have no search of
/// their own (Home, Inbox and You). It opens Apps with its existing search
/// field focused. Apps keeps its own search action, and Mira's dock belongs
/// to the composer.
class ShellRootSearchAction extends StatelessWidget {
  const ShellRootSearchAction({super.key});

  static const Set<String> locations = {
    Routes.home,
    Routes.notifications,
    Routes.notificationsArchive,
    Routes.profileRoot,
  };

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'shell-root-search',
    locations: locations,
    actions: [
      ShellActionSpec(
        id: 'shell-root-search',
        icon: AppIcons.search,
        tooltip: context.l10n.commonSearch,
        inDock: true,
        onPressed: () => unawaited(_open(context)),
      ),
    ],
  );

  Future<void> _open(BuildContext context) async {
    await context.read<AppTabCubit>().openWithSearch();
    if (context.mounted) context.go(Routes.apps);
  }
}
