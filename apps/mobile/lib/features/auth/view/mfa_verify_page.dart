import 'package:flutter/material.dart'
    hide AlertDialog, AppBar, FilledButton, Scaffold, TextButton;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/auth/widgets/otp_input.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MfaVerifyPage extends StatefulWidget {
  const MfaVerifyPage({super.key});

  @override
  State<MfaVerifyPage> createState() => _MfaVerifyPageState();
}

class _MfaVerifyPageState extends State<MfaVerifyPage> {
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _handleVerify() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;

    final success = await context.read<AuthCubit>().verifyMfa(code);
    if (!success && mounted) {
      _codeController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          children: [
            const Spacer(),
            Text(
              l10n.mfaTitle,
              style: theme.typography.h2,
            ),
            const shad.Gap(8),
            Text(
              l10n.mfaSubtitle,
              style: theme.typography.textMuted,
              textAlign: TextAlign.center,
            ),
            const shad.Gap(32),
            OtpInput(
              controller: _codeController,
              onCompleted: (_) => _handleVerify(),
            ),
            const shad.Gap(24),
            BlocBuilder<AuthCubit, AuthState>(
              buildWhen: (prev, curr) =>
                  prev.isLoading != curr.isLoading || prev.error != curr.error,
              builder: (context, state) {
                return Column(
                  children: [
                    if (state.error != null) ...[
                      Text(
                        state.error!,
                        style: TextStyle(
                          color: theme.colorScheme.destructive,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const shad.Gap(16),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: shad.PrimaryButton(
                        onPressed: state.isLoading ? null : _handleVerify,
                        child: state.isLoading
                            ? const shad.CircularProgressIndicator(size: 20)
                            : Text(l10n.mfaVerify),
                      ),
                    ),
                  ],
                );
              },
            ),
            const shad.Gap(16),
            shad.GhostButton(
              onPressed: () => context.read<AuthCubit>().signOut(),
              child: Text(l10n.mfaSignOut),
            ),
            const Spacer(flex: 2),
          ],
        ),
      ),
    );
  }
}
