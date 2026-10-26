import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

Future<void> _pump(WidgetTester tester, Widget child) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: child),
    ),
  );
  await tester.pump();
}

Size _markSize(WidgetTester tester, AppLoadingSize size) => tester.getSize(
  find
      .descendant(
        of: find.byKey(ValueKey('app-loading-${size.name}')),
        matching: find.byType(SizedBox),
      )
      .first,
);

void main() {
  test('sizes step up from inline to page', () {
    expect(AppLoadingSize.inline.dimension, 20);
    expect(AppLoadingSize.section.dimension, 32);
    expect(AppLoadingSize.page.dimension, 56);
  });

  testWidgets('page loader centres a full-size mark on a full screen', (
    tester,
  ) async {
    await _pump(tester, const AppLoadingIndicator.page());
    expect(_markSize(tester, AppLoadingSize.page), const Size.square(56));
    final center = tester.getCenter(
      find.byKey(const ValueKey('app-loading-page')),
    );
    final body = tester.getRect(find.byType(Scaffold));
    expect(center.dx, closeTo(body.center.dx, 0.5));
    expect(center.dy, closeTo(body.center.dy, 0.5));
    expect(find.bySemanticsLabel('Loading'), findsOneWidget);
  });

  testWidgets('section and inline loaders stay compact', (tester) async {
    await _pump(
      tester,
      const Column(
        children: [
          AppLoadingIndicator(),
          SizedBox.square(dimension: 44, child: AppLoadingIndicator.inline()),
        ],
      ),
    );
    expect(_markSize(tester, AppLoadingSize.section), const Size.square(32));
    expect(_markSize(tester, AppLoadingSize.inline), const Size.square(20));
  });

  testWidgets('page loader hugs its mark inside a scroll view', (tester) async {
    await _pump(tester, ListView(children: const [AppLoadingIndicator.page()]));
    expect(tester.takeException(), isNull);
    expect(_markSize(tester, AppLoadingSize.page), const Size.square(56));
    expect(find.byType(NovaLoadingIndicator), findsOneWidget);
  });

  testWidgets('a custom label replaces the default announcement', (
    tester,
  ) async {
    await _pump(
      tester,
      const AppLoadingIndicator.page(semanticLabel: 'Checking version'),
    );
    expect(find.bySemanticsLabel('Checking version'), findsOneWidget);
  });
}
