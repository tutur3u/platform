import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/view/detail/fleet_decision_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:mobile/l10n/l10n.dart';

import 'design_render_harness.dart';
import 'mastermind_view_harness.dart';

/// Stands in for the platform WebView, which widget tests cannot host.
Widget fakeMockupWebView(
  BuildContext context,
  String html, {
  required bool interactive,
}) => Text('mockup ${interactive ? 'live' : 'still'} ${html.length}');

/// Pumps the fleet Inbox and decision routes in the Sorbet [theme], starting
/// at [initial], and returns the router.
Future<GoRouter> pumpFleetRoutes(
  WidgetTester tester,
  MastermindViewHarness harness, {
  String initial = Routes.mastermindInbox,
  DateTime Function()? now,
  FleetReviewAssetLoader? assets,
  MobileLinkLaunch? launch,
  bool secretCardsReady = fleetSecretCardsReady,
  Future<void> Function(BuildContext, FleetDecision)? openSecret,
  String theme = 'light',
  Size? size,
  double textScale = 1,
  Locale? locale,
}) async {
  if (size == null) {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  } else {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      GoRoute(
        path: Routes.mastermindInbox,
        builder: (_, _) => FleetInboxPage(
          now: now,
          secretCardsReady: secretCardsReady,
          openSecret: openSecret,
        ),
      ),
      GoRoute(
        path: Routes.mastermindFleetDecision,
        builder: (_, state) => FleetDecisionPage(
          key: ValueKey(state.uri.toString()),
          decisionId: state.pathParameters['decisionId'] ?? '',
          now: now,
          reviewAssets: assets,
          launch: launch,
          webView: fakeMockupWebView,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  final (settings, brightness) = DesignRender.themes[theme]!;
  final themeData = AppearanceTheme.materialTheme(settings, brightness);
  final background =
      (themeData.extension<AppColorTokens>() ??
              AppColorTokens.fallback(brightness))
          .background;
  await tester.pumpWidget(
    harness.wrap(
      MaterialApp.router(
        theme: themeData,
        locale: locale,
        debugShowCheckedModeBanner: false,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: ColoredBox(
            color: background,
            child: Material(type: MaterialType.transparency, child: child),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return router;
}

/// The page's main vertical scrollable.
Finder fleetPageScrollable() => find
    .byWidgetPredicate(
      (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
    )
    .first;
