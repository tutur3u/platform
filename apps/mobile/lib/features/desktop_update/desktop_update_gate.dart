import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/features/desktop_update/desktop_installer.dart';
import 'package:mobile/features/desktop_update/desktop_release.dart';
import 'package:mobile/features/desktop_update/desktop_update_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

const _releaseRun = String.fromEnvironment('DESKTOP_RELEASE_RUN_ID');
const _pendingKey = 'desktop_update_install_on_launch';

/// Enabled only in a desktop release built by the publishing workflow. Checking
/// and downloading never block startup or use an account session/token.
class DesktopUpdateGate extends StatefulWidget {
  const DesktopUpdateGate({required this.child, super.key});
  final Widget child;

  @override
  State<DesktopUpdateGate> createState() => _DesktopUpdateGateState();
}

class _DesktopUpdateGateState extends State<DesktopUpdateGate> {
  DesktopUpdateRepository? _repository;
  DesktopRelease? _release;
  Timer? _timer;
  bool _busy = false;
  bool _scheduled = false;
  bool _failed = false;
  String? _dismissed;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb &&
        _releaseRun.isNotEmpty &&
        (Platform.isMacOS || Platform.isWindows || Platform.isLinux)) {
      unawaited(_check(firstLaunch: true));
      _timer = Timer.periodic(
        const Duration(hours: 6),
        (_) => unawaited(_check()),
      );
    }
  }

  Future<void> _check({bool firstLaunch = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final support = await getApplicationSupportDirectory();
      if (!mounted) return;
      final repository = _repository ??= DesktopUpdateRepository(
        directory: Directory('${support.path}/desktop-updates'),
      );
      final platform = Platform.isMacOS ? 'macos' : Platform.operatingSystem;
      final release = await repository.latest(platform);
      final installed = await PackageInfo.fromPlatform();
      if (release == null ||
          !release.newerThan(installed.version, _releaseRun)) {
        return;
      }
      await repository.download(release);
      if (!mounted) return;
      final preferences = await SharedPreferences.getInstance();
      final scheduled = preferences.getString(_pendingKey) == release.tag;
      if (!mounted) return;
      setState(() {
        _release = release;
        _scheduled = scheduled;
        _failed = false;
      });
      if (firstLaunch && scheduled) {
        _busy = false;
        await _install();
      }
    } on Object {
      // Offline/rate-limited checks are retried later without interrupting work.
      // An already visible update retains its retry control.
      if (mounted && _release != null) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _install() async {
    final release = _release;
    final repository = _repository;
    if (_busy || release == null || repository == null) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final preferences = await SharedPreferences.getInstance();
      // A failed or cancelled installer must not loop on every startup.
      await preferences.remove(_pendingKey);
      if (!mounted) return;
      await DesktopInstaller().install(release, repository);
    } on Object {
      if (mounted) {
        setState(() {
          _failed = true;
          _scheduled = false;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _schedule() async {
    final release = _release;
    if (_busy || release == null) return;
    final next = !_scheduled;
    setState(() => _busy = true);
    try {
      final preferences = await SharedPreferences.getInstance();
      if (next) {
        await preferences.setString(_pendingKey, release.tag);
      } else {
        await preferences.remove(_pendingKey);
      }
      if (mounted) {
        setState(() {
          _scheduled = next;
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
  void dispose() {
    _timer?.cancel();
    _repository?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final release = _release;
    if (_releaseRun.isEmpty ||
        kIsWeb ||
        !(Platform.isMacOS || Platform.isWindows || Platform.isLinux)) {
      return widget.child;
    }
    final l10n = context.l10n;
    return Column(
      children: [
        if (release != null && release.tag != _dismissed)
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Wrap(
                spacing: 12,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    _failed
                        ? l10n.desktopUpdateFailed
                        : _scheduled
                        ? l10n.desktopUpdateScheduled
                        : l10n.desktopUpdateReady(release.version),
                  ),
                  shad.PrimaryButton(
                    onPressed: _busy ? null : _install,
                    child: Text(l10n.desktopUpdateInstall),
                  ),
                  shad.OutlineButton(
                    onPressed: _busy ? null : _schedule,
                    child: Text(
                      _scheduled
                          ? l10n.desktopUpdateCancel
                          : l10n.desktopUpdateNextLaunch,
                    ),
                  ),
                  if (_failed)
                    shad.OutlineButton(
                      onPressed: () => launchUrl(
                        Uri.parse('https://tuturuuu.com/download'),
                        mode: LaunchMode.externalApplication,
                      ),
                      child: Text(l10n.desktopUpdateManual),
                    ),
                  IconButton(
                    tooltip: l10n.desktopUpdateDismiss,
                    onPressed: _busy
                        ? null
                        : () => setState(() => _dismissed = release.tag),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
          ),
        Expanded(
          key: const ValueKey('desktop-update-content'),
          child: widget.child,
        ),
      ],
    );
  }
}
