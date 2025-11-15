# WasmEdge Setup Guide

This guide explains how to set up and use WasmEdge runtime in SynthralOS.

## Installation

### macOS / Linux

```bash
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
```

### Verify Installation

```bash
wasmedge --version
```

You should see the WasmEdge version number.

### Add to PATH (if needed)

If `wasmedge` is not in your PATH, add it:

```bash
export PATH=$HOME/.wasmedge/bin:$PATH
```

Or add to your `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export PATH=$HOME/.wasmedge/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Enable WasmEdge
WASMEDGE_ENABLED=true

# Optional: Custom path to wasmedge binary
WASMEDGE_PATH=wasmedge

# Optional: Timeout in milliseconds
WASMEDGE_TIMEOUT=30000

# Optional: Memory limit in bytes (default: 128MB)
WASMEDGE_MEMORY_LIMIT=134217728

# WASM Compilation Cache
WASM_CACHE_ENABLED=true
WASM_CACHE_TTL=3600
WASM_CACHE_DIR=.wasm-cache
```

## Usage

Once installed and configured, WasmEdge will be automatically available as a runtime option for code execution.

### In Workflow Builder

1. Create a code node
2. Select runtime: `wasmedge`
3. Write your code (JavaScript/TypeScript, Python, Rust, or Go)
4. The code will be compiled to WASM and executed

### Supported Languages

- **JavaScript/TypeScript**: Compiled via AssemblyScript
- **Python**: Via Pyodide (requires setup)
- **Rust**: Via wasm-pack (requires Rust)
- **Go**: Via TinyGo (requires TinyGo)

## Compiler Requirements

### AssemblyScript (for JS/TS)

```bash
npm install -g assemblyscript
```

### Rust (for Rust code)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack
```

### TinyGo (for Go code)

See: https://tinygo.org/getting-started/

## Testing

Test WasmEdge execution:

```bash
# Test with a simple WASM file
echo 'export function add(a: i32, b: i32): i32 { return a + b; }' > test.ts
asc test.ts --target release --outFile test.wasm
wasmedge test.wasm
```

## Troubleshooting

### WasmEdge not found

- Verify installation: `wasmedge --version`
- Check PATH: `which wasmedge`
- Set `WASMEDGE_PATH` to full path if needed

### Compilation errors

- Ensure required compilers are installed
- Check compiler versions
- Review compilation error messages

### Execution errors

- Check WASM binary is valid
- Verify function signatures match
- Review execution logs

## Performance

WasmEdge provides:
- Strong security isolation
- Fast startup times
- Low memory footprint
- Good performance for most workloads

## Security

WasmEdge provides:
- Memory isolation
- No direct system access
- Controlled host function access
- Resource limits

## Next Steps

- See `WASMEDGE_INTEGRATION_RESEARCH.md` for detailed integration options
- See `backend/src/services/runtimes/wasmEdgeRuntime.ts` for implementation
- See `backend/src/services/wasmCompiler.ts` for compilation logic

