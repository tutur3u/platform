import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/features/auth/widgets/security_check_panel.dart';
import 'package:mobile/features/auth/widgets/security_check_prewarm.dart';

export 'package:mobile/features/auth/widgets/security_check_panel.dart';
export 'package:mobile/features/auth/widgets/security_check_prewarm.dart';

final _activeChecks = Expando<bool>();

/// Gets one Turnstile token for the action that asked, or null.
///
/// 1. A background (invisible) solve runs first, reusing one prewarmed by
///    [SecurityCheckPrewarm.prewarm]. Most people never see a widget.
/// 2. Only when Cloudflare needs interaction, and only if [allowPrompt],
///    a [SecurityCheckPanel] appears in context: a card above the dock on
///    phones, in the bottom corner on wider screens. It never dims the page.
///
/// [modal] (the default, for forms such as sign-in and feedback) keeps the
/// form as submitted while the card is open: the card is a route of its own,
/// so input to the form is blocked, focus stays in the card and Back closes
/// it first. A step-up on an in-app request passes `modal: false`, and the
/// page stays usable around the card.
///
/// Tokens are returned once to the initiating action, never cached past
/// [SecurityCheckPrewarm.lifetime] or reused; the server verifies each one.
Future<String?> showSecurityCheck(
  BuildContext context, {
  bool allowPrompt = true,
  bool modal = true,
}) async {
  if (!Env.isTurnstileConfigured) return null;
  final background = await SecurityCheckPrewarm.background();
  if (background != null || !allowPrompt) return background;
  if (!context.mounted) return null;
  // A form that another page covers by now gets no card over that page.
  if (modal && !(ModalRoute.isCurrentOf(context) ?? true)) return null;
  final navigator = Navigator.of(context, rootNavigator: true);
  if (_activeChecks[navigator] ?? false) return null;
  _activeChecks[navigator] = true;
  try {
    return await showSecurityCheckPanel(navigator, modal: modal);
  } finally {
    _activeChecks[navigator] = false;
  }
}

/// Shows [SecurityCheckPanel] over [navigator] until it yields a token or
/// the person dismisses it (null). It also settles with null when the
/// navigator goes away (sign-out, account switch) or after [giveUpAfter].
///
/// Non-modal, the panel is an overlay entry and the page stays usable: it
/// takes keyboard focus unless the person is typing, and Tab is not trapped.
/// [modal], it is a transparent route: no scrim, but the page under it takes
/// no input, focus stays in the panel, Back closes it first, and it leaves
/// with the page it covers. Escape dismisses it either way.
Future<String?> showSecurityCheckPanel(
  NavigatorState navigator, {
  bool modal = false,
  SecurityChallengeBuilder? challengeBuilder,
  Duration giveUpAfter = const Duration(minutes: 3),
}) {
  final completer = Completer<String?>();
  final previousFocus = FocusManager.instance.primaryFocus;
  // Non-modal, someone typing (an autosave asked) keeps their caret; the
  // panel is still reachable and announced to screen readers.
  final typing =
      previousFocus?.context?.findAncestorWidgetOfExactType<EditableText>() !=
      null;
  final takeFocus = modal || !typing;
  Timer? giveUp;
  var close = () {};
  void finish(String? token) {
    if (completer.isCompleted) return;
    giveUp?.cancel();
    completer.complete(token);
    close();
  }

  Widget panel() => _SecurityCheckPlacement(
    onUnmount: () => finish(null),
    child: SecurityCheckPanel(
      challengeBuilder: challengeBuilder,
      modal: modal,
      takeFocus: takeFocus,
      // A route hands focus back to the page under it on its own.
      restoreFocus: modal ? null : previousFocus,
      typingFocus: takeFocus ? null : previousFocus,
      onToken: finish,
      onDismiss: () => finish(null),
    ),
  );

  if (modal) {
    final route = RawDialogRoute<void>(
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      transitionDuration: Duration.zero,
      pageBuilder: (_, _, _) =>
          Stack(fit: StackFit.expand, children: [panel()]),
    );
    close = () {
      if (route.isActive) navigator.removeRoute(route);
    };
    // Back, or the page under the card leaving, settles the request.
    unawaited(navigator.push(route).then((_) => finish(null)));
  } else {
    final overlay = navigator.overlay;
    if (overlay == null) return Future.value();
    final entry = OverlayEntry(builder: (_) => panel());
    void dismiss() => finish(null);
    SecurityCheckCard._dismiss = dismiss;
    close = () {
      if (SecurityCheckCard._dismiss == dismiss) {
        SecurityCheckCard._dismiss = null;
      }
      // Safe even when the overlay is gone (for example after sign-out).
      entry
        ..remove()
        ..dispose();
    };
    overlay.insert(entry);
    // An overlay that went away before the panel ever built settles too.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!entry.mounted) finish(null);
    });
  }
  // A request must not wait forever on a panel nobody answers.
  giveUp = Timer(giveUpAfter, () => finish(null));
  return completer.future;
}

/// The open non-blocking card. System Back closes it before it navigates
/// the page or offers to exit the app, as it closed the dialog this card
/// replaced; the shell asks here because the card is not a route.
abstract final class SecurityCheckCard {
  static VoidCallback? _dismiss;

  static bool get isOpen => _dismiss != null;

  /// Closes the open card, if any. The request it served gets no token.
  static bool dismiss() {
    final dismiss = _dismiss;
    if (dismiss == null) return false;
    dismiss();
    return true;
  }
}

/// Places the panel where it reads as part of the page: above the floating
/// dock (or keyboard) on phones, in the bottom trailing corner on tablets
/// and laptops. Its height is bounded by the space above that, so Dismiss
/// stays on screen at large text sizes; the panel scrolls instead.
class _SecurityCheckPlacement extends StatefulWidget {
  const _SecurityCheckPlacement({required this.child, required this.onUnmount});

  final Widget child;
  final VoidCallback onUnmount;

  static const double _maxWidth = 380;

  @override
  State<_SecurityCheckPlacement> createState() =>
      _SecurityCheckPlacementState();
}

class _SecurityCheckPlacementState extends State<_SecurityCheckPlacement> {
  @override
  void dispose() {
    // Settle a caller whose overlay went away without an answer. Deferred:
    // the overlay must not change while its entries unmount.
    scheduleMicrotask(widget.onUnmount);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final compact =
        Breakpoints.fromWidth(media.size.width) == DeviceClass.compact;
    final keyboard = media.viewInsets.bottom;
    final bottom = keyboard > 0
        ? keyboard + AppSpacing.md
        : compact
        ? ShellDockMetrics.clearanceFor(media.padding.bottom)
        : media.padding.bottom + AppSpacing.xxl;
    final side = compact ? AppSpacing.md : AppSpacing.xxl;
    final startInset = rtl ? media.padding.right : media.padding.left;
    final endInset = rtl ? media.padding.left : media.padding.right;
    final maxHeight = media.size.height - bottom - media.padding.top - side;
    return PositionedDirectional(
      start: compact ? side + startInset : null,
      end: side + endInset,
      bottom: bottom,
      width: compact ? null : _SecurityCheckPlacement._maxWidth,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight.clamp(0, 1e6)),
        child: widget.child,
      ),
    );
  }
}
