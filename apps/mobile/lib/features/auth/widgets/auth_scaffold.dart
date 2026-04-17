import 'package:flutter/material.dart';
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
    final keyboardBottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final keyboardVisible = keyboardBottomInset > 0;

    return shad.Scaffold(
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.fromLTRB(
                hPadding,
                24,
                hPadding,
                24 + keyboardBottomInset,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 48,
                ),
                child: Align(
                  alignment: keyboardVisible
                      ? Alignment.topCenter
                      : Alignment.center,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxFormW),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (showBackButton)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 24),
                              child: shad.GhostButton(
                                onPressed:
                                    onBack ?? () => Navigator.of(context).pop(),
                                child: backButtonLabel == null
                                    ? const Icon(Icons.arrow_back)
                                    : Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.arrow_back),
                                          const SizedBox(width: 8),
                                          Text(backButtonLabel!),
                                        ],
                                      ),
                              ),
                            ),
                          ),

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
    );
  }
}
