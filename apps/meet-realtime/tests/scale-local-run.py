"""Fence the isolated Worker and discard its persistence after the run."""

import os
from pathlib import Path
import signal
import subprocess
import sys
from tempfile import TemporaryDirectory
import time


def run(runner, fence, evidence, mode, directory):
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, stop)

    process = subprocess.Popen(
        ['bun', runner, fence, evidence, mode, directory], start_new_session=True
    )
    deadline = time.monotonic() + 190
    try:
        while (
            process.poll() is None
            and not stopped
            and not Path(fence).exists()
            and time.monotonic() < deadline
        ):
            time.sleep(0.1)
        if process.poll() is None:
            try:
                process.send_signal(signal.SIGINT)
                process.wait(timeout=15)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                pass
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
    return process.returncode


if __name__ == '__main__':
    with TemporaryDirectory(prefix='meet-scale-') as directory:
        sys.exit(run(*sys.argv[1:], directory))
