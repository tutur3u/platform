import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AuthOtpField extends StatefulWidget {
  const AuthOtpField({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    this.length = 6,
    this.enabled = true,
    this.autofocus = false,
    this.onCompleted,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final int length;
  final bool enabled;
  final bool autofocus;

  @override
  State<AuthOtpField> createState() => _AuthOtpFieldState();
}

class _AuthOtpFieldState extends State<AuthOtpField> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_handleControllerChanged);
    widget.focusNode.addListener(_handleFocusChanged);
  }

  @override
  void didUpdateWidget(covariant AuthOtpField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_handleControllerChanged);
      widget.controller.addListener(_handleControllerChanged);
    }
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode.removeListener(_handleFocusChanged);
      widget.focusNode.addListener(_handleFocusChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleControllerChanged);
    widget.focusNode.removeListener(_handleFocusChanged);
    super.dispose();
  }

  void _handleControllerChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  void _handleFocusChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  void _handleTextChanged(String value) {
    final digitsOnly = value.replaceAll(RegExp(r'\D'), '');
    final trimmed = digitsOnly.length > widget.length
        ? digitsOnly.substring(0, widget.length)
        : digitsOnly;

    if (trimmed != value) {
      widget.controller.value = TextEditingValue(
        text: trimmed,
        selection: TextSelection.collapsed(offset: trimmed.length),
      );
    }

    widget.onChanged(trimmed);

    if (trimmed.length == widget.length) {
      widget.onCompleted?.call(trimmed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final code = widget.controller.text;
    final hasFocus = widget.focusNode.hasFocus;
    const slotWidth = 46.0;
    const slotHeight = 56.0;
    const slotSpacing = 10.0;
    final fieldWidth =
        (widget.length * slotWidth) + ((widget.length - 1) * slotSpacing);

    return Semantics(
      textField: true,
      child: SizedBox(
        width: fieldWidth,
        height: slotHeight,
        child: Stack(
          alignment: Alignment.center,
          children: [
            IgnorePointer(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(widget.length, (index) {
                  final isFilled = index < code.length;
                  final activeIndex = code.length >= widget.length
                      ? widget.length - 1
                      : code.length;
                  final isActive = hasFocus && index == activeIndex;
                  final char = isFilled ? code[index] : '';

                  return Padding(
                    padding: EdgeInsets.only(
                      right: index == widget.length - 1 ? 0 : slotSpacing,
                    ),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 160),
                      curve: Curves.easeOutCubic,
                      width: slotWidth,
                      height: slotHeight,
                      decoration: BoxDecoration(
                        color: isFilled
                            ? theme.colorScheme.primary.withValues(alpha: 0.12)
                            : theme.colorScheme.muted.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(17),
                        border: Border.all(
                          color: isActive
                              ? theme.colorScheme.primary.withValues(alpha: 0.4)
                              : theme.colorScheme.border.withValues(
                                  alpha: 0.28,
                                ),
                        ),
                        boxShadow: isActive
                            ? [
                                BoxShadow(
                                  color: theme.colorScheme.primary.withValues(
                                    alpha: 0.08,
                                  ),
                                  blurRadius: 14,
                                  offset: const Offset(0, 4),
                                ),
                              ]
                            : const [],
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Text(
                            char,
                            style: theme.typography.h3.copyWith(
                              fontWeight: FontWeight.w700,
                              color: isFilled
                                  ? theme.colorScheme.foreground
                                  : theme.colorScheme.mutedForeground,
                            ),
                          ),
                          if (isActive && !isFilled)
                            Positioned(
                              bottom: 14,
                              child: Container(
                                width: 2,
                                height: 16,
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.primary,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                }),
              ),
            ),
            Positioned.fill(
              child: TextField(
                key: const ValueKey('auth-otp-input'),
                controller: widget.controller,
                focusNode: widget.focusNode,
                enabled: widget.enabled,
                autofocus: widget.autofocus,
                autocorrect: false,
                enableSuggestions: false,
                enableInteractiveSelection: true,
                showCursor: false,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                textAlign: TextAlign.center,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(widget.length),
                ],
                style: theme.typography.h3.copyWith(
                  color: Colors.transparent,
                  height: 1,
                ),
                cursorColor: Colors.transparent,
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  counterText: '',
                  contentPadding: EdgeInsets.zero,
                  isCollapsed: true,
                ),
                onChanged: _handleTextChanged,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
