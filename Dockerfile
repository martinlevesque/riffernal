FROM oven/bun:latest AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ frontend/
COPY backend/ backend/
COPY scripts/ scripts/
COPY tsconfig.json ./

RUN bun run build

FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY backend/ backend/
COPY scripts/ scripts/
COPY --from=build /app/dist/ dist/

RUN mkdir -p data certs && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV PORT=9876
EXPOSE 9876

VOLUME /app/data

CMD ["bun", "run", "start", "--http"]
