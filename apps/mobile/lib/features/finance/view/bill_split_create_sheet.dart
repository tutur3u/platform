import 'dart:math';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

String newBillSplitId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((value) => value.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class BillSplitCreateSheet extends StatefulWidget {
  const BillSplitCreateSheet({
    required this.workspaceId,
    required this.api,
    super.key,
  });

  final String workspaceId;
  final ApiClient api;

  @override
  State<BillSplitCreateSheet> createState() => _BillSplitCreateSheetState();
}

class _BillSplitCreateSheetState extends State<BillSplitCreateSheet> {
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final String _id = newBillSplitId();
  final _people = <_Person>[];
  final _excluded = <String>{};
  final _exactShares = <String, TextEditingController>{};
  final _percentageShares = <String, TextEditingController>{};
  late final Future<String> _currency = _loadCurrency();
  _Allocation _allocation = _Allocation.equal;
  String? _payer;
  Map<String, dynamic>? _preview;
  var _busy = false;
  var _failed = false;
  var _sharesInvalid = false;

  String get _workspacePath =>
      '/api/v1/workspaces/${Uri.encodeComponent(widget.workspaceId)}';

  Future<String> _loadCurrency() {
    final repository = FinanceRepository(apiClient: widget.api);
    return repository.getWorkspaceDefaultCurrency(widget.workspaceId);
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    for (final controller in [
      ..._exactShares.values,
      ..._percentageShares.values,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _edit() => setState(() {
    _preview = null;
    _failed = false;
    _sharesInvalid = false;
  });

  Map<String, Object>? _buildAllocation(
    List<String> included,
    int amount,
    int digits,
  ) {
    if (_allocation == _Allocation.equal) {
      return {'kind': _allocation.name, 'participantIds': included};
    }
    final percentage = _allocation == _Allocation.percentage;
    final controllers = percentage ? _percentageShares : _exactShares;
    final shares = <Map<String, Object>>[];
    var remaining = percentage ? 10000 : amount;
    for (final id in included) {
      final share = _parseBillSplitUnits(
        controllers[id]?.text ?? '',
        percentage ? 2 : digits,
      );
      if (share == null || share > remaining) return null;
      remaining -= share;
      shares.add({
        'participantId': id,
        (percentage ? 'basisPoints' : 'amountMinor'): share,
      });
    }
    return remaining == 0 ? {'kind': _allocation.name, 'shares': shares} : null;
  }

  Future<void> _addPerson() async {
    final labels = context.l10n;
    final person = await showAppSheet<_Person>(
      context: context,
      size: AppSheetSize.large,
      builder: (_) => FinanceDirectorySheet<_Person>(
        title: labels.financeBillSplitAddPerson,
        empty: labels.financeBillSplitPeopleEmpty,
        fetch: (query, page) async {
          if (query.length < 2 || page != 1) {
            return (items: <_Person>[], count: 0);
          }
          final rows = await widget.api.getJsonList(
            '$_workspacePath/people?q=${Uri.encodeQueryComponent(query)}&limit=12',
          );
          final people = rows
              .whereType<Map<String, dynamic>>()
              .where((row) {
                final kind = row['kind'];
                final id = row['id'];
                return id is String &&
                    (kind == 'member' || kind == 'contact') &&
                    !_people.any(
                      (person) =>
                          person.directoryId == id && person.kind == kind,
                    );
              })
              .map(
                (row) => _Person(
                  id: newBillSplitId(),
                  directoryId: row['id'] as String,
                  name:
                      (row['displayName'] as String?) ??
                      labels.financeBillSplitUnnamed,
                  kind: row['kind'] as String,
                ),
              )
              .toList();
          return (items: people, count: people.length);
        },
        row: (context, person, _) => AppRichRow(
          title: person.name,
          leading: const AppIconTile(icon: LucideIcons.userRound),
          onTap: () => Navigator.of(context).pop(person),
        ),
      ),
    );
    if (!mounted || person == null || _people.length >= 100) return;
    _people.add(person);
    _exactShares[person.id] = TextEditingController();
    _percentageShares[person.id] = TextEditingController();
    _payer ??= person.id;
    _edit();
  }

  Future<void> _submit(String currency) async {
    if (_busy) return;
    final digits =
        NumberFormat.simpleCurrency(name: currency).decimalDigits ?? 2;
    final amount = billSplitMinorAmount(_amount.text, digits);
    final title = _title.text.trim();
    final payer = _payer;
    final included = _people
        .map((person) => person.id)
        .where((id) => !_excluded.contains(id))
        .toList();
    if (amount == null || title.isEmpty || payer == null || included.isEmpty) {
      setState(() => _failed = true);
      return;
    }
    final allocation = _buildAllocation(included, amount, digits);
    if (allocation == null) {
      setState(() => _sharesInvalid = true);
      return;
    }
    final preview = _preview == null;
    setState(() {
      _busy = true;
      _failed = false;
    });
    final currencyValue = {'code': currency, 'minorDigits': digits};
    try {
      final response = await widget.api.postJson(
        '$_workspacePath/finance/bill-splits${preview ? '?preview=1' : ''}',
        {
          'id': _id,
          'title': title,
          'currency': currencyValue,
          'finalized': true,
          'participants': [for (final person in _people) person.json],
          'expenses': [
            {
              'label': title,
              'currency': currencyValue,
              'attendeeIds': included,
              'lines': [
                {
                  'label': title,
                  'amountMinor': amount,
                  'allocation': allocation,
                },
              ],
              'payments': [
                {'participantId': payer, 'amountMinor': amount},
              ],
            },
          ],
        },
      );
      if (!mounted) return;
      if (preview) {
        setState(() => _preview = response['ledger'] as Map<String, dynamic>);
      } else {
        Navigator.of(context).pop(response['id'] as String);
      }
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder(
      future: _currency,
      builder: (context, snapshot) {
        final currency = snapshot.data;
        final currencyFormat = NumberFormat.simpleCurrency(name: currency);
        final multiplier = pow(10, currencyFormat.decimalDigits ?? 2);
        return AppSheetScaffold(
          title: l10n.financeBillSplitNew,
          actions: [
            if (_sharesInvalid)
              AppStateMessage.inline(
                icon: LucideIcons.circleAlert,
                tone: AppTone.destructive,
                title: _allocation == _Allocation.percentage
                    ? l10n.financeBillSplitPercentageTotal
                    : l10n.financeBillSplitExactTotal,
              ),
            AppButton.primary(
              onPressed: currency != null && _people.length >= 2 && !_busy
                  ? () => _submit(currency)
                  : null,
              child: Text(
                _preview == null
                    ? l10n.financeBillSplitPreview
                    : l10n.commonSave,
              ),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppLayout.itemGap,
            children: [
              AppTextField(
                controller: _title,
                label: l10n.financeBillSplitName,
                placeholder: l10n.financeBillSplitNamePlaceholder,
                maxLength: 120,
                enabled: !_busy,
                onChanged: (_) => _edit(),
              ),
              _SplitNumberField(
                controller: _amount,
                label: l10n.financeBillSplitAmount(currency ?? ''),
                privateAmount: true,
                enabled: !_busy,
                onChanged: _edit,
              ),
              AppButton.secondary(
                onPressed: _busy || _people.length >= 100 ? null : _addPerson,
                child: Text(l10n.financeBillSplitAddPerson),
              ),
              if (_people.length >= 2)
                AppSelect<_Allocation>(
                  title: l10n.financeBillSplitMethod,
                  value: _allocation,
                  onChanged: _busy
                      ? null
                      : (value) {
                          if (!mounted || _allocation == value) return;
                          _allocation = value;
                          _edit();
                        },
                  options: [
                    AppSelectOption(
                      value: _Allocation.equal,
                      label: l10n.financeBillSplitEqual,
                    ),
                    AppSelectOption(
                      value: _Allocation.exact,
                      label: l10n.financeBillSplitExact,
                    ),
                    AppSelectOption(
                      value: _Allocation.percentage,
                      label: l10n.financeBillSplitPercentage,
                    ),
                  ],
                ),
              if (_people.isNotEmpty)
                AppGroupedCard(
                  children: [
                    for (final person in _people)
                      AppRichRow(
                        title: person.name,
                        subtitle: _payer == person.id
                            ? l10n.financeBillSplitPayer
                            : null,
                        onTap: _busy
                            ? null
                            : () {
                                _payer = person.id;
                                _edit();
                              },
                        trailing: AppCheckbox(
                          value: !_excluded.contains(person.id),
                          onChanged: _busy
                              ? null
                              : (checked) {
                                  if (checked ?? false) {
                                    _excluded.remove(person.id);
                                  } else {
                                    _excluded.add(person.id);
                                  }
                                  _edit();
                                },
                        ),
                      ),
                  ],
                ),
              if (_allocation != _Allocation.equal)
                for (final person in _people)
                  if (!_excluded.contains(person.id))
                    _shareField(person, l10n, currency),
              if (_preview case final preview?)
                AppGroupedSection(
                  caption: l10n.financeBillSplitBalances,
                  children: [
                    for (final row
                        in (preview['balances'] as List)
                            .whereType<Map<String, dynamic>>())
                      AppRichRow(
                        title: _people
                            .firstWhere(
                              (person) => person.id == row['participantId'],
                            )
                            .name,
                        trailing: FinanceAmountText(
                          (row['amountMinor'] as num) / multiplier,
                          currency ?? '',
                        ),
                      ),
                  ],
                ),
              if (_failed || snapshot.hasError)
                AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _shareField(_Person person, AppLocalizations l10n, String? currency) {
    final percentage = _allocation == _Allocation.percentage;
    final shares = percentage ? _percentageShares : _exactShares;
    return _SplitNumberField(
      key: ValueKey((_allocation, person.id)),
      controller: shares[person.id]!,
      label: percentage
          ? l10n.financeBillSplitPercentageShare(person.name)
          : l10n.financeBillSplitExactShare(person.name, currency ?? ''),
      privateAmount: !percentage,
      enabled: !_busy,
      onChanged: _edit,
    );
  }
}

enum _Allocation { equal, exact, percentage }

int? billSplitMinorAmount(String value, int minorDigits) {
  final minor = _parseBillSplitUnits(value, minorDigits);
  return minor == 0 ? null : minor;
}

int? _parseBillSplitUnits(String value, int minorDigits) {
  final match = RegExp(r'^([0-9]+)(?:[.,]([0-9]+))?$').firstMatch(value.trim());
  if (match == null) return null;
  final fraction = match.group(2) ?? '';
  if (fraction.length > minorDigits) return null;
  final minor = int.tryParse(
    '${match.group(1)}${fraction.padRight(minorDigits, '0')}',
  );
  if (minor == null || minor > 9007199254740991) return null;
  return minor;
}

class _SplitNumberField extends StatefulWidget {
  const _SplitNumberField({
    required this.controller,
    required this.label,
    required this.privateAmount,
    required this.enabled,
    required this.onChanged,
    super.key,
  });

  final TextEditingController controller;
  final String label;
  final bool privateAmount;
  final bool enabled;
  final VoidCallback onChanged;

  @override
  State<_SplitNumberField> createState() => _SplitNumberFieldState();
}

class _SplitNumberFieldState extends State<_SplitNumberField> {
  var _focused = false;

  @override
  Widget build(BuildContext context) {
    final privateAmount =
        widget.privateAmount && !financeAmountsVisible(context);
    return Focus(
      onFocusChange: (focused) => setState(() => _focused = focused),
      child: AppTextField(
        controller: widget.controller,
        label: widget.label,
        placeholder: '0',
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        maxLength: 24,
        enabled: widget.enabled,
        obscureText: privateAmount && !_focused,
        onChanged: (_) => widget.onChanged(),
      ),
    );
  }
}

class _Person {
  const _Person({
    required this.id,
    required this.directoryId,
    required this.name,
    required this.kind,
  });
  final String id;
  final String directoryId;
  final String name;
  final String kind;

  Map<String, String> get json => {
    'id': id,
    'kind': kind,
    'displayName': name,
    (kind == 'contact' ? 'contactId' : 'memberId'): directoryId,
  };
}
