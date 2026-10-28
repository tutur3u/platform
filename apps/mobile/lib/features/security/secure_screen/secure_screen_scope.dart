import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Native secure-screen switch, reference-counted across open screens.
///
/// Android sets FLAG_SECURE (no screenshots, recordings or recents
/// thumbnail). iOS cannot block screenshots; it blurs the app-switcher
/// snapshot instead. A platform without the channel (tests, desktop) is a
/// no-op, and [SecureScreenScope] still covers its child while inactive.
abstract final class SecureScreen {
  static const channel = MethodChannel('mobile/secure_screen');
  static int _holders = 0;

  @visibleForTesting
  static int get holders => _holders;

  static void acquire() {
    if (_holders++ == 0) unawaited(_set(secure: true));
  }

  static void release() {
    if (_holders == 0) return;
    if (--_holders == 0) unawaited(_set(secure: false));
  }

  static Future<void> _set({required bool secure}) async {
    try {
      await channel.invokeMethod<void>('setSecure', {'secure': secure});
    } on Object {
      // No channel on this platform; the in-app cover still applies.
    }
  }
}

/// Keeps [child] out of screenshots and app-switcher previews while mounted
/// (D §1.3). While the app is not in the foreground the child is replaced by
/// an opaque cover, so a preview taken by the OS shows no content.
class SecureScreenScope extends StatefulWidget {
  const SecureScreenScope({required this.child, super.key});

  final Widget child;

  @override
  State<SecureScreenScope> createState() => _SecureScreenScopeState();
}

class _SecureScreenScopeState extends State<SecureScreenScope> {
  late final AppLifecycleListener _lifecycle;
  bool _covered = false;

  @override
  void initState() {
    super.initState();
    SecureScreen.acquire();
    _covered = _hidden(WidgetsBinding.instance.lifecycleState);
    _lifecycle = AppLifecycleListener(
      onStateChange: (state) {
        final covered = _hidden(state);
        if (covered != _covered) setState(() => _covered = covered);
      },
    );
  }

  static bool _hidden(AppLifecycleState? state) =>
      state != null && state != AppLifecycleState.resumed;

  @override
  void dispose() {
    _lifecycle.dispose();
    SecureScreen.release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      // The child keeps its state offstage; it is neither painted nor read
      // out while covered.
      Offstage(
        offstage: _covered,
        child: TickerMode(enabled: !_covered, child: widget.child),
      ),
      if (_covered)
        ColoredBox(
          key: const ValueKey('secure-screen-cover'),
          color: AppTokens.of(context).colorScheme.background,
        ),
    ],
  );
}
