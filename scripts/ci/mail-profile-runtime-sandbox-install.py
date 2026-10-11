"""Provision only a verified Google sandbox helper in an ephemeral hosted VM."""
import email.utils
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import signal
import stat
import subprocess
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request

BASE = 'https://dl.google.com/linux/chrome/deb/'
KEY_URL = 'https://dl.google.com/linux/linux_signing_key.pub'
FINGERPRINT = 'EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796'
DIRECTORY = Path('/usr/local/libexec/tuturuuu-mail')
HELPER = DIRECTORY / 'chrome-sandbox'
MEMBER = './opt/google/chrome/chrome-sandbox'
PACKAGE_LIMIT = 250 * 1024 * 1024
DEADLINE_SECONDS = 480


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fields(text):
    result = {}
    current = None
    for line in text.splitlines():
        if line.startswith((' ', '\t')):
            require(current is not None, 'Orphan metadata continuation')
            result[current] += '\n' + line.strip()
            continue
        require(':' in line, 'Invalid metadata field')
        key, value = line.split(':', 1)
        require(re.fullmatch(r'[A-Za-z][A-Za-z0-9-]*', key) and key not in result,
                'Invalid or duplicate metadata field')
        result[key] = value.strip()
        current = key
    return result


def release_record(text, now):
    record = fields(text)
    require(record.get('Codename') == 'stable' and record.get('Suite') == 'stable',
            'Unexpected repository release')
    require('amd64' in record.get('Architectures', '').split(), 'Missing architecture')
    date = email.utils.parsedate_to_datetime(record['Date']).timestamp()
    require(-21600 <= now - date <= 7 * 86400, 'Stale or future repository metadata')
    if 'Valid-Until' in record:
        require(now <= email.utils.parsedate_to_datetime(record['Valid-Until']).timestamp(),
                'Expired repository metadata')
    entries = {}
    for line in record.get('SHA256', '').splitlines():
        if not line:
            continue
        parts = line.split()
        require(len(parts) == 3, 'Invalid release hash entry')
        checksum, size, name = parts
        require(re.fullmatch(r'[0-9a-f]{64}', checksum) and size.isdecimal(),
                'Invalid release checksum')
        require(name not in entries, 'Duplicate release hash path')
        entries[name] = (checksum, int(size))
    require('main/binary-amd64/Packages.gz' in entries, 'Missing package index hash')
    checksum, size = entries['main/binary-amd64/Packages.gz']
    require(0 < size <= 8 * 1024 * 1024, 'Oversized package index')
    return checksum, size


def package_record(text):
    candidates = []
    for paragraph in text.strip().split('\n\n'):
        record = fields(paragraph)
        if record.get('Package') == 'google-chrome-stable':
            candidates.append(record)
    require(len(candidates) == 1, 'Missing or duplicate Chrome package')
    record = candidates[0]
    version = record.get('Version', '')
    require(re.fullmatch(r'[0-9]+(?:\.[0-9]+){3}-[0-9]+', version), 'Invalid Chrome version')
    require(record.get('Architecture') == 'amd64', 'Unexpected package architecture')
    expected = f'pool/main/g/google-chrome-stable/google-chrome-stable_{version}_amd64.deb'
    require(record.get('Filename') == expected, 'Unexpected package origin or path')
    require(re.fullmatch(r'[0-9a-f]{64}', record.get('SHA256', '')), 'Missing package SHA256')
    require(record.get('Size', '').isdecimal(), 'Invalid package size')
    require(0 < int(record['Size']) <= PACKAGE_LIMIT, 'Oversized package')
    return {key: record[key] for key in ('Version', 'Filename', 'SHA256', 'Size')}


def verify_bytes(data, checksum, size):
    require(len(data) == size and digest(data) == checksum, 'Authenticated byte mismatch')


def helper_archive(stream, mode):
    selected = []
    with tarfile.open(fileobj=stream, mode=mode) as archive:
        for member in archive:
            if member.name in (MEMBER, MEMBER[2:]):
                require(member.isfile() and not member.issym() and not member.islnk(),
                        'Helper must be a regular package member')
                require(0 < member.size <= 1024 * 1024, 'Oversized helper')
                selected.append(archive.extractfile(member).read())
    require(len(selected) == 1, 'Missing or duplicate helper member')
    return selected[0]


