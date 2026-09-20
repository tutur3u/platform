import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_service.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

/// An account-scoped invitation. Never prompts on network failure,
/// a locked registry, a registered device, or an unsupported device.
class DeviceMfaSuggestion extends StatefulWidget {
  const DeviceMfaSuggestion({super.key});
  @override
  State<DeviceMfaSuggestion> createState() => _DeviceMfaSuggestionState();
}

class _DeviceMfaSuggestionState extends State<DeviceMfaSuggestion>
    with WidgetsBindingObserver {
  bool _visible = false;
  int _generation = 0;
  String _key(String userId) => 'device-mfa.suggest-after.$userId';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_load());
  }

  Future<void> _load() async {
    final generation = ++_generation;
    final auth = context.read<AuthCubit>();
    final userId = auth.state.user?.id;
    if (mounted) setState(() => _visible = false);
    if (userId == null || auth.state.status != AuthStatus.authenticated) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final snoozed = prefs.getInt(_key(userId)) ?? 0;
      if (snoozed > DateTime.now().millisecondsSinceEpoch) return;
      if (!await DeviceLocalAuthService().isDeviceSupported()) return;
      final status = await DeviceMfaService().status();
      if (!mounted ||
          generation != _generation ||
          auth.state.user?.id != userId) {
        return;
      }
      setState(
        () => _visible =
            !status.registry.locked &&
            !status.registry.devices.any(
              (device) =>
                  device.factorId == status.currentFactorId && device.verified,
            ),
      );
    } on Object {
      // A suggestion is optional. Settings offers an explicit retry.
    }
  }

  Future<void> _snooze({bool openSettings = false}) async {
    final userId = context.read<AuthCubit>().state.user?.id;
    ++_generation;
    setState(() => _visible = false);
    if (userId != null) {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setInt(
          _key(userId),
          DateTime.now().add(const Duration(days: 7)).millisecondsSinceEpoch,
        );
      } on Object {
        // The current screen remains dismissed even when preferences fail.
      }
    }
    if (mounted &&
        openSettings &&
        context.read<AuthCubit>().state.user?.id == userId) {
      await showDeviceMfaSheet(context);
      if (mounted) unawaited(_load());
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthCubit, AuthState>(
      listenWhen: (before, after) =>
          before.user?.id != after.user?.id || before.status != after.status,
      listener: (_, _) => unawaited(_load()),
      child: !_visible
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: shad.Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.verified_user_outlined,
                          color: shad.Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            context.l10n.deviceMfaSuggestTitle,
                            style: shad.Theme.of(context).typography.large,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(context.l10n.deviceMfaSuggestBody),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        shad.PrimaryButton(
                          alignment: Alignment.center,
                          onPressed: () => _snooze(openSettings: true),
                          child: Text(context.l10n.deviceMfaManage),
                        ),
                        shad.GhostButton(
                          onPressed: _snooze,
                          child: Text(context.l10n.deviceMfaNotNow),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
