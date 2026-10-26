/// Evidence for one typed invocation, never a durable server acknowledgement.
/// Stale and refused prove no local dispatch.
/// Unknown must not be automatically replayed.
enum AssistantLiveDispatch { dispatched, refused, stale, unknown }

/// A successful sink.add is local admission only. A throwing add may have sent.
enum AssistantLiveSinkAdmission { admitted, refused, unknown }
