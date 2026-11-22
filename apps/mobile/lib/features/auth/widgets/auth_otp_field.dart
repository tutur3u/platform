import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';

class AuthOtpField extends StatefulWidget {
  const AuthOtpField({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    this.length = 6,
    this.enabled = true,
    this.autofocus = false,
    this.onCompleted,
    this.semanticLabel,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final int length;
  final bool enabled;
  final bool autofocus;

  /// Names the field for screen readers ("6-digit code").
  final String? semanticLabel;

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
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final focusHalo = tokens.infoTone.fill;
    final code = widget.controller.text;
    final hasFocus = widget.focusNode.hasFocus;
    return LayoutBuilder(
      builder: (context, constraints) {
        // 46x56 slots shrink to fit 320px phones; they never overflow.
        const gap = 8.0;
        final room = constraints.maxWidth.isFinite
            ? (constraints.maxWidth - gap * (widget.length - 1)) / widget.length
            : 46.0;
        final slotWidth = room.clamp(34.0, 46.0);
        final slotHeight = slotWidth * 56 / 46;
        final fieldWidth =
            widget.length * slotWidth + (widget.length - 1) * gap;
        return Semantics(
          textField: true,
          label: widget.semanticLabel,
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
                      final isActive =
                          hasFocus && widget.enabled && index == activeIndex;
                      return Padding(
                        padding: EdgeInsetsDirectional.only(
                          end: index == widget.length - 1 ? 0 : gap,
                        ),
                        child: AnimatedContainer(
                          duration: AppMotion.fast,
                          curve: AppMotion.standard,
                          width: slotWidth,
                          height: slotHeight,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: c.card,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              // Field stroke: `input` (borderStrong) stands in
                              // until the Sorbet `fieldStroke` role lands.
                              color: isActive ? c.ring : c.input,
                              width: isActive ? 1.5 : 1,
                            ),
                            boxShadow: isActive
                                ? [BoxShadow(color: focusHalo, spreadRadius: 3)]
                                : const [],
                          ),
                          child: Text(
                            isFilled ? code[index] : '',
                            style: tokens.typography.x2Large.copyWith(
                              fontFamily: tokens.typography.monoFamily,
                              fontWeight: FontWeight.w600,
                              color: c.foreground,
                              height: 1,
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
                Positioned.fill(child: _input(tokens)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _input(AppTokens tokens) => TextField(
    // input-placeholder: exempt hidden OTP capture
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
    style: tokens.typography.x2Large.copyWith(
      color: Colors.transparent,
      height: 1,
    ),
    cursorColor: Colors.transparent,
    // The capture field is invisible; theme borders must not draw over the
    // slots.
    decoration: const InputDecoration(
      border: InputBorder.none,
      enabledBorder: InputBorder.none,
      focusedBorder: InputBorder.none,
      disabledBorder: InputBorder.none,
      errorBorder: InputBorder.none,
      focusedErrorBorder: InputBorder.none,
      filled: false,
      counterText: '',
      contentPadding: EdgeInsets.zero,
      isCollapsed: true,
    ),
    onChanged: _handleTextChanged,
  );
}
