import 'package:flutter/material.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/utils/supported_currencies.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/utils/wallet_images.dart';
import 'package:mobile/features/finance/widgets/currency_picker_dialog.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart'
    show financeAmountsVisible;
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_image_picker_sheet.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'wallet_dialog_fields.dart';

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
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _limitController;
  late final TextEditingController _statementDateController;
  late final TextEditingController _paymentDateController;
  late String _type;
  late String _currency;
  String? _icon;
  String? _imageSrc;
  String? _nameError;
  String? _descriptionError;
  String? _limitError;
  String? _statementDateError;
  String? _paymentDateError;
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

    return FinanceFullscreenFormScaffold(
      showAmountVisibility: _type == 'CREDIT',
      title: widget.wallet == null
          ? l10n.financeCreateWallet
          : l10n.financeEditWallet,
      subtitle: l10n.financeWalletDialogSubtitle,
      primaryActionLabel: widget.wallet == null
          ? context.l10n.financeCreateWallet
          : context.l10n.timerSave,
      onPrimaryPressed: _isSaving ? null : _saveWallet,
      onClose: _isSaving ? null : () => Navigator.of(context).pop(false),
      isSaving: _isSaving,
      child: ListView(
        children: [
          _WalletPreviewCard(
            name: _nameController.text.trim().isEmpty
                ? l10n.financeCreateWallet
                : _nameController.text.trim(),
            subtitle: '${_currencyLabel(_currency)} ($_currency)',
            typeLabel: _type == 'CREDIT'
                ? l10n.financeWalletTypeCredit
                : l10n.financeWalletTypeStandard,
            icon: _icon,
            imageSrc: _imageSrc,
            fallbackIcon: previewIcon,
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: l10n.financeWalletName,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _WalletTextField(
                  controller: _nameController,
                  placeholder: l10n.financeWalletName,
                  autofocus: true,
                  errorText: _nameError,
                  onChanged: _onNameChanged,
                ),
                const shad.Gap(10),
                _WalletFieldLabel(label: l10n.financeDescription),
                const shad.Gap(4),
                _WalletTextArea(
                  controller: _descriptionController,
                  placeholder: l10n.financeDescription,
                  errorText: _descriptionError,
                  onChanged: _onDescriptionChanged,
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: l10n.financeType,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FinanceSegmentedRow(
                  leftLabel: l10n.financeWalletTypeStandard,
                  rightLabel: l10n.financeWalletTypeCredit,
                  leftSelected: _type == 'STANDARD',
                  onLeftPressed: () => _setWalletType('STANDARD'),
                  onRightPressed: () => _setWalletType('CREDIT'),
                ),
                const shad.Gap(10),
                _WalletPickerSurface(
                  label: l10n.financeWalletCurrency,
                  title: '${_currencyLabel(_currency)} ($_currency)',
                  icon: Icons.currency_exchange_rounded,
                  onPressed: _pickCurrency,
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: l10n.financeWalletIconOrImage,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _WalletVisualSurface(
                  label: visualName ?? _icon ?? l10n.financeWalletNoVisual,
                  icon: _icon,
                  imageSrc: _imageSrc,
                  fallbackIcon: previewIcon,
                  onPickImage: _pickWalletImage,
                  onClear: (_icon != null || _imageSrc != null)
                      ? () {
                          setState(() {
                            _icon = null;
                            _imageSrc = null;
                          });
                        }
                      : null,
                ),
                const shad.Gap(10),
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
              ],
            ),
          ),
          if (_type == 'CREDIT') ...[
            const shad.Gap(12),
            FinanceFormSection(
              title: l10n.financeWalletCreditDetails,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _WalletFieldLabel(label: l10n.financeWalletCreditLimit),
                  const shad.Gap(4),
                  _WalletTextField(
                    controller: _limitController,
                    obscureText: !financeAmountsVisible(context),
                    placeholder: '0.00',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    errorText: _limitError,
                    onChanged: _onLimitChanged,
                  ),
                  const shad.Gap(10),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _WalletFieldLabel(
                              label: l10n.financeWalletStatementDate,
                            ),
                            const shad.Gap(4),
                            _WalletTextField(
                              controller: _statementDateController,
                              placeholder: '1-31',
                              keyboardType: TextInputType.number,
                              errorText: _statementDateError,
                              onChanged: _onStatementDateChanged,
                            ),
                          ],
                        ),
                      ),
                      const shad.Gap(10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _WalletFieldLabel(
                              label: l10n.financeWalletPaymentDate,
                            ),
                            const shad.Gap(4),
                            _WalletTextField(
                              controller: _paymentDateController,
                              placeholder: '1-31',
                              keyboardType: TextInputType.number,
                              errorText: _paymentDateError,
                              onChanged: _onPaymentDateChanged,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
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
    if (!_validateForm()) {
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
    final selected = await showFinanceModal<String>(
      context: context,
      builder: (_) => CurrencyPickerDialog(initialCurrencyCode: _currency),
    );

    if (!mounted || selected == null) {
      return;
    }

    setState(() => _currency = selected);
  }

  String _currencyLabel(String code) {
    return getSupportedCurrency(code)?.name ?? code;
  }

  void _onNameChanged(String value) {
    setState(() {
      _nameError = _validateName(value);
    });
  }

  void _onDescriptionChanged(String value) {
    setState(() {
      _descriptionError = _validateDescription(value);
    });
  }

  void _onLimitChanged(String value) {
    setState(() {
      _limitError = _validateCreditLimit(value);
    });
  }

  void _onStatementDateChanged(String value) {
    setState(() {
      _statementDateError = _validateCreditDate(value);
    });
  }

  void _onPaymentDateChanged(String value) {
    setState(() {
      _paymentDateError = _validateCreditDate(value);
    });
  }

  void _setWalletType(String value) {
    setState(() {
      _type = value;
      if (_type != 'CREDIT') {
        _limitError = null;
        _statementDateError = null;
        _paymentDateError = null;
      } else {
        _limitError = _validateCreditLimit(_limitController.text);
        _statementDateError = _validateCreditDate(
          _statementDateController.text,
        );
        _paymentDateError = _validateCreditDate(_paymentDateController.text);
      }
    });
  }

  bool _validateForm() {
    final nameError = _validateName(_nameController.text);
    final descriptionError = _validateDescription(_descriptionController.text);
    final limitError = _validateCreditLimit(_limitController.text);
    final statementDateError = _validateCreditDate(
      _statementDateController.text,
    );
    final paymentDateError = _validateCreditDate(_paymentDateController.text);

    setState(() {
      _nameError = nameError;
      _descriptionError = descriptionError;
      _limitError = limitError;
      _statementDateError = statementDateError;
      _paymentDateError = paymentDateError;
    });

    return nameError == null &&
        descriptionError == null &&
        limitError == null &&
        statementDateError == null &&
        paymentDateError == null;
  }

  String? _validateName(String value) {
    if (value.trim().isEmpty) {
      return context.l10n.financeWalletNameRequired;
    }
    return null;
  }

  String? _validateDescription(String value) {
    if (value.length > 500) {
      return context.l10n.financeWalletDescriptionTooLong;
    }
    return null;
  }

  String? _validateCreditLimit(String value) {
    if (_type != 'CREDIT') {
      return null;
    }
    final parsed = double.tryParse(value.trim());
    if (parsed == null || parsed <= 0) {
      return context.l10n.financeWalletCreditLimitRequired;
    }
    return null;
  }

  String? _validateCreditDate(String value) {
    if (_type != 'CREDIT') {
      return null;
    }
    final parsed = int.tryParse(value.trim());
    if (parsed == null || parsed < 1 || parsed > 31) {
      return context.l10n.financeWalletDateRequired;
    }
    return null;
  }
}
