"""Synthetic canaries only; kernel-isolated execution required."""
import errno
import json
import os
import socket


def denied(family, address):
    with socket.socket(family, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.1)
        try:
            connection.connect(address)
        except OSError as error:
            # Timeout, refusal and name-resolution failures do not prove isolation.
            assert error.errno in {errno.ENETUNREACH, errno.EAFNOSUPPORT}
        else:
            raise AssertionError("egress")


def main():
    # CPython may synthesize LC_CTYPE during locale coercion after exec.
    assert set(os.environ) <= {'LC_CTYPE'}
    assert os.environ.get('LC_CTYPE') in {None, 'C.UTF-8', 'C.utf8', 'UTF-8'}
    assert not os.path.exists('/etc/resolv.conf')
    assert not os.path.exists('/home')
    # RFC documentation addresses only. No live endpoint or real identity.
    denied(socket.AF_INET, ('192.0.2.1', 9))
    denied(socket.AF_INET6, ('2001:db8::1', 9, 0, 0))
    # This boundary cannot be bypassed through node:net or child processes:
    # it is the inherited network namespace, rather than fetch interception.
    pid = os.fork()
    if pid == 0:
        try:
            denied(socket.AF_INET, ('192.0.2.1', 9))
        except BaseException:
            os._exit(1)
        os._exit(0)
    _, status = os.waitpid(pid, 0)
    assert os.waitstatus_to_exitcode(status) == 0
    print(json.dumps({"v": 1, "status": "CANARIES_VERIFIED", "count": 6}))


if __name__ == '__main__':
    main()
