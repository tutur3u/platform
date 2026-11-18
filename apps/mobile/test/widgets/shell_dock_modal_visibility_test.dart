import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

const _page = '/page';
const _safeBottom = 34.0;
const _dockInset = 68.0;

/// The shell's arrangement: a nested navigator under the floating dock, with
/// a chrome registry and a bottom safe area.
Future<ShellChromeActionsCubit> _pumpShell(
  WidgetTester tester,
  void Function(BuildContext context) open, {
  bool dockPageAction = true,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1
    ..padding = const FakeViewPadding(bottom: _safeBottom)
    ..viewPadding = const FakeViewPadding(bottom: _safeBottom);
  addTearDown(tester.view.reset);
  final chrome = ShellChromeActionsCubit();
  addTearDown(chrome.close);
  await tester.pumpWidget(
    BlocProvider.value(
      value: chrome,
      child: MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: FloatingShellDock(
            location: _page,
            bottomInset: _dockInset,
            dockPageAction: dockPageAction,
            navigation: const SizedBox(
              key: Key('navigation'),
              width: 160,
              height: 52,
            ),
            child: Navigator(
              onGenerateRoute: (_) => MaterialPageRoute<void>(
                builder: (context) => Center(
                  child: TextButton(
                    onPressed: () => open(context),
                    child: const Text('Open'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return chrome;
}

double _dockOpacity(WidgetTester tester) => tester
    .widget<AnimatedOpacity>(
      find.byKey(const ValueKey('floating-shell-dock-opacity')),
    )
    .opacity;

class _PaddingProbe extends StatelessWidget {
  const _PaddingProbe(this.onPadding);

  final ValueChanged<double> onPadding;

  @override
  Widget build(BuildContext context) {
    onPadding(MediaQuery.paddingOf(context).bottom);
    return const Text('Body');
  }
}

void main() {
  testWidgets('a sheet hides the dock and pads only for the safe area', (
    tester,
  ) async {
    double? sheetBottom;
    final chrome = await _pumpShell(tester, (context) {
      unawaited(
        showAppSheet<void>(
          context: context,
          builder: (_) => _PaddingProbe((value) => sheetBottom = value),
        ),
      );
    });
    expect(_dockOpacity(tester), 1);

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(chrome.state.modalHidesDock, isTrue);
    expect(_dockOpacity(tester), 0);
    expect(sheetBottom, _safeBottom);

    await tester.tapAt(const Offset(195, 40));
    await tester.pumpAndSettle();
    expect(find.text('Body'), findsNothing);
    expect(chrome.state.modalHidesDock, isFalse);
    expect(_dockOpacity(tester), 1);
  });

  testWidgets('the dock starts returning as soon as the sheet closes', (
    tester,
  ) async {
    late BuildContext sheetContext;
    await _pumpShell(tester, (context) {
      unawaited(
        showAppSheet<void>(
          context: context,
          builder: (context) {
            sheetContext = context;
            return const Text('Body');
          },
        ),
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(_dockOpacity(tester), 0);

    Navigator.of(sheetContext).pop();
    await tester.pump();
    // Mid-exit: the sheet is still on screen while the dock comes back.
    expect(find.text('Body'), findsOneWidget);
    expect(_dockOpacity(tester), 1);
    await tester.pumpAndSettle();
  });

  testWidgets('a dialog hides the dock until it closes', (tester) async {
    late BuildContext dialogContext;
    await _pumpShell(tester, (context) {
      unawaited(
        showAppDialog<void>(
          context: context,
          builder: (context) {
            dialogContext = context;
            return const AppDialog(title: 'Confirm');
          },
        ),
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(_dockOpacity(tester), 0);

    Navigator.of(dialogContext).pop();
    await tester.pumpAndSettle();
    expect(_dockOpacity(tester), 1);
  });

  testWidgets('a sheet keeps its Search action in the dock on narrow pages', (
    tester,
  ) async {
    final query = TextEditingController();
    addTearDown(query.dispose);
    double? sheetBottom;
    final chrome = await _pumpShell(tester, (context) {
      unawaited(
        showAppSheet<void>(
          context: context,
          builder: (_) => AppSheetScaffold(
            title: 'Pick',
            search: AppSheetSearch(
              controller: query,
              hint: 'Search picks',
              onChanged: (_) {},
            ),
            child: _PaddingProbe((value) => sheetBottom = value),
          ),
        ),
      );
    }, dockPageAction: false);
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(chrome.state.modalHidesDock, isFalse);
    expect(chrome.state.registrations.keys, contains(endsWith('/search')));
    expect(_dockOpacity(tester), 1);
    expect(sheetBottom, greaterThan(_safeBottom));
    expect(find.byTooltip('Search picks').hitTestable(), findsOneWidget);
    await tester.tap(find.byTooltip('Search picks'));
    await tester.pumpAndSettle();
    expect(
      chrome.state.resolveForLocation(_page).single.searchController,
      same(query),
    );
  });

  test('search keeps the dock above the keyboard unless told not to', () {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    ShellActionSpec search({required bool active, bool? keep}) => keep == null
        ? ShellActionSpec.search(
            id: 'search',
            active: active,
            tooltip: 'Search',
            onPressed: () {},
            controller: controller,
            searchHint: 'Search',
            onCloseSearch: () {},
          )
        : ShellActionSpec.search(
            id: 'search',
            active: active,
            tooltip: 'Search',
            onPressed: () {},
            controller: controller,
            searchHint: 'Search',
            onCloseSearch: () {},
            keepVisibleWithKeyboard: keep,
          );
    expect(search(active: true).keepVisibleWithKeyboard, isTrue);
    expect(search(active: false).keepVisibleWithKeyboard, isFalse);
    expect(search(active: true, keep: false).keepVisibleWithKeyboard, isFalse);
  });
}
