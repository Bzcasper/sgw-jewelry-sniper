FROM node:26-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ts/package.json ts/package-lock.json* ./ts/
RUN cd ts && npm ci --omit=dev
COPY . .
RUN mkdir -p data && npm --prefix ts run typecheck || true
CMD ["npx","tsx","ts/sniper.ts"]
