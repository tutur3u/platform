import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The mode name stays stable while the shared shell switches views.
class AssistantModeTitle extends StatelessWidget {
  const AssistantModeTitle({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 48,
      child: Row(
        children: [
          Image.asset('assets/logos/transparent.png', width: 28, height: 28),
          const SizedBox(width: 10),
          Flexible(
            child:
                BlocSelector<AssistantChromeCubit, AssistantChromeState, bool>(
                  selector: (state) => state.isLiveMode,
                  builder: (context, isLiveMode) => Text(
                    isLiveMode
                        ? context.l10n.miraLiveTitle
                        : context.l10n.miraChatTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: theme.colorScheme.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
          ),
        ],
      ),
    );
  }
}
