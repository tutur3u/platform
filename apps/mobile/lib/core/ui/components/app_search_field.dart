import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_button_style.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

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
    this.clearTooltip,
    this.onClear,
    this.alwaysShowClear = false,
    this.clearButtonKey,
    this.clearButtonDensity = AppButtonDensity.icon,
    super.key,
  });

  final TextEditingController controller;
  final String? placeholder;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final FocusNode? focusNode;
  final bool autofocus;
  final String? clearTooltip;
  final VoidCallback? onClear;
  final bool alwaysShowClear;
  final Key? clearButtonKey;
  final AppButtonDensity clearButtonDensity;

  @override
  State<AppSearchField> createState() => _AppSearchFieldState();
}

class _AppSearchFieldState extends State<AppSearchField> {
  final FocusNode _ownedFocus = FocusNode(debugLabel: 'app-search');

  FocusNode get _focus => widget.focusNode ?? _ownedFocus;
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
    _ownedFocus.dispose();
    super.dispose();
  }

  void _onText() => setState(() {});

  void _clear() {
    _focus.unfocus();
    if (widget.onClear != null) {
      widget.onClear!();
      return;
    }
    widget.controller.clear();
    widget.onChanged?.call('');
  }

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: widget.controller,
    focusNode: _focus,
    textAlignVertical: TextAlignVertical.center,
    contentPadding: AppTokens.of(
      context,
    ).shapes.fieldPadding.copyWith(top: 0, bottom: 0),
    autofocus: widget.autofocus,
    placeholder: widget.placeholder,
    onChanged: widget.onChanged,
    onSubmitted: (query) {
      _focus.unfocus();
      widget.onSubmitted?.call(query);
    },
    onTapOutside: (_) => _focus.unfocus(),
    textInputAction: TextInputAction.search,
    filled: true,
    leading: const Icon(AppIcons.search, size: 18),
    trailing: widget.controller.text.isEmpty && !widget.alwaysShowClear
        ? null
        : AppIconButton(
            key: widget.clearButtonKey,
            density: widget.clearButtonDensity,
            tooltip:
                widget.clearTooltip ??
                MaterialLocalizations.of(context).deleteButtonTooltip,
            icon: const Icon(AppIcons.close, size: 18),
            onPressed: _clear,
          ),
  );
}
