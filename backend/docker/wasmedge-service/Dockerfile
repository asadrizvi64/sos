# WasmEdge HTTP Service Dockerfile
# 
# This Dockerfile creates an HTTP service that wraps WasmEdge for executing WASM modules.
# The service accepts HTTP POST requests with WASM binaries and executes them.

FROM rust:1.75 as builder

# Install WasmEdge
RUN curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -p /usr/local

# Create Rust project
WORKDIR /app
RUN cargo init --name wasmedge-service

# Copy Cargo.toml with dependencies
COPY Cargo.toml /app/
RUN cargo build --release

# Copy source code
COPY src /app/src
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install WasmEdge runtime
RUN apt-get update && apt-get install -y curl && \
    curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -p /usr/local && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/wasmedge-service /app/wasmedge-service

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run service
CMD ["/app/wasmedge-service"]

