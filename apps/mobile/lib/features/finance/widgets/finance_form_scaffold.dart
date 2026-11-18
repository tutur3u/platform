import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens a finance create or edit form full screen above the shell, so the
/// dock and the shell top bar stay out of the form.
Future<T?> showFinanceFormRoute<T>(
  BuildContext context, {
  required WidgetBuilder builder,
}) => Navigator.of(
  context,
  rootNavigator: true,
).push<T>(MaterialPageRoute<T>(fullscreenDialog: true, builder: builder));

/// Full-screen form frame shared by finance create and edit flows: a modal
/// header with Close and the title, a centred scroll body capped at 640, and
/// a pinned bottom bar with an optional secondary action and the primary
/// Save.
class FinanceFormScaffold extends StatelessWidget {
  const FinanceFormScaffold({
    required this.title,
    required this.children,
    required this.onSave,
    this.saving = false,
    this.saveLabel,
    this.secondaryAction,
    super.key,
  });

  final String title;
  final List<Widget> children;

  /// Null disables Save, for example while required fields are empty.
  final VoidCallback? onSave;
  final bool saving;
  final String? saveLabel;

  /// Outlined circle before Save, such as Delete on an edit form.
  final Widget? secondaryAction;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final l10n = context.l10n;
    return PopScope(
      canPop: !saving,
      child: Scaffold(
        backgroundColor: tokens.colorScheme.background,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    spacing: 8,
                    children: [
                      AppIconButton(
                        icon: const Icon(Icons.close_rounded),
                        tooltip: l10n.commonCancel,
                        onPressed: saving
                            ? null
                            : () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.title,
                          ),
                        ),
                      ),
                      const FinanceAmountVisibilityButton(),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final gutter = AppPageInsets.gutterOf(
                      context,
                      width: constraints.maxWidth,
                    );
                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: ListView(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: EdgeInsets.fromLTRB(gutter, 12, gutter, 24),
                          children: children,
                        ),
                      ),
                    );
                  },
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: tokens.colorScheme.border),
                  ),
                ),
                child: SafeArea(
                  top: false,
                  minimum: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Center(
                    heightFactor: 1,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 592),
                      child: Row(
                        spacing: 12,
                        children: [
                          ?secondaryAction,
                          Expanded(
                            child: AppButton.primary(
                              key: const ValueKey('finance-form-save'),
                              loading: saving,
                              onPressed: saving ? null : onSave,
                              child: Text(saveLabel ?? l10n.commonSave),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
