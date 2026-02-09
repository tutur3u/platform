import 'package:flutter/material.dart' hide Scaffold, AppBar;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/counter/counter.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class CounterPage extends StatelessWidget {
  const CounterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CounterCubit(),
      child: const CounterView(),
    );
  }
}

class CounterView extends StatelessWidget {
  const CounterView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return shad.Scaffold(
      headers: [
        shad.AppBar(title: Text(l10n.counterAppBarTitle)),
      ],
      child: Stack(
        children: [
          const Center(child: CounterText()),
          Positioned(
            bottom: 24,
            right: 24,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                shad.PrimaryButton(
                  onPressed: () => context.read<CounterCubit>().increment(),
                  shape: shad.ButtonShape.circle,
                  child: const Icon(Icons.add),
                ),
                const shad.Gap(8),
                shad.PrimaryButton(
                  onPressed: () => context.read<CounterCubit>().decrement(),
                  shape: shad.ButtonShape.circle,
                  child: const Icon(Icons.remove),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class CounterText extends StatelessWidget {
  const CounterText({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final count = context.select<CounterCubit, int>((cubit) => cubit.state);
    return Text('$count', style: theme.typography.h1);
  }
}
