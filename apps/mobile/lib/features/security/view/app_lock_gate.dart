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
        child: Stack(
          fit: StackFit.expand,
          children: [
            const _LockBackdrop(),
            SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                      ),
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 400),
                            child: _LockCard(
                              authenticating: authenticating,
                              onUnlock: onUnlock,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
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

    return Container(
      key: const ValueKey('app-lock-card'),
      padding: const EdgeInsets.fromLTRB(28, 30, 28, 26),
      decoration: BoxDecoration(
        color: colorScheme.card.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(
          color: colorScheme.primary.withValues(alpha: 0.22),
        ),
        boxShadow: [
          BoxShadow(
            color: colorScheme.primary.withValues(alpha: 0.12),
            blurRadius: 40,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(child: _BrandLockMark()),
          const SizedBox(height: 24),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
              decoration: BoxDecoration(
                color: colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.verified_user_outlined,
                    size: 15,
                    color: colorScheme.primary,
                  ),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      l10n.appLockProtectedDevice,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.xSmall.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            l10n.appLockLockedTitle,
            textAlign: TextAlign.center,
            style: theme.typography.h2.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: -0.6,
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
          const SizedBox(height: 26),
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

class _BrandLockMark extends StatelessWidget {
  const _BrandLockMark();

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;

    return SizedBox.square(
      dimension: 88,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            padding: const EdgeInsets.all(17),
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(
                color: colorScheme.primary.withValues(alpha: 0.24),
              ),
            ),
            child: Image.asset('assets/logos/transparent.png'),
          ),
          Positioned(
            right: -5,
            bottom: -5,
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: colorScheme.primary,
                shape: BoxShape.circle,
                border: Border.all(color: colorScheme.card, width: 3),
              ),
              child: Icon(
                Icons.lock_rounded,
                size: 17,
                color: colorScheme.primaryForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LockBackdrop extends StatelessWidget {
  const _LockBackdrop();

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(-0.7, -0.65),
          radius: 1.25,
          colors: [
            colorScheme.primary.withValues(alpha: 0.18),
            colorScheme.background.withValues(alpha: 0),
          ],
        ),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0.85, 0.9),
            radius: 1.15,
            colors: [
              colorScheme.primary.withValues(alpha: 0.1),
              colorScheme.background.withValues(alpha: 0),
            ],
          ),
        ),
      ),
    );
  }
}
