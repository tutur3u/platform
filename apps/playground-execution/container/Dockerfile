# Pin the Linux amd64 manifest and the complete Debian package source.
FROM docker.io/oven/bun:1.4.4-slim@sha256:13b43f8bb2c63f5d89c56205c4279b85620363296a00ada33ff7ad568f3688e7

RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources \
    && printf '%s\n' \
        'deb [check-valid-until=no signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://snapshot.debian.org/archive/debian/20261116T000000Z/ trixie main' \
        'deb [check-valid-until=no signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://snapshot.debian.org/archive/debian-security/20261116T000000Z/ trixie-security main' \
        > /etc/apt/sources.list \
    && apt-get -o APT::Update::Error-Mode=any update \
    && apt-get install -y --no-install-recommends \
        g++ \
        gcc \
        golang-go \
        libc6-dev \
        nodejs \
        openjdk-21-jdk-headless \
        php-cli \
        python3 \
        ruby \
        rustc \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/tmp \
    GOCACHE=/tmp/go-build \
    GOMODCACHE=/tmp/go-mod \
    GOPROXY=off \
    GOSUMDB=off \
    GOTOOLCHAIN=local \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /
USER 65534:65534
ENTRYPOINT ["/usr/bin/sleep", "infinity"]
