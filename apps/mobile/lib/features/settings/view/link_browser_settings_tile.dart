import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class LinkBrowserSettingsTile extends StatefulWidget {
  const LinkBrowserSettingsTile({
    super.key,
    this.readPreference = readLinkBrowserPreference,
    this.savePreference = saveLinkBrowserPreference,
  });

  final Future<LinkBrowserPreference> Function() readPreference;
  final Future<void> Function(LinkBrowserPreference preference) savePreference;

  @override
  State<LinkBrowserSettingsTile> createState() =>
      _LinkBrowserSettingsTileState();
}

class _LinkBrowserSettingsTileState extends State<LinkBrowserSettingsTile> {
  LinkBrowserPreference? _preference;
  bool _failed = false;
  bool _busy = false;
  int _readRevision = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = ++_readRevision;
    try {
      final preference = await widget.readPreference();
      if (mounted && revision == _readRevision) {
        setState(() {
          _preference = preference;
          _failed = false;
        });
      }
    } on Object {
      if (mounted && revision == _readRevision) {
        setState(() => _failed = true);
      }
    }
  }

  Future<void> _choose() async {
    if (_busy) return;
    if (_preference == null) {
      await _load();
      return;
    }
    final l10n = context.l10n;
    final selected = await showSettingsChoiceDialog<LinkBrowserPreference>(
      context: context,
      title: l10n.settingsLinkBrowser,
      description: l10n.settingsLinkBrowserDescription,
      currentValue: _preference!,
      options: [
        SettingsChoiceOption(
          value: LinkBrowserPreference.builtIn,
          label: l10n.settingsLinkBrowserBuiltIn,
          icon: Icons.web_rounded,
        ),
        SettingsChoiceOption(
          value: LinkBrowserPreference.external,
          label: l10n.settingsLinkBrowserExternal,
          icon: Icons.open_in_new_rounded,
        ),
      ],
    );
    if (!mounted || selected == null || selected == _preference) return;
    _readRevision++;
    setState(() => _busy = true);
    try {
      await widget.savePreference(selected);
      if (mounted) {
        setState(() {
          _preference = selected;
          _failed = false;
        });
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
    return SettingsTile(
      key: const ValueKey('settings-link-browser-row'),
      grouped: true,
      icon: Icons.open_in_browser_rounded,
      title: l10n.settingsLinkBrowser,
      value: _failed
          ? l10n.settingsLinkBrowserError
          : _preference == null || _busy
          ? l10n.commonLoading
          : _preference == LinkBrowserPreference.builtIn
          ? l10n.settingsLinkBrowserBuiltIn
          : l10n.settingsLinkBrowserExternal,
      onTap: () => unawaited(_choose()),
    );
  }
}
