import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/features/storefront/storefront_labels.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';

Future<Map<String, dynamic>?> showStorefrontEditorSheet(
  BuildContext context, {
  Storefront? storefront,
}) => showAdaptiveSheet<Map<String, dynamic>>(
  context: context,
  enableDrag: false,
  barrierDismissible: false,
  builder: (_) => _StorefrontEditor(storefront: storefront),
);

class _StorefrontEditor extends StatefulWidget {
  const _StorefrontEditor({this.storefront});

  final Storefront? storefront;

  @override
  State<_StorefrontEditor> createState() => _StorefrontEditorState();
}

class _StorefrontEditorState extends State<_StorefrontEditor> {
  late final TextEditingController _name;
  late final TextEditingController _slug;
  late final TextEditingController _description;
  late final TextEditingController _currency;
  late String _status;
  late String _visibility;
  late String _checkoutMode;
  late String _themePreset;
  late String _layoutStyle;
  late String _surfaceStyle;
  late String _cornerStyle;
  late bool _showInventoryBadges;
  late bool _analyticsEnabled;
  bool _slugEdited = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final storefront = widget.storefront;
    _name = TextEditingController(text: storefront?.name);
    _slug = TextEditingController(text: storefront?.slug);
    _description = TextEditingController(text: storefront?.description);
    _currency = TextEditingController(text: storefront?.currency ?? 'USD');
    _status = storefront?.status ?? 'draft';
    _visibility = storefront?.visibility ?? 'private';
    _checkoutMode = storefront?.checkoutMode ?? 'disabled';
    _themePreset = storefront?.themePreset ?? 'minimal';
    _layoutStyle = storefront?.layoutStyle ?? 'grid';
    _surfaceStyle = storefront?.surfaceStyle ?? 'solid';
    _cornerStyle = storefront?.cornerStyle ?? 'rounded';
    _showInventoryBadges = storefront?.showInventoryBadges ?? true;
    _analyticsEnabled = storefront?.analyticsEnabled ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _slug.dispose();
    _description.dispose();
    _currency.dispose();
    super.dispose();
  }

  String _slugify(String value) => value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp('[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');

  void _submit() {
    final name = _name.text.trim();
    final slug = _slug.text.trim();
    final currency = _currency.text.trim().toUpperCase();
    if (name.isEmpty || slug.length < 2 || currency.length != 3) {
      setState(() => _error = context.l10n.storefrontValidationError);
      return;
    }

    Navigator.of(context).pop(<String, dynamic>{
      'name': name,
      'slug': slug,
      'description': _description.text.trim().isEmpty
          ? null
          : _description.text.trim(),
      'currency': currency,
      'status': _status,
      'visibility': _visibility,
      'checkoutMode': _checkoutMode,
      'themePreset': _themePreset,
      'layoutStyle': _layoutStyle,
      'surfaceStyle': _surfaceStyle,
      'cornerStyle': _cornerStyle,
      'showInventoryBadges': _showInventoryBadges,
      'analyticsEnabled': _analyticsEnabled,
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppDialogScaffold(
      title: widget.storefront == null
          ? l10n.storefrontCreate
          : l10n.storefrontEdit,
      description: l10n.storefrontEditorSubtitle,
      icon: Icons.storefront_outlined,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        FilledButton(onPressed: _submit, child: Text(l10n.commonSave)),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _name,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: l10n.storefrontName),
            onChanged: (value) {
              if (!_slugEdited) _slug.text = _slugify(value);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _slug,
            textInputAction: TextInputAction.next,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: l10n.storefrontSlug,
              prefixText: 'storefront.tuturuuu.com/',
            ),
            onChanged: (_) => _slugEdited = true,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.storefrontDescription),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _currency,
            textCapitalization: TextCapitalization.characters,
            maxLength: 3,
            decoration: InputDecoration(labelText: l10n.storefrontCurrency),
          ),
          const SizedBox(height: 4),
          _ChoiceField(
            label: l10n.storefrontStatus,
            value: _status,
            values: const ['draft', 'published', 'paused', 'archived'],
            valueLabel: (value) => storefrontStatusLabel(l10n, value),
            onChanged: (value) => setState(() => _status = value),
          ),
          _ChoiceField(
            label: l10n.storefrontVisibility,
            value: _visibility,
            values: const ['private', 'public'],
            valueLabel: (value) => storefrontVisibilityLabel(l10n, value),
            onChanged: (value) => setState(() => _visibility = value),
          ),
          _ChoiceField(
            label: l10n.storefrontCheckoutMode,
            value: _checkoutMode,
            values: const ['disabled', 'polar', 'square_terminal', 'simulated'],
            onChanged: (value) => setState(() => _checkoutMode = value),
          ),
          _ChoiceField(
            label: l10n.storefrontTheme,
            value: _themePreset,
            values: const ['minimal', 'editorial', 'boutique', 'catalog'],
            onChanged: (value) => setState(() => _themePreset = value),
          ),
          _ChoiceField(
            label: l10n.storefrontLayout,
            value: _layoutStyle,
            values: const ['grid', 'list', 'feature'],
            onChanged: (value) => setState(() => _layoutStyle = value),
          ),
          _ChoiceField(
            label: l10n.storefrontSurface,
            value: _surfaceStyle,
            values: const ['solid', 'soft', 'glass'],
            onChanged: (value) => setState(() => _surfaceStyle = value),
          ),
          _ChoiceField(
            label: l10n.storefrontCorners,
            value: _cornerStyle,
            values: const ['compact', 'rounded', 'soft'],
            onChanged: (value) => setState(() => _cornerStyle = value),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.storefrontInventoryBadges),
            value: _showInventoryBadges,
            onChanged: (value) => setState(() => _showInventoryBadges = value),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.storefrontAnalytics),
            value: _analyticsEnabled,
            onChanged: (value) => setState(() => _analyticsEnabled = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChoiceField extends StatelessWidget {
  const _ChoiceField({
    required this.label,
    required this.value,
    required this.values,
    required this.onChanged,
    this.valueLabel,
  });

  final String label;
  final String value;
  final List<String> values;
  final ValueChanged<String> onChanged;
  final String Function(String value)? valueLabel;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: values
          .map(
            (item) => DropdownMenuItem(
              value: item,
              child: Text(valueLabel?.call(item) ?? item),
            ),
          )
          .toList(growable: false),
      onChanged: (value) {
        if (value != null) onChanged(value);
      },
    ),
  );
}
