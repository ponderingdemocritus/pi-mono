# x402 Provider Extension (Draft)

This extension registers an `x402` provider in Pi with:

- Env-only configuration
- Static model registration
- Single-wallet assumptions
- Foundational modules for router config parsing, permit cache, and 401/402 retry helpers

## Usage

```bash
X402_PRIVATE_KEY=0x... \
pi -e ./packages/coding-agent/examples/extensions/custom-provider-x402 --provider x402 --model gpt-4.1-mini
```

## Environment Variables

- `X402_PRIVATE_KEY` (required): wallet private key format validation
- `X402_ROUTER_URL` (optional): defaults to `http://localhost:8080`
- `X402_NETWORK` (optional): defaults to `eip155:8453`
- `X402_PERMIT_CAP` (optional): defaults to `10000000` (base units)
- `X402_PAYMENT_HEADER` (optional): defaults to `PAYMENT-SIGNATURE`
- `X402_MODEL_ID` (optional): defaults to `gpt-4.1-mini` (if you pass `x402/<id>`, the prefix is stripped automatically)
- `X402_MODEL_NAME` (optional): defaults to `x402 GPT-4.1 Mini`
- `X402_PAYMENT_SIGNATURE` (optional): static payment signature override (primarily for debugging)

## Status

The extension now uses local private-key signing to generate payment headers automatically for router inference requests, including 401/402 retry handling via the fetch wrapper.
