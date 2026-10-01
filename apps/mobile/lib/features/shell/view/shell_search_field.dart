import 'package:flutter/material.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';

/// Shared search title for shell actions that expose a query controller.
class ShellSearchField extends StatefulWidget {
  const ShellSearchField({required this.action, super.key});

  final ShellActionSpec action;

  @override
  State<ShellSearchField> createState() => _ShellSearchFieldState();
}

class _ShellSearchFieldState extends State<ShellSearchField> {
  final FocusNode _focusNode = FocusNode(debugLabel: 'shell-search');

  @override
  void initState() {
    super.initState();
    _requestFocus();
  }

  @override
  void didUpdateWidget(covariant ShellSearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.action.searchController != widget.action.searchController) {
      _requestFocus();
    }
  }

  void _requestFocus() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_focusNode.hasFocus) _focusNode.requestFocus();
    });
  }

  void _close() {
    _focusNode.unfocus();
    widget.action.onCloseSearch?.call();
  }

  void _submit(String query) {
    if (query.trim().isEmpty) {
      _close();
      return;
    }
    widget.action.onSearchChanged?.call(query);
    _focusNode.unfocus();
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    height: mobileSectionAppBarHeightFor(context),
    child: Row(
      children: [
        const SizedBox.square(
          dimension: 40,
          child: Center(child: Icon(Icons.search_rounded, size: 22)),
        ),
        Expanded(
          child: TextField(
            key: const ValueKey('shell-search-query'),
            controller: widget.action.searchController,
            focusNode: _focusNode,
            textAlignVertical: TextAlignVertical.center,
            onChanged: widget.action.onSearchChanged,
            onSubmitted: _submit,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: widget.action.searchHint,
              border: InputBorder.none,
              isCollapsed: true,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        SizedBox.square(
          dimension: 40,
          child: IconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            padding: EdgeInsets.zero,
            onPressed: _close,
            icon: const Icon(Icons.close_rounded, size: 22),
          ),
        ),
      ],
    ),
  );
}
