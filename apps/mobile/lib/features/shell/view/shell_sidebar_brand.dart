import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';
import 'package:mobile/l10n/l10n.dart';

class ShellSidebarBrand extends StatelessWidget {
  const ShellSidebarBrand({required this.extended, super.key});

  final bool extended;

  @override
  Widget build(BuildContext context) {
    final title = context.l10n.appTitle;
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: extended ? AppSpacing.sm : 0),
      child: Align(
        alignment: extended
            ? AlignmentDirectional.centerStart
            : Alignment.center,
        child: Semantics(
          header: true,
          label: title,
          excludeSemantics: true,
          child: extended
              ? ShellBrandTitle(title: title)
              : Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  child: Image.asset(
                    'assets/logos/transparent.png',
                    width: 28,
                    height: 28,
                  ),
                ),
        ),
      ),
    );
  }
}
