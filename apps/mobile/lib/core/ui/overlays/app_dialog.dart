import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Short alert body for [showAppDialog]. Replaces `shad.AlertDialog`.
///
/// Opened by a launcher without a surface, it draws the shared dialog frame
/// itself; prefer [showAppDialog] for the modal Back binding.
class AppDialog extends StatelessWidget {
  const AppDialog({
    required this.title,
    this.content,
    this.actions = const [],
    super.key,
  });

  final String title;
  final Widget? content;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final body = _body(context);
    if (AppSheetSurface.hosts(context)) return body;
    // A legacy launcher (Material or shadcn showDialog) gives no surface:
    // draw the same centred, width-capped, keyboard-safe dialog frame that
    // showAppDialog uses so the controls never float over the page.
    return AppSheetKeyboardInset(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: 440,
                maxHeight: MediaQuery.sizeOf(context).height * 0.85,
              ),
              child: AppSheetSurface(dialog: true, child: body),
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: title,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.md,
          AppSpacing.xl,
          AppSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(
                title,
                style: tokens.typography.h4.copyWith(color: c.foreground),
              ),
            ),
            if (content != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Flexible(
                child: SingleChildScrollView(
                  child: DefaultTextStyle.merge(
                    style: tokens.typography.small.copyWith(
                      color: c.mutedForeground,
                    ),
                    child: content!,
                  ),
                ),
              ),
            ],
            if (actions.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xl),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: actions,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Asks for confirmation; resolves `true` only when confirmed.
Future<bool> showAppConfirmDialog({
  required BuildContext context,
  required String title,
  required String confirmLabel,
  required String cancelLabel,
  String? message,
  bool destructive = false,
}) async {
  final confirmed = await showAppDialog<bool>(
    context: context,
    builder: (dialogContext) => AppDialog(
      title: title,
      content: message == null ? null : Text(message),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: Text(cancelLabel),
        ),
        AppButton(
          variant: destructive
              ? AppButtonVariant.destructive
              : AppButtonVariant.primary,
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}
