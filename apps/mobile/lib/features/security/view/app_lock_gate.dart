import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter/services.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppLockGate extends StatelessWidget {
  const AppLockGate({
    required this.authenticating,
    required this.onUnlock,
    super.key,
  });

  final bool authenticating;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: colorScheme.background,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        systemNavigationBarIconBrightness: isDark
            ? Brightness.light
            : Brightness.dark,
      ),
      child: ColoredBox(
        color: colorScheme.background,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 360),
                      child: _LockCard(
                        authenticating: authenticating,
                        onUnlock: onUnlock,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _LockCard extends StatelessWidget {
  const _LockCard({
    required this.authenticating,
    required this.onUnlock,
  });

  final bool authenticating;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final l10n = context.l10n;

    return Padding(
      key: const ValueKey('app-lock-card'),
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(child: _MinimalLockMark()),
          const SizedBox(height: 28),
          Text(
            l10n.appLockLockedTitle,
            textAlign: TextAlign.center,
            style: theme.typography.h2.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            l10n.appLockLockedDescription,
            textAlign: TextAlign.center,
            style: theme.typography.textSmall.copyWith(
              color: colorScheme.mutedForeground,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            key: const ValueKey('app-lock-unlock-button'),
            width: double.infinity,
            height: 52,
            child: shad.PrimaryButton(
              enabled: !authenticating,
              onPressed: onUnlock,
              alignment: Alignment.center,
              child: Row(
                key: const ValueKey('app-lock-unlock-content'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (authenticating)
                    const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    const Icon(Icons.fingerprint_rounded, size: 21),
                  const SizedBox(width: 9),
                  Text(
                    authenticating
                        ? l10n.appLockUnlockingAction
                        : l10n.appLockUnlockAction,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MinimalLockMark extends StatelessWidget {
  const _MinimalLockMark();

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;

    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: colorScheme.muted.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colorScheme.border),
      ),
      child: Icon(
        Icons.lock_outline_rounded,
        size: 28,
        color: colorScheme.foreground,
      ),
    );
  }
}
