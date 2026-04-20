import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    required this.child,
    this.title,
    this.showBackButton = false,
    this.backButtonLabel,
    this.onBack,
    super.key,
  });

  final Widget child;
  final String? title;
  final bool showBackButton;

  /// Shown next to the back arrow when [showBackButton] is true (e.g. "Home").
  final String? backButtonLabel;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final deviceClass = context.deviceClass;
    final hPadding = ResponsivePadding.horizontal(deviceClass);
    final maxFormW = ResponsivePadding.maxFormWidth(deviceClass);

    return shad.Scaffold(
      resizeToAvoidBottomInset: true,
      headers: [
        if (showBackButton)
          shad.AppBar(
            leading: [
              shad.GhostButton(
                onPressed: onBack ?? () => Navigator.of(context).pop(),
                child: backButtonLabel == null
                    ? const Icon(Icons.arrow_back)
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.arrow_back),
                          const SizedBox(width: 8),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 140),
                            child: Text(
                              backButtonLabel!,
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
              ),
            ],
          ),
      ],
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle(
          statusBarIconBrightness: theme.brightness == Brightness.dark
              ? Brightness.light
              : Brightness.dark,
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.symmetric(
                  horizontal: hPadding,
                  vertical: 24,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight,
                  ),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: maxFormW),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Brand Header
                          Center(
                            child: Image.asset(
                              'assets/logos/transparent.png',
                              width: 64,
                              height: 64,
                            ),
                          ),

                          const shad.Gap(48),

                          if (title != null) ...[
                            Text(
                              title!,
                              style: theme.typography.h2,
                              textAlign: TextAlign.center,
                            ),
                            const shad.Gap(24),
                          ],

                          child,
                        ],
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
