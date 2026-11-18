import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';

import '../../../helpers/helpers.dart';

class _FakeFinanceRepository extends FinanceRepository {}

void main() {
  testWidgets('wallet dialog stays scrollable on compact screens', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpApp(
      Scaffold(
        body: WalletDialog(wsId: 'ws_1', repository: _FakeFinanceRepository()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create wallet'), findsWidgets);
    expect(find.byType(ListView), findsWidgets);

    await tester.tap(find.text('Credit'));
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.text('Payment date'),
      find.byType(Scrollable).first,
      const Offset(0, -180),
    );
    await tester.pumpAndSettle();

    expect(find.text('Payment date'), findsOneWidget);
    final limit = find.byWidgetPredicate(
      (widget) =>
          widget is EditableText &&
          widget.keyboardType ==
              const TextInputType.numberWithOptions(decimal: true),
    );
    await tester.ensureVisible(limit);
    expect(tester.widget<EditableText>(limit).obscureText, isTrue);
    await tester.enterText(limit, '250');
    await tester.pump();
    expect(tester.widget<EditableText>(limit).obscureText, isFalse);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pump();
    expect(tester.widget<EditableText>(limit).obscureText, isTrue);
    expect(tester.takeException(), isNull);
  });
}