def helper_bytes(data_tar):
    return helper_archive(io.BytesIO(data_tar), 'r:')


def protected_parent(path):
    metadata = path.lstat()
    require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == 0
            and metadata.st_gid == 0 and metadata.st_mode & 0o022 == 0,
            'Unsafe installer parent')


def hosted_environment(environment, uid, machine):
    require(uid == 0 and machine == 'x86_64', 'Installer requires root amd64')
    require(environment.get('GITHUB_ACTIONS') == 'true'
            and environment.get('RUNNER_ENVIRONMENT') == 'github-hosted'
            and environment.get('RUNNER_OS') == 'Linux'
            and environment.get('ImageOS') == 'ubuntu24',
            'Installer is restricted to the ephemeral hosted Ubuntu VM')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError('Repository redirects are refused')


class Transaction:
    def __init__(self, directory):
        self.directory = directory
        self.deadline = time.monotonic() + DEADLINE_SECONDS
        self.environment = {'PATH': '/usr/bin:/bin', 'HOME': str(directory),
                            'GNUPGHOME': str(directory / 'gnupg'), 'LC_ALL': 'C'}
        (directory / 'gnupg').mkdir(mode=0o700)

    def remaining(self, limit=60):
        left = self.deadline - time.monotonic()
        require(left > 0, 'Installer deadline exhausted')
        return min(limit, left)

    def run(self, arguments, limit=60):
        return subprocess.run(arguments, check=True, capture_output=True,
                              timeout=self.remaining(limit), env=self.environment).stdout

    def fetch(self, url, maximum):
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == 'https' and parsed.netloc == 'dl.google.com'
                and not parsed.query and not parsed.fragment, 'Unexpected repository URL')
        opener = urllib.request.build_opener(NoRedirect)
        chunks = []
        size = 0
        with opener.open(url, timeout=self.remaining(30)) as response:
            require(response.status == 200, 'Repository response is not successful')
            while True:
                self.remaining()
                block = response.read(min(65536, maximum + 1 - size))
                if not block:
                    break
                chunks.append(block)
                size += len(block)
                require(size <= maximum, 'Repository response exceeds size bound')
        return b''.join(chunks)

    def authenticate_release(self):
        key = self.directory / 'google-key.asc'
        key.write_bytes(self.fetch(KEY_URL, 256 * 1024))
        listing = self.run(['/usr/bin/gpg', '--batch', '--with-colons', '--show-keys', str(key)])
        primary = []
        waiting = False
        for line in listing.decode().splitlines():
            parts = line.split(':')
            if parts[0] == 'pub':
                waiting = True
            elif parts[0] == 'fpr' and waiting:
                primary.append(parts[9])
                waiting = False
        require(primary.count(FINGERPRINT) == 1, 'Google primary fingerprint mismatch')
        self.run(['/usr/bin/gpg', '--batch', '--import', str(key)])
        keyring = self.directory / 'google.gpg'
        keyring.write_bytes(self.run(['/usr/bin/gpg', '--batch', '--export', FINGERPRINT]))
        release = self.directory / 'Release'
        signature = self.directory / 'Release.gpg'
        release.write_bytes(self.fetch(BASE + 'dists/stable/Release', 128 * 1024))
        signature.write_bytes(self.fetch(BASE + 'dists/stable/Release.gpg', 128 * 1024))
        self.run(['/usr/bin/gpgv', '--keyring', str(keyring), str(signature), str(release)])
        return release.read_bytes()

    def extract_helper(self, deb):
        transaction = self
        process = subprocess.Popen(
            ['/usr/bin/timeout', '--signal=TERM', '--kill-after=5',
             str(self.remaining(60)), '/usr/bin/dpkg-deb', '--fsys-tarfile', str(deb)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env=self.environment, start_new_session=True)

        class BoundedReader:
            total = 0

            def read(self, size):
                transaction.remaining()
                block = process.stdout.read(size)
                self.total += len(block)
                require(self.total <= 1024 * 1024 * 1024, 'Expanded package is oversized')
                return block

        try:
            reader = BoundedReader()
            helper = helper_archive(reader, 'r|')
            # Drain tar padding: a successful helper member alone is not process success.
            while reader.read(65536):
                pass
            require(process.wait(timeout=self.remaining(10)) == 0,
                    'Package extraction failed')
            return helper
        finally:
            process.stdout.close()
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)

    def acquire_helper(self):
        release = self.authenticate_release()
        checksum, size = release_record(release.decode('utf-8'), time.time())
        compressed = self.fetch(BASE + 'dists/stable/main/binary-amd64/Packages.gz', size)
        verify_bytes(compressed, checksum, size)
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
            package_index = stream.read(16 * 1024 * 1024 + 1)
        require(len(package_index) <= 16 * 1024 * 1024, 'Expanded package index is oversized')
        package = package_record(package_index.decode('utf-8'))
        data = self.fetch(BASE + package['Filename'], int(package['Size']))
        verify_bytes(data, package['SHA256'], int(package['Size']))
        deb = self.directory / 'chrome.deb'
        deb.write_bytes(data)
        helper = self.extract_helper(deb)
        receipt = {'keyFingerprint': FINGERPRINT, 'packageVersion': package['Version'],
                   'packageSHA256': package['SHA256'], 'releaseSHA256': digest(release),
                   'helperSHA256': digest(helper), 'helperMode': '4755',
                   'runtimeQualified': False}
        return helper, receipt


