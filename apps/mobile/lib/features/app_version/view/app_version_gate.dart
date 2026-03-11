import 'dart:async';

import 'package:flutter/material.dart' hide FilledButton, Scaffold, TextButton;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:url_launcher/url_launcher.dart';

class AppVersionGate extends StatefulWidget {
  const AppVersionGate({required this.child, super.key});

  final Widget child;

  @override
  State<AppVersionGate> createState() => _AppVersionGateState();
}

class _AppVersionGateState extends State<AppVersionGate> {
  bool _dialogOpen = false;

  @override
  Widget build(BuildContext context) {
    return BlocListener<AppVersionCubit, AppVersionState>(
      listenWhen: (previous, current) =>
          previous.shouldShowRecommendedPrompt !=
              current.shouldShowRecommendedPrompt ||
          previous.versionCheck != current.versionCheck,
      listener: (context, state) {
        if (!state.shouldShowRecommendedPrompt || _dialogOpen) return;
        _dialogOpen = true;
        unawaited(_showRecommendedDialog(context, state));
      },
      child: BlocBuilder<AppVersionCubit, AppVersionState>(
        builder: (context, state) {
          if (!state.hasCompletedInitialCheck) {
            return const _AppVersionLoadingScreen();
          }

          if (state.status == AppVersionGateStatus.updateRequired) {
            return _RequiredUpdateScreen(versionState: state);
          }

          return widget.child;
        },
      ),
    );
  }

  Future<void> _showRecommendedDialog(
    BuildContext context,
    AppVersionState state,
  ) async {
    final l10n = context.l10n;
    final cubit = context.read<AppVersionCubit>();
    final storeUrl = state.versionCheck?.storeUrl;

    final shouldOpenStore = await shad.showDialog<bool>(
      context: context,
      builder: (dialogContext) => shad.AlertDialog(
        title: Text(l10n.appUpdateRecommendedTitle),
        content: Text(l10n.appUpdateRecommendedMessage),
        actions: [
          shad.OutlineButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.appUpdateLater),
          ),
          shad.PrimaryButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.appUpdateNow),
          ),
        ],
      ),
    );

    if (!mounted) return;

    if (shouldOpenStore == true) {
      await _launchStoreUrl(storeUrl);
    }

    await cubit.dismissRecommendedPrompt();
    _dialogOpen = false;
  }

  Future<void> _launchStoreUrl(String? storeUrl) async {
    if (storeUrl == null || storeUrl.isEmpty) return;

    final uri = Uri.tryParse(storeUrl);
    if (uri == null) return;

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class _AppVersionLoadingScreen extends StatelessWidget {
  const _AppVersionLoadingScreen();

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const shad.CircularProgressIndicator(),
            const shad.Gap(16),
            Text(context.l10n.appUpdateChecking),
          ],
        ),
      ),
    );
  }
}

class _RequiredUpdateScreen extends StatelessWidget {
  const _RequiredUpdateScreen({required this.versionState});

  final AppVersionState versionState;

  Future<void> _launchStoreUrl() async {
    final storeUrl = versionState.versionCheck?.storeUrl;
    if (storeUrl == null || storeUrl.isEmpty) return;

    final uri = Uri.tryParse(storeUrl);
    if (uri == null) return;

    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l10n.appUpdateRequiredTitle,
                  style: shad.Theme.of(context).typography.h2,
                  textAlign: TextAlign.center,
                ),
                const shad.Gap(12),
                Text(
                  l10n.appUpdateRequiredMessage,
                  textAlign: TextAlign.center,
                  style: shad.Theme.of(context).typography.textMuted,
                ),
                const shad.Gap(24),
                shad.PrimaryButton(
                  onPressed: _launchStoreUrl,
                  child: Text(l10n.appUpdateNow),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
