"""Synthetic probes, invoked only inside the admitted Linux launcher."""
import errno
import json
import os
import socket


def probe():
    if set(os.environ) - {'LC_CTYPE'}:
        raise RuntimeError('environment canary')
    if any(os.path.exists(path) for path in ['/home', '/etc/resolv.conf']):
        raise RuntimeError('filesystem canary')
    for family, address in [(socket.AF_INET, ('192.0.2.1', 9)),
                            (socket.AF_INET6, ('2001:db8::1', 9))]:
        try:
            with socket.socket(family, socket.SOCK_STREAM) as connection:
                connection.settimeout(0.1)
                connection.connect(address)
        except OSError as error:
            if error.errno not in {errno.ENETUNREACH, errno.EAFNOSUPPORT}:
                raise RuntimeError('inconclusive network canary') from None
        else:
            raise RuntimeError('network canary')
    return {'schema': 1, 'status': 'SYNTHETIC_CANARIES_PASSED'}


if __name__ == '__main__':
    print(json.dumps(probe()))
