import { describe, expect, test, vi } from "vitest";

const VALID_PRIVATE_KEY = `0x${"1".repeat(64)}`;
const mocks = vi.hoisted(() => {
	return {
		streamSimpleOpenAICompletions: vi.fn(),
	};
});

vi.mock("@mariozechner/pi-ai", () => {
	return {
		streamSimpleOpenAICompletions: mocks.streamSimpleOpenAICompletions,
	};
});

describe("x402 provider registration", () => {
	test("registers x402 provider with private-key defaults and no static payment header", async () => {
		const { registerX402Provider } = await import("../../examples/extensions/custom-provider-x402/index.js");
		const registerProvider = vi.fn();

		registerX402Provider(
			{
				registerProvider,
			} as unknown as Parameters<typeof registerX402Provider>[0],
			{
				X402_PRIVATE_KEY: VALID_PRIVATE_KEY,
			},
		);

		expect(registerProvider).toHaveBeenCalledTimes(1);
		expect(registerProvider).toHaveBeenCalledWith(
			"x402",
			expect.objectContaining({
				baseUrl: "http://localhost:8080/v1",
				api: "x402-openai-completions",
				streamSimple: expect.any(Function),
				models: [
					expect.objectContaining({
						id: "gpt-4.1-mini",
						name: "x402 GPT-4.1 Mini",
						compat: expect.objectContaining({
							supportsDeveloperRole: false,
							supportsStore: false,
							supportsReasoningEffort: false,
						}),
					}),
				],
				headers: undefined,
			}),
		);
	});

	test("registers x402 provider with static model defaults", async () => {
		const { registerX402Provider } = await import("../../examples/extensions/custom-provider-x402/index.js");
		const registerProvider = vi.fn();

		registerX402Provider(
			{
				registerProvider,
			} as unknown as Parameters<typeof registerX402Provider>[0],
			{
				X402_PRIVATE_KEY: VALID_PRIVATE_KEY,
				X402_PAYMENT_SIGNATURE: "signed-payment-payload",
			},
		);

		expect(registerProvider).toHaveBeenCalledTimes(1);
		expect(registerProvider).toHaveBeenCalledWith(
			"x402",
			expect.objectContaining({
				baseUrl: "http://localhost:8080/v1",
				api: "x402-openai-completions",
				streamSimple: expect.any(Function),
				models: [
					expect.objectContaining({
						id: "gpt-4.1-mini",
						name: "x402 GPT-4.1 Mini",
						compat: expect.objectContaining({
							supportsDeveloperRole: false,
							supportsStore: false,
							supportsReasoningEffort: false,
						}),
					}),
				],
				headers: {
					"PAYMENT-SIGNATURE": "signed-payment-payload",
				},
			}),
		);
	});
});
