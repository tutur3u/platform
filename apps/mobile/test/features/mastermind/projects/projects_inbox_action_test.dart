import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/projects/view/projects_inbox_action.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('the Inbox All threads action opens Projects', (tester) async {
    final actions = ShellChromeActionsCubit();
    addTearDown(actions.close);
    final router = GoRouter(
      initialLocation: Routes.mastermindInbox,
      routes: [
        GoRoute(
          path: Routes.mastermindInbox,
          builder: (context, state) => const ProjectsInboxAction(),
        ),
        GoRoute(
          path: Routes.mastermindWork,
          builder: (context, state) => const SizedBox(),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => BlocProvider.value(value: actions, child: app),
    );
    await tester.pumpAndSettle();

    final action = actions.state
        .resolveForLocation(Routes.mastermindInbox)
        .singleWhere((a) => a.id == 'mastermind-all-threads');
    expect(action.tooltip, 'All threads');
    action.onPressed!();
    await tester.pumpAndSettle();
    expect(
      router.routerDelegate.currentConfiguration.uri.path,
      Routes.mastermindWork,
    );
  });
}
