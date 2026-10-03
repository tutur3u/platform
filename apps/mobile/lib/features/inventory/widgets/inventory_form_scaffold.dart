import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// One content scroll, native modal navbar, and stable accessible form actions.
class InventoryFormScaffold extends StatefulWidget {
  const InventoryFormScaffold({
    required this.title,
    required this.primaryActionLabel,
    required this.onPrimaryPressed,
    required this.child,
    this.footerTop,
    this.onClose,
    this.isSaving = false,
    this.embedded = false,
    this.searchController,
    this.onSearchChanged,
    super.key,
  });

  final String title;
  final String primaryActionLabel;
  final VoidCallback? onPrimaryPressed;
  final Widget child;
  final Widget? footerTop;
  final VoidCallback? onClose;
  final bool isSaving;
  final bool embedded;
  final TextEditingController? searchController;
  final ValueChanged<String>? onSearchChanged;

  @override
  State<InventoryFormScaffold> createState() => _InventoryFormScaffoldState();
}

class _InventoryFormScaffoldState extends State<InventoryFormScaffold> {
  bool _searching = false;

  void _close() {
    if (widget.isSaving) return;
    if (widget.onClose != null) {
      widget.onClose!();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _toggleSearch() {
    if (_searching) {
      widget.searchController?.clear();
      widget.onSearchChanged?.call('');
    }
    setState(() => _searching = !_searching);
  }

  @override
  Widget build(BuildContext context) {
    final colors = shad.Theme.of(context).colorScheme;
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
    final body = Padding(
      padding: EdgeInsets.fromLTRB(16, 8, 16, widget.embedded ? 88 : 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.footerTop != null && widget.embedded) ...[
            widget.footerTop!,
            const SizedBox(height: 12),
          ],
          Expanded(child: widget.child),
        ],
      ),
    );
    if (widget.embedded) {
      return Stack(
        children: [
          body,
          if (widget.searchController != null)
            InventorySearchChrome(
              location: GoRouterState.of(context).matchedLocation,
              controller: widget.searchController!,
              hint: context.l10n.inventorySearchProducts,
              onChanged: widget.onSearchChanged ?? (_) {},
            ),
          ExtendedFab(
            icon: Icons.check,
            label: widget.primaryActionLabel,
            enabled: widget.onPrimaryPressed != null,
            loading: widget.isSaving,
            includeBottomSafeArea: false,
            onPressed: widget.onPrimaryPressed,
          ),
        ],
      );
    }
    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: _searching
              ? TextField(
                  controller: widget.searchController,
                  autofocus: true,
                  onChanged: widget.onSearchChanged,
                  decoration: InputDecoration(
                    hintText: context.l10n.inventorySearchProducts,
                  ),
                )
              : Text(widget.title),
          trailing: [
            if (widget.searchController != null)
              IconButton(
                tooltip: context.l10n.inventorySearchProducts,
                onPressed: _toggleSearch,
                icon: Icon(_searching ? Icons.search_off : Icons.search),
              ),
            IconButton(
              tooltip: context.l10n.commonCancel,
              onPressed: widget.isSaving ? null : _close,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ],
      footers: [
        if (!keyboardOpen)
          Container(
            margin: EdgeInsets.fromLTRB(
              12,
              8,
              12,
              12 + MediaQuery.paddingOf(context).bottom,
            ),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: colors.card,
              border: Border.all(color: colors.border),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.footerTop != null) ...[
                  widget.footerTop!,
                  const SizedBox(height: 12),
                ],
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 48,
                        child: shad.OutlineButton(
                          onPressed: widget.isSaving ? null : _close,
                          child: Text(
                            context.l10n.commonCancel,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 48),
                        child: shad.PrimaryButton(
                          onPressed: widget.isSaving
                              ? null
                              : widget.onPrimaryPressed,
                          child: widget.isSaving
                              ? const NovaLoadingIndicator(size: 20)
                              : Text(
                                  widget.primaryActionLabel,
                                  textAlign: TextAlign.center,
                                ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
      ],
      child: body,
    );
  }
}
