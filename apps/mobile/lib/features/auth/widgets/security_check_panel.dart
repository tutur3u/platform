import 'package:cloudflare_turnstile/cloudflare_turnstile.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

typedef SecurityChallengeBuilder =
    Widget Function(
      Key key,
      ValueChanged<String> onToken,
      VoidCallback onFailure,
    );

/// The interactive Turnstile check as a compact card: title, one line of
/// context, the widget, and a dismiss button. It never dims the page.
class SecurityCheckPanel extends StatefulWidget {
  const SecurityCheckPanel({
    required this.onToken,
    required this.onDismiss,
    super.key,
    this.modal = false,
    this.takeFocus = true,
    this.restoreFocus,
    this.typingFocus,
    this.challengeBuilder,
  });

  final ValueChanged<String> onToken;
  final VoidCallback onDismiss;

  /// The panel is a route of its own and keeps keyboard focus while open.
  final bool modal;

  /// Moves keyboard focus to the panel when it opens.
  final bool takeFocus;

  /// Where focus returns when the panel closes while it still holds focus.
  final FocusNode? restoreFocus;

  /// The text field that kept focus when the panel opened instead of
  /// [takeFocus]. Escape pressed in that field dismisses the panel.
  final FocusNode? typingFocus;

  @visibleForTesting
  final SecurityChallengeBuilder? challengeBuilder;

  @override
  State<SecurityCheckPanel> createState() => _SecurityCheckPanelState();
}

class _SecurityCheckPanelState extends State<SecurityCheckPanel> {
  // Owned here: created with the panel and disposed with it, after the
  // Focus widget below has let go of it.
  final _focus = FocusNode(debugLabel: 'security-check-panel');
  int _attempt = 0;
  bool _failed = false;
  bool _completed = false;

  void _fail() {
    if (mounted && !_completed) setState(() => _failed = true);
  }

  /// Hands focus back before the panel closes, if the panel still has it.
  void _returnFocus() {
    final previous = widget.restoreFocus;
    if (_focus.hasFocus && previous != null && previous.context != null) {
      previous.requestFocus();
    }
  }

  void _dismiss() {
    if (_completed) return;
    _completed = true;
    _returnFocus();
    widget.onDismiss();
  }

  @override
  void initState() {
    super.initState();
    if (widget.typingFocus != null) {
      FocusManager.instance.addEarlyKeyEventHandler(_onTypingEscape);
    }
    // `autofocus` yields to a route that already holds focus; ask directly.
    if (widget.takeFocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_completed) _focus.requestFocus();
      });
    }
    if (widget.modal) _focus.addListener(_keepFocus);
  }

  /// System Back outside the shell (which asks `SecurityCheckCard` itself).
  Future<bool> _onSystemBack() async {
    if (_completed) return false;
    _dismiss();
    return true;
  }

  /// A late focus request from the form under a modal check (a field that
  /// focuses itself after a step change) must not leave Escape outside it.
  void _keepFocus() {
    if (mounted && !_completed && !_focus.hasFocus) _focus.requestFocus();
  }

  @override
  void dispose() {
    FocusManager.instance.removeEarlyKeyEventHandler(_onTypingEscape);
    _focus.dispose();
    super.dispose();
  }

  bool _isEscape(KeyEvent event) =>
      !_completed &&
      event is KeyDownEvent &&
      event.logicalKey == LogicalKeyboardKey.escape;

  /// While the person keeps typing in the field that had focus when the
  /// panel opened, Escape dismisses the panel. With focus anywhere else,
  /// another field or dialog included, the page's own Escape is left alone.
  KeyEventResult _onTypingEscape(KeyEvent event) {
    if (!_isEscape(event) ||
        FocusManager.instance.primaryFocus != widget.typingFocus) {
      return KeyEventResult.ignored;
    }
    _dismiss();
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final radius = BorderRadius.circular(AppRadius.card);
    // With focus in the panel, Escape reaches it before the app-wide
    // shortcuts. It is a plain focus node, not a scope: non-modal, Tab moves
    // on to the page; modal, the route's own scope keeps Tab in the panel.
    final panel = Focus(
      focusNode: _focus,
      autofocus: widget.takeFocus,
      skipTraversal: true,
      onKeyEvent: (_, event) {
        if (!_isEscape(event)) return KeyEventResult.ignored;
        _dismiss();
        return KeyEventResult.handled;
      },
      child: Semantics(
        key: const ValueKey('security-check-panel'),
        container: true,
        explicitChildNodes: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: radius,
            boxShadow: const [
              BoxShadow(
                color: Color(0x47000000),
                offset: Offset(0, 12),
                blurRadius: 36,
                spreadRadius: -8,
              ),
            ],
          ),
          child: Material(
            color: c.card,
            shape: RoundedRectangleBorder(
              borderRadius: radius,
              side: BorderSide(color: c.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppIconTile(icon: LucideIcons.shieldCheck),
                      const SizedBox(width: AppLayout.rowLeadingGap),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Semantics(
                              liveRegion: true,
                              header: true,
                              child: Text(
                                l10n.securityCheckPanelTitle,
                                style: tokens.typography.base.copyWith(
                                  color: c.foreground,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(height: AppSpacing.xxs),
                            Text(
                              l10n.securityCheckPanelMessage,
                              style: tokens.typography.small.copyWith(
                                color: c.mutedForeground,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: l10n.securityCheckDismiss,
                        onPressed: _dismiss,
                        icon: const Icon(LucideIcons.x, size: 18),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _challenge(),
                  if (_failed) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        l10n.captchaError,
                        style: tokens.typography.small.copyWith(
                          color: c.destructive,
                        ),
                      ),
                    ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(
                        onPressed: () => setState(() {
                          _failed = false;
                          _attempt++;
                        }),
                        child: Text(l10n.commonRetry),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
    // A modal check is a route, which Back pops. The card needs a listener;
    // the tear-off is stable, so rebuilds do not re-take Back priority.
    if (widget.modal || Router.maybeOf(context)?.backButtonDispatcher == null) {
      return panel;
    }
    return BackButtonListener(onBackButtonPressed: _onSystemBack, child: panel);
  }

  Widget _challenge() {
    final attempt = _attempt;
    void onToken(String token) {
      if (!mounted || _completed || attempt != _attempt || token.isEmpty) {
        return;
      }
      _completed = true;
      _returnFocus();
      widget.onToken(token);
    }

    void onFailure() {
      if (attempt == _attempt) _fail();
    }

    final key = ValueKey(attempt);
    final dark = AppTokens.of(context).colorScheme.isDark;
    return widget.challengeBuilder?.call(key, onToken, onFailure) ??
        LayoutBuilder(
          builder: (context, constraints) {
            // The flexible widget needs 300px; the narrowest phones get the
            // compact one instead of a clipped checkbox. The plugin sizes
            // its page once, so a resize across 300px builds a new widget.
            final compact = constraints.maxWidth < TurnstileSize.normal.width;
            return CloudflareTurnstile(
              key: ValueKey((attempt, compact)),
              siteKey: Env.turnstileSiteKey,
              baseUrl: Env.turnstileBaseUrl,
              options: TurnstileOptions(
                size: compact ? TurnstileSize.compact : TurnstileSize.flexible,
                theme: dark ? TurnstileTheme.dark : TurnstileTheme.light,
              ),
              onTokenReceived: onToken,
              onError: (_) => onFailure(),
              onTimeout: onFailure,
            );
          },
        );
  }
}
