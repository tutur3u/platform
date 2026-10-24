import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

/// Location the harness page registers its chrome action for.
const sheetHostPage = '/page';

/// A page on a nested navigator, as in the shell, with its own chrome action.
class _Page extends StatelessWidget {
  const _Page({required this.open});

  final void Function(BuildContext context) open;

  @override
  Widget build(BuildContext context) => Center(
    child: TextButton(
      onPressed: () => open(context),
      child: const Text('Open'),
    ),
  );
}

/// Pumps a page on a nested navigator, as in the shell, with a chrome
/// registry; [open] runs when the page's Open button is tapped.
Future<ShellChromeActionsCubit> pumpSheetHost(
  WidgetTester tester,
  void Function(BuildContext context) open,
) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final chrome = ShellChromeActionsCubit()
    ..register(
      registrationId: 'page',
      ownerId: 'page',
      locations: const {sheetHostPage},
      actions: [
        ShellActionSpec(id: 'page-add', icon: Icons.add, onPressed: () {}),
      ],
    );
  addTearDown(chrome.close);
  await tester.pumpWidget(
    BlocProvider.value(
      value: chrome,
      child: MaterialApp(
        theme: AppTheme.light,
        home: Navigator(
          onGenerateRoute: (_) =>
              MaterialPageRoute<void>(builder: (_) => _Page(open: open)),
        ),
      ),
    ),
  );
  return chrome;
}
