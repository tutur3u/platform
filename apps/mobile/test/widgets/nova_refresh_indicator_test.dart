import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../helpers/helpers.dart';

void main() {
  testWidgets('short page inherits scroll physics and refreshes', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator(
        onRefresh: () async {
          calls++;
        },
        child: const AppPageListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [Text('Short page')],
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 1);
  });

  testWidgets('error state remains refreshable across the viewport', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator.state(
        onRefresh: () async {
          calls++;
        },
        child: const AppPageBody(child: Center(child: Text('Retry'))),
      ),
    );
    await tester.drag(find.byType(SingleChildScrollView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 1);
  });

  testWidgets('refresh affordance clears the real floating header', (
    tester,
  ) async {
    final completed = Completer<void>();
    await tester.pumpApp(
      FloatingShellDock(
        location: '/refresh',
        scrollableHeader: true,
        bottomInset: 0,
        navigation: const SizedBox.shrink(),
        header: const SizedBox(key: ValueKey('refresh-header'), height: 56),
        child: NovaRefreshIndicator(
          onRefresh: () => completed.future,
          child: const AppPageListView(
            physics: AlwaysScrollableScrollPhysics(),
            children: [Text('Short page')],
          ),
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, 450));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(NovaLoadingIndicator), findsOneWidget);
    final indicatorContext = tester.element(find.byType(NovaRefreshIndicator));
    final position = tester.widget<Positioned>(
      find
          .ancestor(
            of: find.byType(NovaLoadingIndicator),
            matching: find.byType(Positioned),
          )
          .first,
    );
    expect(position.top, 12 + floatingShellHeaderInset(indicatorContext));
    completed.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('fixed detail header adds no second offset', (tester) async {
    final completed = Completer<void>();
    await tester.pumpApp(
      FloatingShellDock(
        location: '/tasks/board/detail',
        bottomInset: 0,
        header: const SizedBox(height: 56),
        navigation: const SizedBox.shrink(),
        child: NovaRefreshIndicator(
          onRefresh: () => completed.future,
          child: const AppPageListView(
            physics: AlwaysScrollableScrollPhysics(),
            children: [Text('Detail')],
          ),
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, 450));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    final position = tester.widget<Positioned>(
      find
          .ancestor(
            of: find.byType(NovaLoadingIndicator),
            matching: find.byType(Positioned),
          )
          .first,
    );
    expect(position.top, 12);
    completed.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('month parent refreshes while grid physics stay disabled', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator(
        onRefresh: () async {
          calls++;
        },
        child: RefreshCanvas(
          child: MonthView(
            selectedDate: DateTime(2026, 10, 27),
            focusedMonth: DateTime(2026, 10),
            events: const [],
            onDaySelected: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<GridView>(find.byType(GridView)).physics,
      isA<NeverScrollableScrollPhysics>(),
    );
    final origin = tester.getTopLeft(find.byType(GridView));
    await tester.drag(find.byType(GridView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(tester.getTopLeft(find.byType(GridView)), origin);
  });

  testWidgets('sheet refresh receives its contained scroll notifications', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      Scaffold(
        body: AppSheetScaffold(
          title: 'History',
          onRefresh: () async {
            calls++;
          },
          slivers: const [
            SliverToBoxAdapter(
              child: SizedBox(height: 100, child: Text('Item')),
            ),
          ],
        ),
      ),
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 1);
  });

  testWidgets('tight shrink-wrapped sheet refreshes', (tester) async {
    var calls = 0;
    await tester.pumpApp(
      Center(
        child: SizedBox(
          height: 220,
          child: AppSheetScaffold(
            title: 'Compact',
            onRefresh: () async {
              calls++;
            },
            child: const Text('Empty'),
          ),
        ),
      ),
    );
    expect(
      tester.widget<CustomScrollView>(find.byType(CustomScrollView)).shrinkWrap,
      isTrue,
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, 450));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('RefreshCanvas accepts unbounded height', (tester) async {
    await tester.pumpApp(
      const SingleChildScrollView(
        child: RefreshCanvas(
          child: SizedBox(height: 80, child: Text('Canvas')),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('ordinary upward drag at top never shows refresh', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpApp(
      NovaRefreshIndicator(
        onRefresh: () async {
          calls++;
        },
        child: ListView(
          physics: const BouncingScrollPhysics(),
          children: const [SizedBox(height: 2000)],
        ),
      ),
    );
    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(ListView)),
    );
    await gesture.moveBy(const Offset(0, -70));
    await tester.pump();
    expect(find.byType(NovaLoadingIndicator), findsNothing);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(calls, 0);
  });

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
