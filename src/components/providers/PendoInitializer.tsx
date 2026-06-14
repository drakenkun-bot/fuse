"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function PendoInitializer() {
  const { publicKey, connected } = useWallet();
  const initializedRef = useRef(false);
  const wasConnectedRef = useRef(false);

  // Boot the SDK exactly once with an anonymous visitor.
  useEffect(() => {
    if (!initializedRef.current) {
      pendo.initialize({ visitor: { id: "" } });
      initializedRef.current = true;
    }
  }, []);

  // Identify when wallet connects; clear session when wallet disconnects.
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();
      pendo.identify({
        visitor: {
          id: walletAddress,
          walletAddress: walletAddress,
        },
      });
      wasConnectedRef.current = true;
    } else if (!connected && wasConnectedRef.current) {
      pendo.clearSession();
      wasConnectedRef.current = false;
    }
  }, [connected, publicKey]);

  return null;
}
