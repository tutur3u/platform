FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY package.json package.json
RUN bun install --production

COPY src ./src

ENV PORT=8788

EXPOSE 8788

CMD ["bun", "run", "src/server.js"]
