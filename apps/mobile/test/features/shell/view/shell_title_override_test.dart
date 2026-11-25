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

    testWidgets('leaving an edited title saves it instead of discarding', (
      tester,
    ) async {
      final saved = <String>[];
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellTitleOverrideCubit(),
          child: Material(
            child: Column(
              children: [
                const ShellTopBarTitle(matchedLocation: '/documents/doc-1'),
                ShellTitleOverride(
                  ownerId: 'doc-title',
                  locations: const {'/documents/doc-1'},
                  title: 'Draft',
                  showLeadingBrand: false,
                  onTitleSubmitted: (title) async => saved.add(title),
                ),
                const TextField(key: ValueKey('elsewhere')),
              ],
            ),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Draft'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Quarterly plan');
      await tester.tap(find.byKey(const ValueKey('elsewhere')));
      await tester.pumpAndSettle();

      expect(saved, ['Quarterly plan']);
    });
  });
}
