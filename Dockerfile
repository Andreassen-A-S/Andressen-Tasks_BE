FROM oven/bun:1.3.7

WORKDIR /app

COPY package*.json ./

RUN bun install

COPY . .

ENV PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "await fetch('http://localhost:9000/api/status').then(r => r.status === 200 ? process.exit(0) : process.exit(1))" || exit 1

CMD ["bun", "run", "start"]