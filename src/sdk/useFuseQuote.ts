"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletToken } from "./types";
import { getBasketQuote } from "./quote";
import { track } from "@/lib/analytics";

export interface Selection {
  walletToken: WalletToken;
  amount: number;
}

export interface UseFuseQuoteResult {
  loading: boolean;
  outputUsdc: number;
  totalFeesUsd: number;
  worstImpact: number;
  refresh: () => void;
}

/**
 * useFuseQuote — keeps a live USDC quote for the current basket of selected
 * tokens. Debounced + re-quotes whenever the selection changes.
 */
export function useFuseQuote(selections: Selection[]): UseFuseQuoteResult {
  const [loading, setLoading] = useState(false);
  const [outputUsdc, setOutputUsdc] = useState(0);
  const [totalFeesUsd, setTotalFeesUsd] = useState(0);
  const [worstImpact, setWorstImpact] = useState(0);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const active = selections.filter((s) => s.amount > 0);
    if (active.length === 0) {
      setOutputUsdc(0);
      setTotalFeesUsd(0);
      setWorstImpact(0);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const result = await getBasketQuote(active);
    if (id !== seq.current) return; // stale
    setOutputUsdc(result.outputUsdc);
    setTotalFeesUsd(result.totalFeesUsd);
    setWorstImpact(result.worstImpact);
    setLoading(false);
    track("Quote Generated", {
      tokens: active.map((s) => s.walletToken.token.symbol),
      outputUsdc: Number(result.outputUsdc.toFixed(2)),
    });
    if (typeof pendo !== "undefined") {
      pendo.track("Quote Generated", {
        tokens: active.map((s) => s.walletToken.token.symbol),
        outputUsdc: Number(result.outputUsdc.toFixed(2)),
        totalFeesUsd: Number(result.totalFeesUsd.toFixed(2)),
        worstImpact: Number(result.worstImpact.toFixed(2)),
        tokenCount: active.length,
      });
    }
  }, [selections]);

  useEffect(() => {
    const t = setTimeout(run, 180);
    return () => clearTimeout(t);
  }, [run]);

  return { loading, outputUsdc, totalFeesUsd, worstImpact, refresh: run };
}
