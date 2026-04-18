FROM node:24-bookworm-slim AS deps

ARG MINTLIFY_VERSION=4.2.520

RUN npm install --global --prefix /opt/mintlify "mintlify@${MINTLIFY_VERSION}"

FROM node:24-bookworm-slim AS runner

ENV PATH="/opt/mintlify/bin:${PATH}"

WORKDIR /workspace/apps/docs

COPY --from=deps /opt/mintlify /opt/mintlify

RUN useradd --create-home --uid 10001 mintlify

USER mintlify

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.DOCS_PORT || 3000; fetch(`http://127.0.0.1:${port}`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
