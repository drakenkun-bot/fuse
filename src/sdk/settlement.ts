import { clusterApiUrl, PublicKey } from "@solana/web3.js";

/** Mainnet USDC mint. */
export const MAINNET_USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/** Parse a base58 address into a PublicKey, or null if invalid. */
export function parsePubkey(raw: string): PublicKey | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed);
  } catch {
    return null;
  }
}

/**
 * Mainnet RPC endpoint. Resolution order:
 *   1. NEXT_PUBLIC_SOLANA_RPC (explicit override)
 *   2. Helius RPC derived from NEXT_PUBLIC_HELIUS_API_KEY (CORS-friendly)
 *   3. The public mainnet-beta endpoint (rate-limits / blocks browsers — last resort)
 */
export function getClusterEndpoint(): string {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC;
  if (explicit) return explicit;

  const helius = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`;

  return clusterApiUrl("mainnet-beta");
}

/** Explorer link for a transaction signature. */
export function explorerTx(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
