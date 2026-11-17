import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/settings_dock_search.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

void main() {
  testWidgets('published settings close clears query and dismisses keyboard', (
    tester,
  ) async {
    final chrome = ShellChromeActionsCubit();
    final controller = TextEditingController(text: 'timezone');
    final focus = FocusNode();
    addTearDown(chrome.close);
    addTearDown(controller.dispose);
    addTearDown(focus.dispose);
    final queries = <String>[];
    var active = true;
    await tester.pumpWidget(
      BlocProvider.value(
        value: chrome,
        child: MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => Column(
                children: [
                  TextField(controller: controller, focusNode: focus),
                  SettingsDockSearch(
                    ownerId: 'settings-test',
                    location: '/settings',
                    controller: controller,
                    hint: 'Search settings',
                    active: active,
                    onActiveChanged: (value) => setState(() => active = value),
                    onChanged: queries.add,
                    fallback: const Text('Fallback search'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    ShellActionSpec action() =>
        chrome.state.resolveForLocation('/settings').single;
    focus.requestFocus();
    await tester.pump();
    expect(focus.hasFocus, isTrue);
    expect(action().searchController, same(controller));
    expect(action().keepVisibleWithKeyboard, isFalse);
    expect(find.text('Fallback search'), findsNothing);

    action().onCloseSearch!();
    await tester.pumpAndSettle();
    expect(controller.text, isEmpty);
    expect(queries, ['']);
    expect(active, isFalse);
    expect(focus.hasFocus, isFalse);
    expect(action().searchController, isNull);
    expect(action().keepVisibleWithKeyboard, isFalse);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(chrome.state.resolveForLocation('/settings'), isEmpty);
    expect(tester.takeException(), isNull);
  });
}
