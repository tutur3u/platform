import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/offline_search_chrome.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

void main() {
  testWidgets('offline route exposes search through its floating dock action', (
    tester,
  ) async {
    final chrome = ShellChromeActionsCubit();
    final controller = TextEditingController();
    final queries = <String>[];
    addTearDown(chrome.close);
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      BlocProvider.value(
        value: chrome,
        child: MaterialApp(
          home: OfflineSearchChrome(
            moduleId: 'inventory',
            controller: controller,
            hint: 'Search stored data',
            onChanged: queries.add,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    const location = '/settings/offline/inventory';
    ShellActionSpec action() =>
        chrome.state.resolveForLocation(location).single;
    expect(find.byType(AppSearchField), findsNothing);
    expect(chrome.state.resolveForLocation('/settings'), isEmpty);
    expect(action().inDock, isTrue);
    expect(action().searchController, isNull);
    action().onPressed!();
    await tester.pumpAndSettle();
    expect(action().searchController, same(controller));
    controller.text = 'product';
    action().onSearchChanged!('product');
    expect(queries, ['product']);
    action().onCloseSearch!();
    await tester.pumpAndSettle();
    expect(controller.text, isEmpty);
    expect(queries, ['product', '']);
    expect(action().searchController, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(chrome.state.resolveForLocation(location), isEmpty);
    expect(tester.takeException(), isNull);
  });
}
