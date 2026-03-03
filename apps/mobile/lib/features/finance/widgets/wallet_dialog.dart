import 'package:flutter/material.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/supported_currencies.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/utils/wallet_images.dart';
import 'package:mobile/features/finance/widgets/currency_picker_dialog.dart';
import 'package:mobile/features/finance/widgets/wallet_image_picker_sheet.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletDialog extends StatefulWidget {
  const WalletDialog({
    required this.wsId,
    required this.repository,
    this.wallet,
    super.key,
  });

  final String wsId;
  final FinanceRepository repository;
  final Wallet? wallet;

  @override
  State<WalletDialog> createState() => _WalletDialogState();
}

class _WalletDialogState extends State<WalletDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _limitController;
  late final TextEditingController _statementDateController;
  late final TextEditingController _paymentDateController;
  late String _type;
  late String _currency;
  String? _icon;
  String? _imageSrc;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final wallet = widget.wallet;
    _nameController = TextEditingController(text: wallet?.name ?? '');
    _descriptionController = TextEditingController(
      text: wallet?.description ?? '',
    );
    final initialCurrency = (wallet?.currency ?? 'USD').toUpperCase();
    _currency = isSupportedCurrencyCode(initialCurrency)
        ? initialCurrency
        : 'USD';
    _limitController = TextEditingController(
      text: wallet?.limit?.toString() ?? '',
    );
    _statementDateController = TextEditingController(
      text: wallet?.statementDate?.toString() ?? '',
    );
    _paymentDateController = TextEditingController(
      text: wallet?.paymentDate?.toString() ?? '',
    );
    _type = wallet?.type == 'CREDIT' ? 'CREDIT' : 'STANDARD';
    _icon = wallet?.icon;
    _imageSrc = wallet?.imageSrc;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final visualName = findWalletImageBySrc(_imageSrc)?.name;
    final previewIcon = resolvePlatformIcon(
      _icon,
      fallback: Icons.wallet_outlined,
    );

    return shad.AlertDialog(
      title: Text(
        widget.wallet == null
            ? l10n.financeCreateWallet
            : l10n.financeEditWallet,
      ),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l10n.financeWalletName),
                const shad.Gap(4),
                TextFormField(
                  controller: _nameController,
                  autofocus: true,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return context.l10n.financeWalletNameRequired;
                    }
                    return null;
                  },
                ),
                const shad.Gap(12),
                Text(l10n.financeDescription),
                const shad.Gap(4),
                TextFormField(
                  controller: _descriptionController,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 2,
                  validator: (value) {
                    if (value != null && value.length > 500) {
                      return context.l10n.financeWalletDescriptionTooLong;
                    }
                    return null;
                  },
                ),
                const shad.Gap(12),
                Text(l10n.financeType),
                const shad.Gap(4),
                Row(
                  children: [
                    Expanded(
                      child: _type == 'STANDARD'
                          ? shad.PrimaryButton(
                              onPressed: () =>
                                  setState(() => _type = 'STANDARD'),
                              child: Text(l10n.financeWalletTypeStandard),
                            )
                          : shad.OutlineButton(
                              onPressed: () =>
                                  setState(() => _type = 'STANDARD'),
                              child: Text(l10n.financeWalletTypeStandard),
                            ),
                    ),
                    const shad.Gap(8),
                    Expanded(
                      child: _type == 'CREDIT'
                          ? shad.PrimaryButton(
                              onPressed: null,
                              child: Text(l10n.financeWalletTypeCredit),
                            )
                          : shad.OutlineButton(
                              onPressed: null,
                              child: Text(l10n.financeWalletTypeCredit),
                            ),
                    ),
                  ],
                ),
                const shad.Gap(12),
                Text(l10n.financeWalletCurrency),
                const shad.Gap(4),
                shad.OutlineButton(
                  onPressed: _pickCurrency,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${_currencyLabel(_currency)} ($_currency)',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(Icons.expand_more, size: 16),
                    ],
                  ),
                ),
                const shad.Gap(12),
                Text(l10n.financeWalletIconOrImage),
                const shad.Gap(6),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: shad.Theme.of(context).colorScheme.border,
                    ),
                  ),
                  child: Row(
                    children: [
                      WalletVisualAvatar(
                        icon: _icon,
                        imageSrc: _imageSrc,
                        fallbackIcon: previewIcon,
                        size: 34,
                      ),
                      const shad.Gap(10),
                      Expanded(
                        child: Text(
                          visualName ?? _icon ?? l10n.financeWalletNoVisual,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: shad.Theme.of(context).typography.small,
                        ),
                      ),
                      shad.OutlineButton(
                        onPressed: _pickWalletImage,
                        child: Text(l10n.financeWalletPickImage),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(8),
                PlatformIconPickerField(
                  value: _icon,
                  title: l10n.financeSelectIcon,
                  searchPlaceholder: l10n.financeSearchIcons,
                  emptyText: l10n.financeNoIconsFound,
                  onChanged: (value) {
                    setState(() {
                      _icon = value;
                      if (value != null) {
                        _imageSrc = null;
                      }
                    });
                  },
                ),
                if (_icon != null || _imageSrc != null) ...[
                  const shad.Gap(8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: shad.GhostButton(
                      onPressed: () {
                        setState(() {
                          _icon = null;
                          _imageSrc = null;
                        });
                      },
                      child: Text(l10n.financeWalletClearVisual),
                    ),
                  ),
                ],
                if (_type == 'CREDIT') ...[
                  const shad.Gap(12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: shad.Theme.of(context).colorScheme.border,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          l10n.financeWalletCreditDetails,
                          style: shad.Theme.of(context).typography.small
                              .copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        const shad.Gap(8),
                        Text(l10n.financeWalletCreditLimit),
                        const shad.Gap(4),
                        TextFormField(
                          controller: _limitController,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (_type != 'CREDIT') return null;
                            final parsed = double.tryParse(value?.trim() ?? '');
                            if (parsed == null || parsed <= 0) {
                              return context
                                  .l10n
                                  .financeWalletCreditLimitRequired;
                            }
                            return null;
                          },
                        ),
                        const shad.Gap(8),
                        Text(l10n.financeWalletStatementDate),
                        const shad.Gap(4),
                        TextFormField(
                          controller: _statementDateController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (_type != 'CREDIT') return null;
                            final parsed = int.tryParse(value?.trim() ?? '');
                            if (parsed == null || parsed < 1 || parsed > 31) {
                              return context.l10n.financeWalletDateRequired;
                            }
                            return null;
                          },
                        ),
                        const shad.Gap(8),
                        Text(l10n.financeWalletPaymentDate),
                        const shad.Gap(4),
                        TextFormField(
                          controller: _paymentDateController,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (_type != 'CREDIT') return null;
                            final parsed = int.tryParse(value?.trim() ?? '');
                            if (parsed == null || parsed < 1 || parsed > 31) {
                              return context.l10n.financeWalletDateRequired;
                            }
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: _isSaving ? null : () => Navigator.of(context).pop(false),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _isSaving ? null : _saveWallet,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: shad.CircularProgressIndicator(),
                )
              : Text(
                  widget.wallet == null
                      ? context.l10n.financeCreateWallet
                      : context.l10n.timerSave,
                ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _limitController.dispose();
    _statementDateController.dispose();
    _paymentDateController.dispose();
    super.dispose();
  }

  Future<void> _pickWalletImage() async {
    final selectedImage = await showAdaptiveSheet<String?>(
      context: context,
      maxDialogWidth: 760,
      builder: (_) => WalletImagePickerSheet(initialImageSrc: _imageSrc),
    );

    if (!mounted || selectedImage == null) return;

    setState(() {
      _imageSrc = selectedImage.isEmpty ? null : selectedImage;
      if (_imageSrc != null) {
        _icon = null;
      }
    });
  }

  Future<void> _saveWallet() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;

    final name = _nameController.text.trim();
    final description = _descriptionController.text.trim();
    final currency = _currency;
    final limit = _type == 'CREDIT'
        ? double.tryParse(_limitController.text.trim())
        : null;
    final statementDate = _type == 'CREDIT'
        ? int.tryParse(_statementDateController.text.trim())
        : null;
    final paymentDate = _type == 'CREDIT'
        ? int.tryParse(_paymentDateController.text.trim())
        : null;

    setState(() => _isSaving = true);
    try {
      if (widget.wallet == null) {
        await widget.repository.createWallet(
          wsId: widget.wsId,
          name: name,
          description: description.isEmpty ? null : description,
          type: _type,
          currency: currency,
          icon: _icon,
          imageSrc: _imageSrc,
          limit: limit,
          statementDate: statementDate,
          paymentDate: paymentDate,
        );
      } else {
        await widget.repository.updateWallet(
          wsId: widget.wsId,
          walletId: widget.wallet!.id,
          name: name,
          description: description.isEmpty ? null : description,
          type: _type,
          currency: currency,
          icon: _icon,
          imageSrc: _imageSrc,
          limit: limit,
          statementDate: statementDate,
          paymentDate: paymentDate,
        );
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message.trim();
      final details = message.isEmpty || message == 'Request failed'
          ? context.l10n.commonSomethingWentWrong
          : message;

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            title: Text(ctx.l10n.commonSomethingWentWrong),
            content: Text(details),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _pickCurrency() async {
    final selected = await shad.showDialog<String>(
      context: context,
      builder: (_) => CurrencyPickerDialog(
        initialCurrencyCode: _currency,
      ),
    );

    if (!mounted || selected == null) {
      return;
    }

    setState(() => _currency = selected);
  }

  String _currencyLabel(String code) {
    return getSupportedCurrency(code)?.name ?? code;
  }
}
