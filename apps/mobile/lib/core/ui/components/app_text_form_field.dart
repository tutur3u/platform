import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';

class AppTextFormField extends StatefulWidget {
  const AppTextFormField({
    this.controller,
    this.initialValue,
    this.label,
    this.placeholder,
    this.validator,
    this.onChanged,
    this.onSaved,
    this.maxLines = 1,
    this.minLines,
    this.maxLength,
    this.enabled = true,
    this.autofocus = false,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.autovalidateMode,
    super.key,
  });
  final TextEditingController? controller;
  final String? initialValue;
  final String? label;
  final String? placeholder;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;
  final FormFieldSetter<String>? onSaved;
  final int? maxLines;
  final int? minLines;
  final int? maxLength;
  final bool enabled;
  final bool autofocus;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final AutovalidateMode? autovalidateMode;

  @override
  State<AppTextFormField> createState() => _AppTextFormFieldState();
}

class _AppTextFormFieldState extends State<AppTextFormField> {
  late final TextEditingController _owned = TextEditingController(
    text: widget.initialValue,
  );
  final _field = GlobalKey<FormFieldState<String>>();
  late final String _initialText = _controller.text;
  TextEditingController get _controller => widget.controller ?? _owned;

  void _syncValue() {
    if (_field.currentState?.value != _controller.text) {
      _field.currentState?.didChange(_controller.text);
    }
  }

  @override
  void initState() {
    super.initState();
    _controller.addListener(_syncValue);
  }

  @override
  void didUpdateWidget(AppTextFormField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      (oldWidget.controller ?? _owned).removeListener(_syncValue);
      _controller.addListener(_syncValue);
      _syncValue();
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_syncValue);
    _owned.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormField<String>(
    key: _field,
    initialValue: _initialText,
    onReset: () => _controller.text = _initialText,
    validator: widget.validator,
    onSaved: widget.onSaved,
    enabled: widget.enabled,
    autovalidateMode: widget.autovalidateMode,
    builder: (field) => AppTextField(
      controller: _controller,
      label: widget.label,
      placeholder: widget.placeholder,
      errorText: field.errorText,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      maxLines: widget.maxLines,
      minLines: widget.minLines,
      maxLength: widget.maxLength,
      keyboardType: widget.keyboardType,
      textCapitalization: widget.textCapitalization,
      onChanged: widget.onChanged,
    ),
  );
}
