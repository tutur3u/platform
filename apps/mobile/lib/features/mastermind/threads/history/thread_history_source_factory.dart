import 'package:flutter/services.dart' show appFlavor;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_client.dart';

/// The threads reader for this build: the same hub the snapshot source reads.
/// With no hub URL every read reports "Not available on mobile".
ThreadHistorySource createThreadHistorySource() => HubThreadHistorySource(
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  baseUrl: MastermindHubConfig.resolve(flavor: appFlavor),
  tokens: const SupabaseAccessTokenProvider(),
);
