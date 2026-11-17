"""Bounded synthetic-only fixture; no production targets or credentials."""
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys


class Stop(RuntimeError):
    pass


def command():
    if platform.system() != 'Linux':
        raise Stop('Linux runtime acceptance unavailable')
    bwrap = shutil.which('bwrap')
    python = Path(sys.executable).resolve()
    if not bwrap or not str(python).startswith('/usr/'):
        raise Stop('bubblewrap and system Python required')
    fixture = Path(__file__).with_name('fixture.py')
    if fixture.is_symlink() or not fixture.is_file():
        raise Stop('fixture must be a regular local file')
    args = [bwrap, '--unshare-all', '--die-with-parent', '--new-session',
            '--cap-drop', 'ALL', '--clearenv', '--ro-bind', '/usr', '/usr']
    for path in ['/lib', '/lib64']:
        if Path(path).exists():
            args += ['--ro-bind', path, path]
    return args + ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
                   '--ro-bind', str(fixture), '/fixture.py',
                   str(python), '-I', '-B', '/fixture.py']


def run():
    try:
        result = subprocess.run(command(), env={}, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=5, check=False)
        if result.returncode or len(result.stdout) > 1024:
            raise Stop('sandbox or canary failure')
        if json.loads(result.stdout) != {
                'schema': 1, 'status': 'SYNTHETIC_CANARIES_PASSED'}:
            raise Stop('unexpected canary result')
    except (subprocess.SubprocessError, ValueError, OSError) as error:
        raise Stop('runtime acceptance failed') from error
    return {'schema': 1, 'status': 'SYNTHETIC_ONLY', 'productionRequests': 0}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 1:
            raise Stop('arguments are not accepted')
        print(json.dumps(run()))
    except Stop:
        print(json.dumps({'schema': 1, 'status': 'STOP', 'productionRequests': 0}))
        sys.exit(2)
