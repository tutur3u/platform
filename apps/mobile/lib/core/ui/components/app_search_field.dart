import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';

/// Filled search input with a clear button.
///
/// Inside the shell, searchable sheets and pages should register a dynamic
/// shell search action instead (see `AppSheetSearch`); this field is the
/// fallback where no shell chrome is available.
class AppSearchField extends StatefulWidget {
  const AppSearchField({
    required this.controller,
    this.placeholder,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
    this.autofocus = false,
    super.key,
  });

  final TextEditingController controller;
  final String? placeholder;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final FocusNode? focusNode;
  final bool autofocus;

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onText);
  }

  @override
  void didUpdateWidget(covariant AppSearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onText);
      widget.controller.addListener(_onText);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onText);
    super.dispose();
  }

  void _onText() => setState(() {});

  void _clear() {
    widget.controller.clear();
    widget.onChanged?.call('');
  }

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: widget.controller,
    focusNode: widget.focusNode,
    autofocus: widget.autofocus,
    placeholder: widget.placeholder,
    onChanged: widget.onChanged,
    onSubmitted: widget.onSubmitted,
    textInputAction: TextInputAction.search,
    filled: true,
    leading: const Icon(AppIcons.search, size: 18),
    trailing: widget.controller.text.isEmpty
        ? null
        : AppIconButton(
            tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
            icon: const Icon(AppIcons.close, size: 18),
            onPressed: _clear,
          ),
  );
}
