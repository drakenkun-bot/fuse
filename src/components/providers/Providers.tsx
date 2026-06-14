"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";

import { getClusterEndpoint } from "@/sdk/settlement";
import { PendoInitializer } from "./PendoInitializer";

import "@solana/wallet-adapter-react-ui/styles.css";

// web3.js expects a global Buffer in the browser.
const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;

/**
 * App-wide Solana context.
 *
 * We pass an empty `wallets` array and rely on the Wallet Standard — modern
 * wallets (Phantom, Solflare, Backpack…) auto-register, so they appear in the
 * connect modal without bundling individual adapters.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => getClusterEndpoint(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <PendoInitializer />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
