"use client";

import { useCallback, useState } from "react";
import type { PaymentResult, PaymentStatus } from "./types";
import type { Selection } from "./useFuseQuote";
import type { StageReport, SettleResult } from "./settle";
import { track } from "@/lib/analytics";

export interface ExecuteArgs {
  selections: Selection[];
  amountUsd: number;
  /** Real on-chain settlement (Jupiter swap → USDC transfer to merchant). */
  settle: (report: StageReport) => Promise<SettleResult>;
}

export interface UseFuseExecute {
  status: PaymentStatus;
  stageLabel: string;
  result: PaymentResult | null;
  error: string | null;
  execute: (args: ExecuteArgs) => Promise<void>;
  reset: () => void;
}

/**
 * useFuseExecute — orchestrates the swap → settle → success lifecycle on Solana
 * mainnet and fires the analytics events for each stage.
 */
export function useFuseExecute(): UseFuseExecute {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [stageLabel, setStageLabel] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setStageLabel("");
    setResult(null);
    setError(null);
  }, []);

  const execute = useCallback(async (args: ExecuteArgs) => {
    const { selections, amountUsd, settle } = args;
    setError(null);
    const tokens = selections.filter((s) => s.amount > 0).map((s) => s.walletToken.token.symbol);
    track("Payment Started", { tokens, amountUsd, mode: "mainnet" });
    if (typeof pendo !== "undefined") {
      pendo.track("Payment Started", {
        tokens,
        amountUsd,
        mode: "mainnet",
        tokenCount: tokens.length,
      });
    }

    const report: StageReport = (s, label) => {
      setStatus(s);
      setStageLabel(label);
    };

    try {
      report("signing", "Awaiting wallet signature");
      const r = await settle(report);

      const payment: PaymentResult = {
        status: "success",
        txHash: r.txHash,
        amountPaidUsd: amountUsd,
        merchantReceivedUsdc: r.usdc,
        tokensUsed: tokens,
        completedAt: Date.now(),
        mode: "mainnet",
      };

      setResult(payment);
      setStatus("success");
      track("Payment Completed", {
        tokens,
        amountUsd,
        usdc: Number(payment.merchantReceivedUsdc.toFixed(2)),
        txHash: payment.txHash,
        mode: "mainnet",
      });
      if (typeof pendo !== "undefined") {
        pendo.track("Payment Completed", {
          tokens,
          amountUsd,
          usdc: Number(payment.merchantReceivedUsdc.toFixed(2)),
          txHash: payment.txHash,
          mode: "mainnet",
          tokenCount: tokens.length,
          completedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : "Payment failed";
      setError(msg);
      track("Payment Failed", { tokens, amountUsd, mode: "mainnet", error: msg });
      if (typeof pendo !== "undefined") {
        pendo.track("Payment Failed", {
          tokens,
          amountUsd,
          mode: "mainnet",
          error_msg: msg,
          tokenCount: tokens.length,
        });
      }
    }
  }, []);

  return { status, stageLabel, result, error, execute, reset };
}
