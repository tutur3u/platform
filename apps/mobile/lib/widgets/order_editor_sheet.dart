import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart'
    show AppSheetHandle;
import 'package:mobile/l10n/l10n.dart';

Future<void> showOrderEditorSheet(
  BuildContext context, {
  required String title,
  required WidgetBuilder builder,
}) => showAdaptiveSheet<void>(
  context: context,
  builder: (context) => OrderEditorSheet(title: title, child: builder(context)),
);

/// Shared Home/Apps ordering surface, above the floating app dock.
class OrderEditorSheet extends StatelessWidget {
  const OrderEditorSheet({required this.title, required this.child, super.key});
  final String title;
  final Widget child;

  @override
  // The shared sheet host draws the surface and handle.
  Widget build(BuildContext context) => Material(
    type: MaterialType.transparency,
    child: SafeArea(
      top: false,
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(context.l10n.commonDone),
                  ),
                ],
              ),
            ),
            Expanded(child: child),
          ],
        ),
      ),
    ),
  );
}