def install(helper, receipt):
    require(not DIRECTORY.exists() and not DIRECTORY.is_symlink(), 'Destination already exists')
    for path in [Path('/'), Path('/usr'), Path('/usr/local')]:
        protected_parent(path)
    libexec = Path('/usr/local/libexec')
    if not libexec.exists():
        libexec.mkdir(mode=0o755)
        libexec.chmod(0o755)
    protected_parent(libexec)
    require(not DIRECTORY.exists() and not DIRECTORY.is_symlink(), 'Destination already exists')
    DIRECTORY.mkdir(mode=0o755)
    DIRECTORY.chmod(0o755)
    try:
        protected_parent(DIRECTORY)
        descriptor = os.open(HELPER, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w+b') as output:
            output.write(helper)
            output.flush()
            os.fsync(output.fileno())
            output.seek(0)
            require(digest(output.read()) == receipt['helperSHA256'], 'Helper readback mismatch')
            os.fchown(output.fileno(), 0, 0)
            os.fchmod(output.fileno(), 0o4755)
            metadata = os.fstat(output.fileno())
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0
                    and metadata.st_gid == 0 and stat.S_IMODE(metadata.st_mode) == 0o4755,
                    'Installed helper metadata mismatch')
        proof = DIRECTORY / 'sandbox-provenance.json'
        with proof.open('x') as output:
            output.write(json.dumps(receipt, sort_keys=True) + '\n')
        proof.chmod(0o644)
    except BaseException:
        for path in [HELPER, DIRECTORY / 'sandbox-provenance.json']:
            if path.exists():
                path.unlink()
        DIRECTORY.rmdir()
        raise


def main():
    hosted_environment(os.environ, os.geteuid(), platform.machine())
    for path in [Path('/'), Path('/usr'), Path('/usr/local')]:
        protected_parent(path)
    libexec = Path('/usr/local/libexec')
    if libexec.exists() or libexec.is_symlink():
        protected_parent(libexec)
    protected_parent(Path('/var'))
    temporary_parent = Path('/var/tmp').lstat()
    require(stat.S_ISDIR(temporary_parent.st_mode) and temporary_parent.st_uid == 0
            and temporary_parent.st_gid == 0
            and stat.S_IMODE(temporary_parent.st_mode) == 0o1777,
            'Temporary staging requires the root-owned sticky directory')
    require(not DIRECTORY.exists() and not DIRECTORY.is_symlink(), 'Destination already exists')
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='mail-sandbox-', dir='/var/tmp') as temporary:
        directory = Path(temporary)
        directory.chmod(0o700)
        transaction = Transaction(directory)
        helper, receipt = transaction.acquire_helper()
        transaction.remaining()
        install(helper, receipt)
        print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
