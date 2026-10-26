import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Single- or multi-line text input styled with design tokens.
///
/// Replaces `shad.TextField` and `shad.TextArea` (`maxLines: null`).
/// `shad.InputFeature.leading/trailing` map to [leading] and [trailing].
class AppTextField extends StatelessWidget {
  const AppTextField({
    this.controller,
    this.style,
    this.contentPadding,
    this.expands = false,
    this.textAlignVertical,
    this.contextMenuBuilder,
    this.selectionControls,
    this.focusNode,
    this.placeholder,
    this.hintMaxLines,
    this.label,
    this.errorText,
    this.helperText,
    this.leading,
    this.trailing,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.onTapOutside,
    this.borderless = false,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.inputFormatters,
    this.autofillHints,
    this.obscureText = false,
    this.autofocus = false,
    this.enabled = true,
    this.readOnly = false,
    this.minLines,
    this.maxLines = 1,
    this.maxLength,
    this.filled = false,
    super.key,
  });

  final TextEditingController? controller;
  final TextStyle? style;
  final EdgeInsetsGeometry? contentPadding;
  final bool expands;
  final TextAlignVertical? textAlignVertical;
  final EditableTextContextMenuBuilder? contextMenuBuilder;
  final TextSelectionControls? selectionControls;
  final FocusNode? focusNode;
  final String? placeholder;
  final int? hintMaxLines;

  /// Visible label above the field; also its accessible name.
  final String? label;
  final String? errorText;

  /// Muted guidance below the field, such as format or privacy notes.
  final String? helperText;
  final Widget? leading;
  final Widget? trailing;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final TapRegionCallback? onTapOutside;
  final bool borderless;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final List<TextInputFormatter>? inputFormatters;
  final Iterable<String>? autofillHints;
  final bool obscureText;
  final bool autofocus;
  final bool enabled;
  final bool readOnly;
  final int? minLines;
  final int? maxLines;
  final int? maxLength;

  /// Muted fill instead of an outline; used by search fields.
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    OutlineInputBorder outline(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: tokens.borderRadiusLg,
          borderSide: borderless || (filled && width == 1)
              ? BorderSide.none
              : BorderSide(color: color, width: width),
        );
    final resolvedStyle =
        style ?? tokens.typography.base.copyWith(color: c.foreground);
    final field = TextField(
      controller: controller,
      expands: expands,
      textAlignVertical: textAlignVertical,
      contextMenuBuilder:
          contextMenuBuilder ??
          (context, state) => AdaptiveTextSelectionToolbar.editableText(
            editableTextState: state,
          ),
      selectionControls: selectionControls,
      focusNode: focusNode,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      onTap: onTap,
      onTapOutside: onTapOutside,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      textCapitalization: textCapitalization,
      inputFormatters: inputFormatters,
      autofillHints: autofillHints,
      obscureText: obscureText,
      autofocus: autofocus,
      enabled: enabled,
      readOnly: readOnly,
      minLines: minLines,
      maxLines: obscureText ? 1 : maxLines,
      maxLength: maxLength,
      style: resolvedStyle,
      cursorColor: c.primary,
      decoration: InputDecoration(
        hintText: placeholder == label ? null : placeholder,
        hintMaxLines: hintMaxLines,
        errorText: errorText,
        helperText: helperText,
        helperMaxLines: 3,
        helperStyle: tokens.typography.small.copyWith(color: c.mutedForeground),
        counterStyle: tokens.typography.small.copyWith(
          color: c.mutedForeground,
        ),
        hintStyle: resolvedStyle.copyWith(color: c.mutedForeground),
        prefixIcon: leading,
        suffixIcon: trailing,
        prefixIconColor: c.mutedForeground,
        suffixIconColor: c.mutedForeground,
        filled: true,
        fillColor: filled ? c.muted : c.card.withValues(alpha: 0),
        isDense: true,
        contentPadding:
            contentPadding ??
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: outline(c.input),
        enabledBorder: outline(c.input),
        disabledBorder: outline(c.input.withValues(alpha: 0.5)),
        focusedBorder: outline(c.ring, 1.5),
        errorBorder: outline(c.destructive),
        focusedErrorBorder: outline(c.destructive, 1.5),
      ),
    );
    final fieldLabel = label;
    if (fieldLabel == null) return field;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExcludeSemantics(
          child: Text(
            fieldLabel,
            style: tokens.typography.small.copyWith(color: c.foreground),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Semantics(label: fieldLabel, child: field),
      ],
    );
  }
}
