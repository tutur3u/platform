"""Offline rejection tests; never install a setuid helper or contact a repository."""
import hashlib
import importlib.util
import io
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    'sandbox_install', Path(__file__).with_name('mail-profile-runtime-sandbox-install.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

CHECKSUM = 'a' * 64
VERSION = '154.0.8037.97-1'
PACKAGE = '\n'.join([
    'Package: google-chrome-stable', 'Architecture: amd64', f'Version: {VERSION}',
    f'Filename: pool/main/g/google-chrome-stable/google-chrome-stable_{VERSION}_amd64.deb',
    'Size: 123', f'SHA256: {CHECKSUM}'])
RELEASE = '\n'.join([
    'Suite: stable', 'Codename: stable', 'Architectures: amd64',
    'Date: Sun, 11 Oct 2026 00:00:00 +0000', 'SHA256:',
    f' {CHECKSUM} 42 main/binary-amd64/Packages.gz'])
NOW = 1791676800


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as tar:
        for name, kind, data in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            member.linkname = '/tmp/foreign'
            tar.addfile(member, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class SandboxInstallerTests(unittest.TestCase):
    def test_unique_authenticated_package_fields(self):
        selected = MODULE.package_record(PACKAGE)
        self.assertEqual(selected['Version'], VERSION)
        self.assertEqual(selected['SHA256'], CHECKSUM)

    def test_duplicate_fields_and_package_records_are_rejected(self):
        for source in [PACKAGE + '\nSize: 123', PACKAGE + '\n\n' + PACKAGE]:
            with self.assertRaises(ValueError):
                MODULE.package_record(source)

    def test_architecture_version_hash_and_size_are_required(self):
        for old, new in [('amd64', 'arm64'), (VERSION, 'latest'),
                         (CHECKSUM, 'missing'), ('Size: 123', 'Size: -1')]:
            with self.assertRaises(ValueError):
                MODULE.package_record(PACKAGE.replace(old, new))

    def test_package_paths_cannot_escape_or_choose_another_origin(self):
        for path in ['https://evil.example/chrome.deb', '../chrome.deb',
                     'pool/main/g/google-chrome-stable/../foreign.deb']:
            source = PACKAGE.replace(MODULE.package_record(PACKAGE)['Filename'], path)
            with self.assertRaises(ValueError):
                MODULE.package_record(source)

    def test_release_hash_and_date_are_bound(self):
        self.assertEqual(MODULE.release_record(RELEASE, NOW), (CHECKSUM, 42))
        for source, now in [(RELEASE + '\nDate: ignored', NOW),
                            (RELEASE, NOW + 8 * 86400),
                            (RELEASE, NOW - 86400),
                            (RELEASE + f'\n {CHECKSUM} 42 main/binary-amd64/Packages.gz', NOW)]:
            with self.assertRaises(ValueError):
                MODULE.release_record(source, now)

    def test_missing_index_and_wrong_release_are_rejected(self):
        for source in [RELEASE.replace('stable', 'testing'),
                       RELEASE.replace('main/binary-amd64/Packages.gz', 'other')]:
            with self.assertRaises(ValueError):
                MODULE.release_record(source, NOW)

    def test_package_size_or_hash_tampering_is_rejected(self):
        data = b'verified bytes'
        MODULE.verify_bytes(data, hashlib.sha256(data).hexdigest(), len(data))
        for checksum, size in [(CHECKSUM, len(data)),
                               (hashlib.sha256(data).hexdigest(), len(data) + 1)]:
            with self.assertRaises(ValueError):
                MODULE.verify_bytes(data, checksum, size)

    def test_extracts_only_unique_regular_helper(self):
        data = archive([('unrelated', tarfile.REGTYPE, b'ignored'),
                        (MODULE.MEMBER, tarfile.REGTYPE, b'helper')])
        self.assertEqual(MODULE.helper_bytes(data), b'helper')

    def test_symlink_hardlink_duplicate_and_missing_helpers_are_rejected(self):
        for entries in [[], [(MODULE.MEMBER, tarfile.SYMTYPE, b'')],
                        [(MODULE.MEMBER, tarfile.LNKTYPE, b'')],
                        [(MODULE.MEMBER, tarfile.REGTYPE, b'one'),
                         (MODULE.MEMBER[2:], tarfile.REGTYPE, b'two')]]:
            with self.assertRaises(ValueError):
                MODULE.helper_bytes(archive(entries))

    def test_shared_linux_and_nonroot_installation_are_refused(self):
        environment = {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted',
                       'RUNNER_OS': 'Linux', 'ImageOS': 'ubuntu24'}
        MODULE.hosted_environment(environment, 0, 'x86_64')
        for changed, uid, machine in [({'RUNNER_ENVIRONMENT': 'self-hosted'}, 0, 'x86_64'),
                                      ({}, 1000, 'x86_64'), ({}, 0, 'aarch64'),
                                      ({'ImageOS': 'ubuntu22'}, 0, 'x86_64')]:
            with self.assertRaises(ValueError):
                MODULE.hosted_environment({**environment, **changed}, uid, machine)

    def test_unsafe_parent_metadata_is_refused(self):
        good = {'st_mode': stat.S_IFDIR | 0o755, 'st_uid': 0, 'st_gid': 0}
        for changed in [{'st_mode': stat.S_IFLNK | 0o755}, {'st_uid': 1000},
                        {'st_gid': 1000}, {'st_mode': stat.S_IFDIR | 0o777}]:
            path = types.SimpleNamespace(lstat=lambda: types.SimpleNamespace(**{**good, **changed}))
            with self.assertRaises(ValueError):
                MODULE.protected_parent(path)

    def test_wrong_key_and_bad_signature_cannot_authenticate_release(self):
        directory = Path('/offline-sandbox-crypto')
        with patch.object(Path, 'mkdir') as mkdir, \
             patch.object(Path, 'write_bytes', autospec=True,
                          side_effect=lambda path, data: len(data)) as writes, \
             patch.object(Path, 'read_bytes', return_value=b'authenticated release') as reads:
            transaction = MODULE.Transaction(directory)
            mkdir.assert_called_once_with(mode=0o700)
            with patch.object(transaction, 'fetch', return_value=b'public metadata') as fetch:
                with patch.object(transaction, 'run', return_value=b'pub:::::::::\nfpr:::::::::WRONG:\n') as run:
                    with self.assertRaises(ValueError):
                        transaction.authenticate_release()
                    run.assert_called_once_with([
                        '/usr/bin/gpg', '--batch', '--with-colons', '--show-keys',
                        str(directory / 'google-key.asc')])
                    fetch.assert_called_once_with(MODULE.KEY_URL, 256 * 1024)
                    self.assertEqual([args.args[0].name for args in writes.call_args_list],
                                     ['google-key.asc'])
                    reads.assert_not_called()
                writes.reset_mock()
                fetch.reset_mock()
                listing = f'pub:::::::::\nfpr:::::::::{MODULE.FINGERPRINT}:\n'.encode()
                def command(arguments, limit=60):
                    if arguments[0] == '/usr/bin/gpgv':
                        raise subprocess.CalledProcessError(1, arguments)
                    return listing if '--show-keys' in arguments else b'keyring'
                with patch.object(transaction, 'run', side_effect=command) as run:
                    with self.assertRaises(subprocess.CalledProcessError) as failure:
                        transaction.authenticate_release()
                    self.assertEqual(failure.exception.returncode, 1)
                    self.assertEqual([args.args[0] for args in run.call_args_list], [
                        ['/usr/bin/gpg', '--batch', '--with-colons', '--show-keys',
                         str(directory / 'google-key.asc')],
                        ['/usr/bin/gpg', '--batch', '--import', str(directory / 'google-key.asc')],
                        ['/usr/bin/gpg', '--batch', '--export', MODULE.FINGERPRINT],
                        ['/usr/bin/gpgv', '--keyring', str(directory / 'google.gpg'),
                         str(directory / 'Release.gpg'), str(directory / 'Release')]])
                    self.assertEqual([args.args[0] for args in fetch.call_args_list], [
                        MODULE.KEY_URL, MODULE.BASE + 'dists/stable/Release',
                        MODULE.BASE + 'dists/stable/Release.gpg'])
                    self.assertEqual([args.args[0].name for args in writes.call_args_list],
                                     ['google-key.asc', 'google.gpg', 'Release', 'Release.gpg'])
                    reads.assert_not_called()

    def test_redirect_is_refused(self):
        with self.assertRaises(ValueError):
            MODULE.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example')

    def test_existing_destination_stops_before_any_helper_write(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(MODULE, 'DIRECTORY', Path(directory)), \
                 patch.object(MODULE, 'protected_parent'), patch.object(MODULE.os, 'open') as opened:
                with self.assertRaises(ValueError):
                    MODULE.install(b'helper', {'helperSHA256': CHECKSUM})
                opened.assert_not_called()


if __name__ == '__main__':
    unittest.main()
