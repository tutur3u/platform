# Tuturuuu patch to record_ios 2.1.1

Read the input node output format used by its recording tap. Validate the sample
rate and channel count before installing the tap: Core Audio otherwise throws
an Objective-C exception that terminates the app when input is unavailable.
Release the interruption observer on that failed setup path.

Keep upstream licensing. Recheck this patch when upgrading record_ios.
