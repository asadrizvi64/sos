# E2B Setup Guide

E2B (formerly E2B Sandbox) provides ultra-fast, secure code execution sandboxes for running code in isolated environments.

## Prerequisites

1. E2B account: Sign up at [https://e2b.dev](https://e2b.dev)
2. E2B API key: Get your API key from the E2B dashboard

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# E2B Configuration
E2B_API_KEY=your_e2b_api_key_here
E2B_ENABLED=true
```

### Optional Configuration

```bash
# E2B Sandbox Template (default: 'base')
E2B_TEMPLATE=base

# E2B Timeout (default: 30000ms)
E2B_TIMEOUT_MS=30000

# Enable E2B for specific languages (comma-separated)
E2B_LANGUAGES=python,javascript,typescript
```

## Usage

E2B is automatically used when:
1. `runtime: 'e2b'` is explicitly specified in code node configuration
2. `runtime: 'auto'` is used and the runtime router selects E2B based on:
   - Code requires sandbox isolation
   - Long-running jobs (>30 seconds)
   - Python code with complex dependencies

## Testing E2B Integration

### Manual Testing

1. Create a code node in a workflow
2. Set `runtime: 'e2b'` in the node configuration
3. Write Python code that requires sandbox isolation:

```python
import requests
response = requests.get('https://api.github.com')
print(response.json())
```

4. Execute the workflow and verify the code runs in E2B sandbox

### Automated Testing

Run the E2B integration tests:

```bash
cd backend
npm test -- e2b
```

## Troubleshooting

### Common Issues

1. **"E2B API key not found"**
   - Ensure `E2B_API_KEY` is set in your `.env` file
   - Verify the API key is valid in the E2B dashboard

2. **"E2B sandbox creation failed"**
   - Check your E2B account quota
   - Verify network connectivity to E2B API
   - Check E2B service status

3. **"Code execution timeout"**
   - Increase `E2B_TIMEOUT_MS` if needed
   - Check if code is running too long
   - Consider using Bacalhau for very long-running jobs

### Debug Mode

Enable debug logging:

```bash
DEBUG=e2b:* npm run dev
```

## Cost Considerations

E2B charges based on:
- Sandbox creation time
- Execution duration
- Resource usage (CPU, memory)

Monitor your usage in the E2B dashboard and set up billing alerts.

## Alternative Runtimes

If E2B is not available or you want alternatives:

- **VM2**: For JavaScript/TypeScript (default, no external service)
- **Subprocess**: For Python (requires Python installed locally)
- **Bacalhau**: For distributed, long-running jobs
- **WasmEdge**: For WebAssembly execution

## Resources

- [E2B Documentation](https://docs.e2b.dev)
- [E2B API Reference](https://docs.e2b.dev/api-reference)
- [E2B Pricing](https://e2b.dev/pricing)

