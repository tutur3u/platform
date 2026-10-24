import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppSwitch extends StatelessWidget {
  const AppSwitch({
    required this.value,
    required this.onChanged,
    this.semanticLabel,
    super.key,
  });
  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    void toggle() => onChanged?.call(!value);
    return Semantics(
      container: true,
      label: semanticLabel,
      toggled: value,
      enabled: onChanged != null,
      onTap: onChanged == null ? null : toggle,
      child: ExcludeSemantics(
        child: AppControlTarget(
          onTap: onChanged == null ? null : toggle,
          child: AnimatedContainer(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : AppMotion.fast,
            width: 44,
            height: 26,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: value ? c.primary : c.input,
              borderRadius: BorderRadius.circular(13),
            ),
            child: AnimatedAlign(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : AppMotion.fast,
              alignment: value
                  ? AlignmentDirectional.centerEnd
                  : AlignmentDirectional.centerStart,
              child: SizedBox.square(
                dimension: 20,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: value ? c.primaryForeground : c.background,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
