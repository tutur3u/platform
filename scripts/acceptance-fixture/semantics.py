"""Synthetic contract oracle. Does not supply expectations for Next routing."""


def verify(observed, contract):
    required = {'handler', 'effects', 'headers', 'deletions'}
    if set(observed) != required or set(contract) != required:
        raise ValueError('schema')
    if not contract['handler'] or not contract['effects']:
        raise ValueError('unresolved contract')
    # Ordered raw pairs retain duplicate headers and distinct Set-Cookie fields.
    for key in required:
        if observed[key] != contract[key]:
            raise ValueError('contract mismatch')
    return 'SYNTHETIC_CONTRACT_ONLY'
