import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_html.dart';

/// Draws a sandboxed mockup document. [interactive] enables scrolling and
/// pinch-zoom; otherwise it is a still thumbnail.
typedef FleetMockupWebView =
    Widget Function(
      BuildContext context,
      String html, {
      required bool interactive,
    });

/// The native mockup view: JavaScript off (so neither page scripts nor the
/// plugin's script bridge run), private browsing, no file or content
/// access (file-URL access, script-opened windows and multiple windows stay
/// at their off defaults), every permission denied, and main-frame
/// navigation limited to the document itself, and no network loads. The
/// document carries [fleetMockupCsp].
Widget fleetMockupWebView(
  BuildContext context,
  String html, {
  required bool interactive,
}) {
  final view = InAppWebView(
    gestureRecognizers: interactive
        ? const {
            Factory<OneSequenceGestureRecognizer>(EagerGestureRecognizer.new),
          }
        : const {},
    initialSettings: InAppWebViewSettings(
      javaScriptEnabled: false,
      incognito: true,
      cacheEnabled: false,
      clearCache: true,
      thirdPartyCookiesEnabled: false,
      allowFileAccess: false,
      allowContentAccess: false,
      // Android refuses every network load outright; the policy above
      // already does on both platforms.
      blockNetworkLoads: true,
      geolocationEnabled: false,
      useShouldOverrideUrlLoading: true,
      supportZoom: interactive,
      builtInZoomControls: interactive,
      ignoresViewportScaleLimits: interactive,
      disableContextMenu: !interactive,
    ),
    initialData: InAppWebViewInitialData(
      data: fleetSandboxMockup(html),
      baseUrl: WebUri('about:blank'),
    ),
    shouldOverrideUrlLoading: (_, action) async =>
        fleetMockupNavigationAllowed(action.request.url)
        ? NavigationActionPolicy.ALLOW
        : NavigationActionPolicy.CANCEL,
    onCreateWindow: (_, _) async => false,
    // The default response denies every requested resource.
    onPermissionRequest: (_, request) async =>
        PermissionResponse(resources: request.resources),
  );
  return interactive ? view : IgnorePointer(child: view);
}
