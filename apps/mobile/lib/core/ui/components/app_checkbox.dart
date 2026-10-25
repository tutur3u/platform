import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppCheckbox extends StatelessWidget {
  const AppCheckbox({
    required this.value,
    required this.onChanged,
    this.tristate = false,
    this.semanticLabel,
    super.key,
  });
  final bool? value;
  final ValueChanged<bool?>? onChanged;
  final bool tristate;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final active = value != false;
    void toggle() => onChanged?.call(
      tristate
          ? switch (value) {
              false => true,
              true => null,
              null => false,
            }
          : value != true,
    );
    return Semantics(
      container: true,
      label: semanticLabel,
      checked: value == true,
      mixed: value == null,
      enabled: onChanged != null,
      onTap: onChanged == null ? null : toggle,
      child: ExcludeSemantics(
        child: AppControlTarget(
          onTap: onChanged == null ? null : toggle,
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: active ? c.primary : c.card,
              border: Border.all(
                color: active ? c.primary : c.mutedForeground,
                width: 1.5,
              ),
              borderRadius: BorderRadius.circular(6),
            ),
            child: active
                ? Icon(
                    value == null ? LucideIcons.minus : LucideIcons.check,
                    size: 15,
                    color: c.primaryForeground,
                  )
                : null,
          ),
        ),
      ),
    );
  }
}
