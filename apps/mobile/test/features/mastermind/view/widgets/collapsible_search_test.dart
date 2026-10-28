import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/view/widgets/collapsible_search.dart';

import '../../../../helpers/helpers.dart';

Future<(MastermindSearchController, List<String>)> _pump(
  WidgetTester tester,
) async {
  final controller = MastermindSearchController();
  addTearDown(controller.dispose);
  final queries = <String>[];
  await tester.pumpApp(
    MastermindPullToSearch(
      controller: controller,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindCollapsibleSearch(
              controller: controller,
              placeholder: 'Search lanes',
              onChanged: queries.add,
            ),
          ),
          SliverList.list(
            children: [
              for (var i = 0; i < 30; i++)
                SizedBox(height: 56, child: Text('Row $i')),
            ],
          ),
        ],
      ),
    ),
  );
  return (controller, queries);
}

void main() {
  testWidgets('is hidden until asked for', (tester) async {
    await _pump(tester);
    expect(find.byType(AppSearchField), findsNothing);
    // The list starts at the top, not below an empty field.
    expect(tester.getTopLeft(find.text('Row 0')).dy, lessThan(80));
  });

  testWidgets('the navbar icon opens it focused and closes it cleared', (
    tester,
  ) async {
    final (controller, queries) = await _pump(tester);
    var spec = controller.searchActionSpec(id: 'search', tooltip: 'Search');
    expect(spec.icon, AppIcons.search);
    expect(spec.highlighted, isFalse);

    spec.onPressed!();
    await tester.pumpAndSettle();
    expect(find.byType(AppSearchField), findsOneWidget);
    expect(controller.focusNode.hasFocus, isTrue);
    spec = controller.searchActionSpec(id: 'search', tooltip: 'Search');
    expect(spec.icon, AppIcons.close);
    expect(spec.highlighted, isTrue);

    await tester.enterText(find.byType(TextField), 'atlas');
    expect(queries.last, 'atlas');

    spec.onPressed!();
    await tester.pumpAndSettle();
    expect(find.byType(AppSearchField), findsNothing);
    expect(controller.text.text, isEmpty);
    // The list hears that the query was cleared.
    expect(queries.last, '');
  });

  testWidgets('a refresh pull does not reveal search', (tester) async {
    final (controller, _) = await _pump(tester);
    await tester.drag(find.text('Row 0'), const Offset(0, 240));
    await tester.pumpAndSettle();
    expect(controller.expanded, isFalse);
    expect(find.byType(AppSearchField), findsNothing);
    // Revealed by a pull, it does not raise the keyboard on its own.
    expect(controller.focusNode.hasFocus, isFalse);
  });

  testWidgets('scrolling the list down does not reveal it', (tester) async {
    final (controller, _) = await _pump(tester);
    await tester.drag(find.text('Row 3'), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(controller.expanded, isFalse);
  });

  testWidgets('an empty field folds away once it loses focus', (tester) async {
    final (controller, _) = await _pump(tester);
    controller.reveal(focus: true);
    await tester.pumpAndSettle();
    expect(controller.focusNode.hasFocus, isTrue);
    controller.focusNode.unfocus();
    await tester.pumpAndSettle();
    expect(controller.expanded, isFalse);
    expect(find.byType(AppSearchField), findsNothing);
  });

  testWidgets('a field holding a query stays open', (tester) async {
    final (controller, _) = await _pump(tester);
    controller.reveal(focus: true);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'ship');
    controller.focusNode.unfocus();
    await tester.pumpAndSettle();
    expect(controller.expanded, isTrue);
  });
}
