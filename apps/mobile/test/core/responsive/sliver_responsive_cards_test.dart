import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/sliver_responsive_cards.dart';

void main() {
  for (final size in [const Size(1032, 1376), const Size(1376, 1032)]) {
    testWidgets('dashboard cards flow without empty rows at $size', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: CustomScrollView(
            slivers: [
              SliverResponsiveCards(
                maxColumns: 2,
                leading: SizedBox(key: ValueKey('workspace'), height: 48),
                children: [
                  SizedBox(key: ValueKey('summary'), height: 100),
                  SizedBox(key: ValueKey('tasks'), height: 300),
                  SizedBox(key: ValueKey('events'), height: 100),
                ],
              ),
            ],
          ),
        ),
      );
      final workspace = tester.getRect(find.byKey(const ValueKey('workspace')));
      final summary = tester.getRect(find.byKey(const ValueKey('summary')));
      final events = tester.getRect(find.byKey(const ValueKey('events')));
      expect(workspace.width, size.width);
      expect(summary.top, workspace.bottom + 14);
      expect(events.top, summary.bottom + 14);
      expect(tester.takeException(), isNull);
    });
  }
}
