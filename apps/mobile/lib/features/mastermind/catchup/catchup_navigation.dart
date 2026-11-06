import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:url_launcher/url_launcher.dart';

typedef CatchupLinkLauncher = Future<bool> Function(Uri uri);

Future<bool> launchInSystemBrowser(Uri uri) =>
    launchUrl(uri, mode: LaunchMode.externalApplication);

/// A row opens something only when it has a Mastermind entity or a link that
/// already passed the host allowlist. A neutral line never does.
bool catchupItemIsTappable(CatchupItem item) =>
    !item.neutral && (item.entity != null || item.link != null);

/// Entity first (in-app), otherwise the link in the system browser.
void openCatchupItem(
  BuildContext context,
  CatchupItem item, {
  CatchupLinkLauncher launch = launchInSystemBrowser,
}) {
  if (!catchupItemIsTappable(item)) return;
  final router = GoRouter.of(context);
  if (item.entity case final entity?) {
    switch (entity.kind) {
      case CatchupEntityKind.ask:
        unawaited(router.push<void>(Routes.mastermindInboxItemPath(entity.id)));
      case CatchupEntityKind.lane:
        unawaited(router.push<void>(Routes.mastermindWorkLanePath(entity.id)));
      case CatchupEntityKind.env || CatchupEntityKind.release:
        router.go(Routes.mastermindShip);
      case CatchupEntityKind.usage:
        router.go(Routes.mastermindInsights);
    }
    return;
  }
  if (item.link case final link?) unawaited(launch(link.uri));
}
