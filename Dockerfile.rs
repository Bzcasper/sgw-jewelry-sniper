FROM rust:1.99 as build
WORKDIR /app
COPY rs/Cargo.toml rs/Cargo.lock* ./rs/
COPY rs/src ./rs/src
RUN cd rs && cargo build --release
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/rs/target/release/sgw-sniper /app/sgw-sniper
COPY schema.sql /app/schema.sql
WORKDIR /app
CMD ["/app/sgw-sniper"]
