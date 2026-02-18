import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
	streamSimpleOpenAICompletions,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { PermitCache } from "./src/cache.js";
import type { EnvSource } from "./src/env.js";
import { loadX402Env } from "./src/env.js";
import { createX402Fetch } from "./src/fetch-wrapper.js";
import { normalizeRouterConfig } from "./src/router-config.js";
import { createPermitSigner } from "./src/sign-permit.js";
import type { RouterConfig } from "./src/types.js";

const X402_API = "x402-openai-completions";

function withV1Path(origin: string): string {
	return origin.endsWith("/") ? `${origin}v1` : `${origin}/v1`;
}

function createRouterConfigResolver(options: {
	baseFetch: typeof fetch;
	routerUrl: string;
	network: string;
	paymentHeader: string;
}): () => Promise<RouterConfig> {
	let cached: RouterConfig | null = null;
	let cachedAtMs = 0;
	const CACHE_TTL_MS = 30_000;

	return async () => {
		const now = Date.now();
		if (cached && now - cachedAtMs < CACHE_TTL_MS) {
			return cached;
		}

		const fallback = normalizeRouterConfig(
			{},
			{
				network: options.network,
				paymentHeader: options.paymentHeader,
			},
		);
		const configUrl = new URL("/v1/config", `${options.routerUrl}/`);

		try {
			const response = await options.baseFetch(configUrl.toString());
			if (!response.ok) {
				cached = fallback;
				cachedAtMs = now;
				return fallback;
			}

			const data = (await response.json()) as unknown;
			const config = normalizeRouterConfig(data, {
				network: options.network,
				paymentHeader: options.paymentHeader,
			});
			cached = config;
			cachedAtMs = now;
			return config;
		} catch {
			cached = fallback;
			cachedAtMs = now;
			return fallback;
		}
	};
}

function createFetchPatcher(fetchImpl: typeof fetch): { acquire: () => () => void } {
	let activeStreams = 0;
	let originalFetch: typeof fetch | null = null;

	return {
		acquire: () => {
			if (activeStreams === 0) {
				originalFetch = globalThis.fetch;
				globalThis.fetch = fetchImpl;
			}

			activeStreams += 1;
			let released = false;

			return () => {
				if (released) return;
				released = true;
				activeStreams -= 1;

				if (activeStreams === 0 && originalFetch) {
					if (globalThis.fetch === fetchImpl) {
						globalThis.fetch = originalFetch;
					}
					originalFetch = null;
				}
			};
		},
	};
}

export function registerX402Provider(pi: ExtensionAPI, envSource: EnvSource = process.env): void {
	const env = loadX402Env(envSource);
	const baseFetch = globalThis.fetch.bind(globalThis);
	const signer = createPermitSigner();
	const permitCache = new PermitCache();
	const resolveRouterConfig = createRouterConfigResolver({
		baseFetch,
		routerUrl: env.routerUrl,
		network: env.network,
		paymentHeader: env.paymentHeader,
	});
	const x402Fetch = createX402Fetch({
		baseFetch,
		resolveRouterConfig,
		permitCache,
		permitCap: env.permitCap,
		privateKey: env.privateKey,
		routerUrl: env.routerUrl,
		signer,
	});
	const fetchPatcher = createFetchPatcher(x402Fetch);

	function streamX402(
		model: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	): AssistantMessageEventStream {
		const openAIModel = {
			...model,
			api: "openai-completions",
		} as Model<"openai-completions">;
		// OpenAI client adds Authorization from apiKey; set null to explicitly clear it.
		const headers = {
			...(options?.headers ?? {}),
			Authorization: null,
		} as unknown as Record<string, string>;

		const releaseFetch = fetchPatcher.acquire();
		try {
			const stream = streamSimpleOpenAICompletions(openAIModel, context, {
				...options,
				apiKey: options?.apiKey ?? "x402-placeholder",
				headers,
			});
			void stream.result().finally(() => {
				releaseFetch();
			});
			return stream;
		} catch (error) {
			releaseFetch();
			throw error;
		}
	}

	const staticPaymentSignature = envSource.X402_PAYMENT_SIGNATURE?.trim();
	const headers =
		staticPaymentSignature && staticPaymentSignature.length > 0
			? {
					[env.paymentHeader]: staticPaymentSignature,
				}
			: undefined;

	pi.registerProvider("x402", {
		baseUrl: withV1Path(env.routerUrl),
		apiKey: "x402-placeholder",
		api: X402_API,
		streamSimple: streamX402,
		headers,
		models: [
			{
				id: env.modelId,
				name: env.modelName,
				reasoning: true,
				compat: {
					supportsDeveloperRole: false,
					supportsStore: false,
					supportsReasoningEffort: false,
				},
				input: ["text", "image"],
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
				},
				contextWindow: 200000,
				maxTokens: 32768,
			},
		],
	});
}

export default function registerX402(pi: ExtensionAPI): void {
	registerX402Provider(pi, process.env);
}
