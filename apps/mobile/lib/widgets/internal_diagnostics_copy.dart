import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// Local, sanitized diagnostics only; never uploads errors or private content.
class InternalDiagnosticsCopy extends StatelessWidget {
  const InternalDiagnosticsCopy({
    required this.diagnostics,
    this.userId,
    super.key,
  });
  final SafeErrorDiagnostics diagnostics;
  final String? userId;

  bool _allowed(AuthCubit? auth) {
    final state = auth?.state;
    final user = state?.user;
    return auth != null &&
        !auth.isClosed &&
        state?.status == AuthStatus.authenticated &&
        user?.emailConfirmedAt != null &&
        (userId == null || user?.id == userId) &&
        canCopyInternalDiagnostics(user?.email);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit?>();
    if (auth == null || auth.isClosed) return const SizedBox.shrink();
    return BlocBuilder<AuthCubit, AuthState>(
      bloc: auth,
      builder: (context, state) {
        if (!_allowed(auth)) return const SizedBox.shrink();
        final actor = state.user!.id;
        return IconButton(
          tooltip: context.l10n.commonCopyDiagnostics,
          icon: const Icon(Icons.copy_rounded, size: 18),
          onPressed: () async {
            final current = context.read<AuthCubit?>();
            if (!_allowed(current) || current?.state.user?.id != actor) return;
            await Clipboard.setData(ClipboardData(text: diagnostics.summary));
          },
        );
      },
    );
  }
}
