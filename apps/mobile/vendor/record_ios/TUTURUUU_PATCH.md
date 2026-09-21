# Tuturuuu patch to record_ios 2.1.1

Read the input node output format used by its recording tap. Validate the sample
rate and channel count before installing the tap: Core Audio otherwise throws
an Objective-C exception that terminates the app when input is unavailable.
Release interruption observers on every failed stream/file setup path. Failed
stream starts also remove installed taps, stop the engine, disable voice
processing, and dispose the processor. File recording reports a failed native
start instead of announcing a recording that never began.

Keep upstream licensing. Recheck this patch when upgrading record_ios.

The upstream workspace-only resolution flag is removed because this licensed
copy is a standalone path dependency. Verify `flutter pub get --no-example`
inside this directory as well as dependency resolution from `apps/mobile`; CI
recursively visits vendored pubspecs.
