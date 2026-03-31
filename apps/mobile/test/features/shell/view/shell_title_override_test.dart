import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/shell/view/shell_top_bar_title.dart';

import '../../../helpers/helpers.dart';

class _ShellTitleOverrideHarness extends StatelessWidget {
  const _ShellTitleOverrideHarness();

  @override
  Widget build(BuildContext context) {
    return const Material(
      child: Column(
        children: [
          ShellTopBarTitle(matchedLocation: '/tasks/boards/board-1'),
          ShellTitleOverride(
            ownerId: 'board-title',
            locations: {'/tasks/boards/board-1'},
            title: 'Board Alpha',
          ),
        ],
      ),
    );
  }
}

void main() {
  group('ShellTitleOverride', () {
    testWidgets('prefers injected board title for the current route', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellTitleOverrideCubit(),
          child: const _ShellTitleOverrideHarness(),
        ),
      );
      await tester.pump();

      expect(find.text('Board Alpha'), findsOneWidget);
    });
  });
}
