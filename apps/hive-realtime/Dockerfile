FROM oven/bun:1.3.13

WORKDIR /workspace

ENV NODE_ENV=production

COPY . .

RUN bun install --frozen-lockfile

EXPOSE 7815

CMD ["bun", "--filter", "@tuturuuu/hive-realtime", "start"]
