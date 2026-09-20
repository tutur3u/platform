import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../helpers/helpers.dart';

void main() {
  testWidgets('canceled pull removes Nova without refreshing', (tester) async {
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator(
        onRefresh: () async {
          calls++;
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 900)],
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, 45));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.byType(NovaLoadingIndicator), findsNothing);
  });

  testWidgets('pull refresh shows Nova only during the refresh lifecycle', (
    tester,
  ) async {
    final complete = Completer<void>();
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator(
        onRefresh: () {
          calls++;
          return complete.future;
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 900, child: Text('Content'))],
        ),
      ),
    );
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(calls, 1);
    expect(find.byType(NovaLoadingIndicator), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    complete.complete();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    expect(find.text('Content'), findsOneWidget);
  });
}
