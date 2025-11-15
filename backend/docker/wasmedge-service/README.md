# WasmEdge HTTP Service

HTTP service that wraps WasmEdge for executing WASM modules.

## Building

```bash
docker build -t wasmedge-service .
```

## Running

```bash
docker run -p 8080:8080 wasmedge-service
```

Or with environment variables:

```bash
docker run -p 8080:8080 -e PORT=8080 wasmedge-service
```

## API

### Health Check

```bash
GET /health
```

Returns:
```json
{
  "status": "ok",
  "service": "wasmedge-http-service"
}
```

### Execute WASM

```bash
POST /execute
Content-Type: application/json

{
  "wasm": "base64_encoded_wasm_binary",
  "input": { "any": "json" },
  "function_name": "main",  // optional
  "memory_limit": 134217728,  // optional, bytes
  "timeout": 30000  // optional, milliseconds
}
```

Returns:
```json
{
  "success": true,
  "output": { "result": "..." },
  "error": null,
  "execution_time": 123,
  "memory_used": 456
}
```

## Development

### Prerequisites

- Rust 1.75+
- WasmEdge installed (see https://wasmedge.org/docs/start/install/)

### Build

```bash
cargo build --release
```

### Run

```bash
cargo run
```

## Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  wasmedge-service:
    build: ./backend/docker/wasmedge-service
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

