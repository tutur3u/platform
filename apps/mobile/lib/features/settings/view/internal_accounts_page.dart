import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/repositories/internal_account_repository.dart';
import 'package:mobile/features/settings/view/internal_account_editor.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class InternalAccountsPage extends StatefulWidget {
  const InternalAccountsPage({this.repository, super.key});

  final InternalAccountRepository? repository;

  @override
  State<InternalAccountsPage> createState() => _InternalAccountsPageState();
}

class _InternalAccountsPageState extends State<InternalAccountsPage> {
  late final InternalAccountRepository _repository =
      widget.repository ?? InternalAccountRepository();
  final _search = TextEditingController();
  List<InternalAccount> _accounts = [];
  String? _cursor;
  bool _loading = true;
  bool _failed = false;
  int _generation = 0;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _generation++;
    _debounce?.cancel();
    _search.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _failed = false;
      if (!more) {
        _accounts = [];
        _cursor = null;
      }
    });
    try {
      final page = await _repository.list(
        query: _search.text,
        cursor: more ? _cursor : null,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _accounts = [..._accounts, ...page.accounts];
        _cursor = page.nextCursor;
      });
    } on Exception {
      if (!mounted || generation != _generation) return;
      setState(() {
        // Never retain an administrative directory after access is lost.
        _accounts = [];
        _cursor = null;
        _failed = true;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _edit(
    InternalAccount account,
    InternalAccountEdit action,
  ) async {
    final generation = _generation;
    final updated = await Navigator.of(context).push<InternalAccount>(
      MaterialPageRoute(
        builder: (_) => InternalAccountEditor(
          account: account,
          action: action,
          repository: _repository,
        ),
      ),
    );
    if (!mounted || updated == null || generation != _generation) return;
    setState(() {
      _accounts = [
        for (final item in _accounts)
          if (item.id == updated.id) updated else item,
      ];
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.adminAccountsTitle)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 960),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: l10n.adminAccountsSearch,
                    prefixIcon: const Icon(Icons.search),
                  ),
                  onChanged: (_) {
                    _debounce?.cancel();
                    // Invalidate in-flight results before debounce.
                    _generation++;
                    _debounce = Timer(
                      const Duration(milliseconds: 300),
                      () => unawaited(_load()),
                    );
                  },
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    children: [
                      if (_loading && _accounts.isEmpty)
                        const Center(child: NovaLoadingIndicator()),
                      if (_failed)
                        ListTile(
                          title: Text(l10n.adminAccountsUnavailable),
                          trailing: IconButton(
                            tooltip: l10n.commonRetry,
                            onPressed: _load,
                            icon: const Icon(Icons.refresh),
                          ),
                        ),
                      if (!_loading && !_failed && _accounts.isEmpty)
                        ListTile(title: Text(l10n.adminAccountsEmpty)),
                      for (final account in _accounts)
                        ExpansionTile(
                          key: ValueKey(account.id),
                          title: Text(account.displayName ?? account.email),
                          subtitle: Text(
                            [
                              account.email,
                              if (account.isDisabled)
                                l10n.adminAccountsDisabled
                              else
                                l10n.adminAccountsActive,
                            ].join('\n'),
                          ),
                          children: [
                            ListTile(
                              leading: const Icon(Icons.edit_outlined),
                              title: Text(l10n.adminAccountsEditProfile),
                              onTap: () =>
                                  _edit(account, InternalAccountEdit.profile),
                            ),
                            if (!account.isSelf) ...[
                              ListTile(
                                leading: const Icon(Icons.password_outlined),
                                title: Text(l10n.adminAccountsResetPassword),
                                onTap: () => _edit(
                                  account,
                                  InternalAccountEdit.password,
                                ),
                              ),
                              ListTile(
                                leading: const Icon(Icons.phonelink_lock),
                                title: Text(l10n.adminAccountsResetMfa),
                                onTap: () => _edit(
                                  account,
                                  InternalAccountEdit.authenticators,
                                ),
                              ),
                              ListTile(
                                leading: const Icon(
                                  Icons.verified_user_outlined,
                                ),
                                title: Text(
                                  account.mfaRequired
                                      ? l10n.adminAccountsOptionalMfa
                                      : l10n.adminAccountsRequireMfa,
                                ),
                                enabled: account.mfaPolicyAvailable,
                                onTap: () => _edit(
                                  account,
                                  InternalAccountEdit.mfaPolicy,
                                ),
                              ),
                              ListTile(
                                leading: Icon(
                                  account.isDisabled
                                      ? Icons.lock_open_outlined
                                      : Icons.lock_outline,
                                ),
                                title: Text(
                                  account.isDisabled
                                      ? l10n.adminAccountsEnableAccess
                                      : l10n.adminAccountsDisableAccess,
                                ),
                                onTap: () =>
                                    _edit(account, InternalAccountEdit.access),
                              ),
                            ],
                          ],
                        ),
                      if (_cursor != null)
                        TextButton(
                          onPressed: _loading ? null : () => _load(more: true),
                          child: Text(l10n.adminAccountsMore),
                        ),
                    ],
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
