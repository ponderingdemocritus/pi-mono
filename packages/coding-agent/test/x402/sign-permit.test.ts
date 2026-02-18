import { describe, expect, test, vi } from "vitest";
import type { SignPermitParams } from "../../examples/extensions/custom-provider-x402/src/types.js";

const mocks = vi.hoisted(() => {
	return {
		readContract: vi.fn(async () => 7n),
		signTypedData: vi.fn(async () => "0xsigned"),
		privateKeyToAccount: vi.fn(() => ({ address: "0x1111111111111111111111111111111111111111" })),
	};
});

vi.mock("viem", () => {
	return {
		createPublicClient: vi.fn(() => ({
			readContract: mocks.readContract,
		})),
		createWalletClient: vi.fn(() => ({
			signTypedData: mocks.signTypedData,
		})),
		http: vi.fn(() => ({})),
	};
});

vi.mock("viem/accounts", () => {
	return {
		privateKeyToAccount: mocks.privateKeyToAccount,
	};
});

vi.mock("viem/chains", () => {
	return {
		base: { id: 8453 },
		baseSepolia: { id: 84532 },
		mainnet: { id: 1 },
	};
});

function decodePaymentSig(value: string): Record<string, unknown> {
	const decoded = Buffer.from(value, "base64").toString("utf8");
	return JSON.parse(decoded) as Record<string, unknown>;
}

describe("x402 sign permit", () => {
	test("creates cached permit payload from private key and router config", async () => {
		const { createPermitSigner } = await import("../../examples/extensions/custom-provider-x402/src/sign-permit.js");
		const signer = createPermitSigner();

		const params: SignPermitParams = {
			privateKey: `0x${"1".repeat(64)}`,
			permitCap: "10000000",
			routerConfig: {
				network: "eip155:8453",
				asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				payTo: "0x2222222222222222222222222222222222222222",
				facilitatorSigner: "0x2222222222222222222222222222222222222222",
				tokenName: "USD Coin",
				tokenVersion: "2",
				paymentHeader: "PAYMENT-SIGNATURE",
			},
		};

		const result = await signer(params);
		const payload = decodePaymentSig(result.paymentSig);

		expect(result.maxValue).toBe("10000000");
		expect(result.nonce).toBe("7");
		expect(result.network).toBe("eip155:8453");
		expect(result.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
		expect(result.payTo).toBe("0x2222222222222222222222222222222222222222");

		expect(payload.x402Version).toBe(2);
		expect(mocks.readContract).toHaveBeenCalledTimes(1);
		expect(mocks.signTypedData).toHaveBeenCalledTimes(1);
	});

	test("throws when router addresses are invalid", async () => {
		const { createPermitSigner } = await import("../../examples/extensions/custom-provider-x402/src/sign-permit.js");
		const signer = createPermitSigner();

		await expect(
			signer({
				privateKey: `0x${"1".repeat(64)}`,
				permitCap: "10000000",
				routerConfig: {
					network: "eip155:8453",
					asset: "not-an-address",
					payTo: "0x2222222222222222222222222222222222222222",
					facilitatorSigner: "0x2222222222222222222222222222222222222222",
					tokenName: "USD Coin",
					tokenVersion: "2",
					paymentHeader: "PAYMENT-SIGNATURE",
				},
			}),
		).rejects.toThrow("routerConfig.asset must be a 0x-prefixed 20-byte hex address");
	});
});
