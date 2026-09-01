FROM node:20-slim
WORKDIR /app
COPY ts/package.json ts/package-lock.json* ./ts/
RUN cd ts && npm ci --omit=dev
COPY . .
RUN mkdir -p data
CMD ["npx","tsx","ts/sniper.ts"]
