import { describe, expect, test, vi } from "vitest";

const VALID_PRIVATE_KEY = `0x${"1".repeat(64)}`;

const mocks = vi.hoisted(() => {
	return {
		streamSimpleOpenAICompletions: vi.fn(),
		createPermitSigner: vi.fn(),
		createX402Fetch: vi.fn(() => vi.fn(async () => new Response("{}", { status: 200 }))),
	};
});

vi.mock("@mariozechner/pi-ai", () => {
	return {
		streamSimpleOpenAICompletions: mocks.streamSimpleOpenAICompletions,
	};
});

vi.mock("../../examples/extensions/custom-provider-x402/src/sign-permit.js", () => {
	return {
		createPermitSigner: mocks.createPermitSigner,
	};
});

vi.mock("../../examples/extensions/custom-provider-x402/src/fetch-wrapper.js", () => {
	return {
		createX402Fetch: mocks.createX402Fetch,
	};
});

describe("x402 provider wiring", () => {
	test("wires permit signer and fetch wrapper for private-key flow", async () => {
		const { registerX402Provider } = await import("../../examples/extensions/custom-provider-x402/index.js");
		const registerProvider = vi.fn();
		const signer = vi.fn();
		mocks.createPermitSigner.mockReturnValue(signer);

		registerX402Provider(
			{
				registerProvider,
			} as unknown as Parameters<typeof registerX402Provider>[0],
			{
				X402_PRIVATE_KEY: VALID_PRIVATE_KEY,
			},
		);

		expect(mocks.createPermitSigner).toHaveBeenCalledTimes(1);
		expect(mocks.createX402Fetch).toHaveBeenCalledTimes(1);
		expect(mocks.createX402Fetch).toHaveBeenCalledWith(
			expect.objectContaining({
				privateKey: VALID_PRIVATE_KEY,
				routerUrl: "http://localhost:8080",
				permitCap: "10000000",
				signer,
				resolveRouterConfig: expect.any(Function),
				permitCache: expect.any(Object),
			}),
		);
	});
});
