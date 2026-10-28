import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

export 'package:mobile/features/mastermind/view/widgets/pull_to_search.dart';

/// Whether a list's search field is shown, and its query.
///
/// Search starts hidden so filters don't push the list down. It opens from a
/// search icon in the top navbar ([searchActionSpec]) or from a pull-down at
/// the top of the list (`MastermindPullToSearch`); it stays open while a
/// query is applied and closes again once cleared and unfocused.
class MastermindSearchController extends ChangeNotifier {
  MastermindSearchController({String query = ''})
    : text = TextEditingController(text: query),
      _expanded = query.isNotEmpty;

  final TextEditingController text;
  final FocusNode focusNode = FocusNode(debugLabel: 'mastermind-search');
  bool _expanded;

  bool get expanded => _expanded;
  bool get hasQuery => text.text.trim().isNotEmpty;

  /// Shows the field; [focus] also raises the keyboard, as an icon tap does.
  void reveal({bool focus = false}) {
    if (!_expanded) {
      _expanded = true;
      notifyListeners();
    }
    if (focus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_expanded) focusNode.requestFocus();
      });
    }
  }

  /// Clears the query and hides the field.
  void collapse() {
    focusNode.unfocus();
    final hadQuery = text.text.isNotEmpty;
    text.clear();
    if (!_expanded && !hadQuery) return;
    _expanded = false;
    notifyListeners();
  }

  /// The navbar icon: open and focus, or clear and close.
  void toggle() => _expanded ? collapse() : reveal(focus: true);

  /// The navbar search action. Register it through `ShellChromeActions`.
  ShellActionSpec searchActionSpec({
    required String id,
    required String tooltip,
  }) => ShellActionSpec(
    id: id,
    icon: _expanded ? AppIcons.close : AppIcons.search,
    tooltip: tooltip,
    highlighted: _expanded || hasQuery,
    callbackToken: (_expanded, hasQuery),
    onPressed: toggle,
  );

  @override
  void dispose() {
    text.dispose();
    focusNode.dispose();
    super.dispose();
  }
}

/// The search field itself, collapsed to nothing until revealed.
class MastermindCollapsibleSearch extends StatefulWidget {
  const MastermindCollapsibleSearch({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    super.key,
  });

  final MastermindSearchController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;

  @override
  State<MastermindCollapsibleSearch> createState() =>
      _MastermindCollapsibleSearchState();
}

class _MastermindCollapsibleSearchState
    extends State<MastermindCollapsibleSearch> {
  late String _reported = widget.controller.text.text;

  @override
  void initState() {
    super.initState();
    _listen(widget.controller);
  }

  @override
  void didUpdateWidget(covariant MastermindCollapsibleSearch oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      _unlisten(oldWidget.controller);
      _listen(widget.controller);
    }
  }

  @override
  void dispose() {
    _unlisten(widget.controller);
    super.dispose();
  }

  void _listen(MastermindSearchController controller) {
    controller.addListener(_onController);
    controller.focusNode.addListener(_onFocus);
  }

  void _unlisten(MastermindSearchController controller) {
    controller.removeListener(_onController);
    controller.focusNode.removeListener(_onFocus);
  }

  void _onQuery(String query) {
    _reported = query;
    widget.onChanged(query);
  }

  // Closing from the navbar icon clears the query; tell the list once.
  void _onController() {
    if (!widget.controller.expanded && _reported.isNotEmpty) _onQuery('');
  }

  // An empty field that loses focus folds away again.
  void _onFocus() {
    final controller = widget.controller;
    if (!controller.focusNode.hasFocus && !controller.hasQuery) {
      controller.collapse();
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) => AnimatedSize(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: widget.controller.expanded
          ? Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: AppSearchField(
                controller: widget.controller.text,
                focusNode: widget.controller.focusNode,
                placeholder: widget.placeholder,
                onChanged: _onQuery,
              ),
            )
          : const SizedBox(width: double.infinity),
    ),
  );
}
