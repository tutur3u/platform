FROM oven/bun:1.3.13

WORKDIR /workspace

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=7814

COPY . .

RUN bun install --frozen-lockfile
RUN bun --filter @tuturuuu/hive build

EXPOSE 7814

CMD ["bun", "--filter", "@tuturuuu/hive", "start"]
