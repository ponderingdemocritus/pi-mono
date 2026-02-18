import { type Chain, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, mainnet } from "viem/chains";
import type { CachedPermit, SignPermit, SignPermitParams } from "./types.js";

const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_VALIDITY_SECONDS = 3600;

const CHAINS: Record<string, Chain> = {
	"eip155:1": mainnet,
	"eip155:8453": base,
	"eip155:84532": baseSepolia,
};

const ERC2612_NONCES_ABI = [
	{
		type: "function",
		name: "nonces",
		stateMutability: "view",
		inputs: [{ name: "owner", type: "address" }],
		outputs: [{ name: "nonce", type: "uint256" }],
	},
] as const;

const PERMIT_TYPES = {
	Permit: [
		{ name: "owner", type: "address" },
		{ name: "spender", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

interface PaymentPayload {
	x402Version: 2;
	accepted: {
		scheme: "upto";
		network: string;
		asset: string;
		payTo: string;
		extra: {
			name: string;
			version: string;
		};
	};
	payload: {
		authorization: {
			from: string;
			to: string;
			value: string;
			validBefore: string;
			nonce: string;
		};
		signature: string;
	};
}

function asPrivateKey(value: string): `0x${string}` {
	if (!PRIVATE_KEY_REGEX.test(value)) {
		throw new Error("X402_PRIVATE_KEY must be a 0x-prefixed 64-byte hex string");
	}
	return value as `0x${string}`;
}

function asAddress(value: string, field: string): `0x${string}` {
	if (!ADDRESS_REGEX.test(value)) {
		throw new Error(`${field} must be a 0x-prefixed 20-byte hex address`);
	}
	return value as `0x${string}`;
}

function resolveChain(network: string): Chain {
	return CHAINS[network] ?? base;
}

function resolveChainId(network: string, fallback: number): number {
	const [, chainId] = network.split(":");
	const parsed = Number.parseInt(chainId ?? "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchPermitNonce(chain: Chain, asset: `0x${string}`, owner: `0x${string}`): Promise<bigint> {
	const client = createPublicClient({
		chain,
		transport: http(),
	});

	return client.readContract({
		address: asset,
		abi: ERC2612_NONCES_ABI,
		functionName: "nonces",
		args: [owner],
	});
}

function toBase64(value: string): string {
	return Buffer.from(value, "utf8").toString("base64");
}

async function signPermitWithViem(params: SignPermitParams): Promise<CachedPermit> {
	const chain = resolveChain(params.routerConfig.network);
	const chainId = resolveChainId(params.routerConfig.network, chain.id);
	const privateKey = asPrivateKey(params.privateKey);
	const asset = asAddress(params.routerConfig.asset, "routerConfig.asset");
	const facilitatorSigner = asAddress(params.routerConfig.facilitatorSigner, "routerConfig.facilitatorSigner");
	const account = privateKeyToAccount(privateKey);
	const wallet = createWalletClient({
		account,
		chain,
		transport: http(),
	});

	const nonce = await fetchPermitNonce(chain, asset, account.address);
	const deadline = Math.floor(Date.now() / 1000) + DEFAULT_VALIDITY_SECONDS;
	const value = BigInt(params.permitCap);

	const signature = await wallet.signTypedData({
		account,
		domain: {
			name: params.routerConfig.tokenName,
			version: params.routerConfig.tokenVersion,
			chainId,
			verifyingContract: asset,
		},
		types: PERMIT_TYPES,
		primaryType: "Permit",
		message: {
			owner: account.address,
			spender: facilitatorSigner,
			value,
			nonce,
			deadline: BigInt(deadline),
		},
	});

	const paymentPayload: PaymentPayload = {
		x402Version: 2,
		accepted: {
			scheme: "upto",
			network: params.routerConfig.network,
			asset: params.routerConfig.asset,
			payTo: params.routerConfig.payTo,
			extra: {
				name: params.routerConfig.tokenName,
				version: params.routerConfig.tokenVersion,
			},
		},
		payload: {
			authorization: {
				from: account.address,
				to: facilitatorSigner,
				value: params.permitCap,
				validBefore: `${deadline}`,
				nonce: nonce.toString(),
			},
			signature,
		},
	};

	return {
		paymentSig: toBase64(JSON.stringify(paymentPayload)),
		deadline,
		maxValue: params.permitCap,
		nonce: nonce.toString(),
		network: params.routerConfig.network,
		asset: params.routerConfig.asset,
		payTo: params.routerConfig.payTo,
	};
}

export function createPermitSigner(): SignPermit {
	return signPermitWithViem;
}
