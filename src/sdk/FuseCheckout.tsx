"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { PublicKey } from "@solana/web3.js";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import type { FuseCheckoutConfig, WalletToken } from "./types";
import { TokenSelector } from "./TokenSelector";
import { useFuseQuote, type Selection } from "./useFuseQuote";
import { useFuseExecute } from "./useFuseExecute";
import { fetchWalletTokens } from "@/lib/wallet-balances";
import { parsePubkey, explorerTx } from "./settlement";
import { settleMainnet, type StageReport } from "./settle";
import { track } from "@/lib/analytics";
import { Logo } from "@/components/ui/Logo";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { Button } from "@/components/ui/Button";
import { cn, formatUsd, shortAddress } from "@/lib/utils";

type Step = "connect" | "select" | "success";

interface FuseCheckoutProps extends FuseCheckoutConfig {
  /** Render inline (no modal chrome) for the landing demo */
  embedded?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function FuseCheckout({
  amount,
  currency,
  recipient,
  merchantName = "Nebula Store",
  productName = "Pro Plan — Annual",
  embedded = false,
  open = true,
  onClose,
}: FuseCheckoutProps) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [step, setStep] = useState<Step>("connect");
  const [wallet, setWallet] = useState<WalletToken[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // The payer types in where the USDC should be sent. Prefill from the prop only
  // if it's a real base58 address (the landing demo passes a placeholder string).
  const [recipientInput, setRecipientInput] = useState(() =>
    recipient && parsePubkey(recipient) ? recipient : "",
  );
  const [confirming, setConfirming] = useState(false);

  const { status, stageLabel, result, error, execute, reset } = useFuseExecute();

  const merchantPubkey = useMemo(() => parsePubkey(recipientInput), [recipientInput]);
  const recipientValid = merchantPubkey !== null;
  const recipientTouched = recipientInput.trim().length > 0;
  const address = publicKey?.toBase58() ?? "";

  // Fire "Checkout Opened" once when shown.
  useEffect(() => {
    if (open) {
      track("Checkout Opened", { amount, merchant: merchantName });
      if (typeof pendo !== "undefined") {
        pendo.track("Checkout Opened", {
          amount,
          merchantName,
          currency,
          productName,
          embedded,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadBalances = useCallback(
    async (pk: PublicKey) => {
      setLoadingBalances(true);
      setBalanceError(null);
      try {
        const tokens = await fetchWalletTokens(connection, pk);
        if (!tokens.length) {
          setBalanceError("No supported tokens found in this wallet.");
          if (typeof pendo !== "undefined") {
            pendo.track("Wallet Load Failed", {
              reason: "no_supported_tokens",
              walletAddress: pk.toBase58(),
              errorType: "empty_wallet",
            });
          }
          return;
        }
        setWallet(tokens);
        setStep("select");
        track("Wallet Connected", { address: pk.toBase58() });
        if (typeof pendo !== "undefined") {
          pendo.track("Wallet Connected", {
            address: pk.toBase58(),
            tokenCount: tokens.length,
            totalValueUsd: tokens.reduce((s, t) => s + t.valueUsd, 0),
            tokenSymbols: tokens.map((t) => t.token.symbol),
          });
        }
      } catch {
        setBalanceError("Couldn't reach the network. Set an RPC in .env and retry.");
        if (typeof pendo !== "undefined") {
          pendo.track("Wallet Load Failed", {
            reason: "network_error",
            walletAddress: pk.toBase58(),
            errorType: "rpc_failure",
          });
        }
      } finally {
        setLoadingBalances(false);
      }
    },
    [connection],
  );

  // Once the adapter reports a connected key, load balances and advance.
  useEffect(() => {
    if (connected && publicKey && step === "connect" && !loadingBalances && !balanceError) {
      loadBalances(publicKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, step]);

  function connectWallet() {
    setBalanceError(null);
    if (connected && publicKey) loadBalances(publicKey);
    else setVisible(true);
  }

  const selections: Selection[] = useMemo(
    () =>
      wallet
        .map((wt) => ({ walletToken: wt, amount: (allocations[wt.token.symbol] ?? 0) / wt.priceUsd }))
        .filter((s) => s.amount > 0 && Number.isFinite(s.amount)),
    [wallet, allocations],
  );

  const selectedUsd = useMemo(
    () => Object.values(allocations).reduce((a, b) => a + b, 0),
    [allocations],
  );
  const remaining = Math.max(0, amount - selectedUsd);
  const covered = selectedUsd >= amount - 0.005;

  const { loading: quoting, outputUsdc, totalFeesUsd, worstImpact } = useFuseQuote(selections);

  function toggle(wt: WalletToken) {
    setConfirming(false);
    setAllocations((prev) => {
      const next = { ...prev };
      if (next[wt.token.symbol]) {
        delete next[wt.token.symbol];
      } else {
        const stillNeeded = Math.max(0, amount - Object.values(next).reduce((a, b) => a + b, 0));
        const allocatedUsd = Math.min(wt.valueUsd, stillNeeded || wt.valueUsd);
        next[wt.token.symbol] = allocatedUsd;
        track("Token Selected", { symbol: wt.token.symbol });
        if (typeof pendo !== "undefined") {
          pendo.track("Token Selected", {
            symbol: wt.token.symbol,
            auto: false,
            allocatedUsd,
            tokenBalance: wt.balance,
            tokenValueUsd: wt.valueUsd,
          });
        }
      }
      return next;
    });
  }

  function allocate(wt: WalletToken, usd: number) {
    setConfirming(false);
    setAllocations((prev) => {
      const next = { ...prev };
      if (usd <= 0) delete next[wt.token.symbol];
      else next[wt.token.symbol] = Math.min(usd, wt.valueUsd);
      return next;
    });
  }

  function autoFill() {
    const next: Record<string, number> = {};
    let need = amount;
    for (const wt of [...wallet].sort((a, b) => b.valueUsd - a.valueUsd)) {
      if (need <= 0) break;
      const take = Math.min(wt.valueUsd, need);
      next[wt.token.symbol] = take;
      need -= take;
    }
    setAllocations(next);
    track("Token Selected", { symbol: "auto", auto: true });
    if (typeof pendo !== "undefined") {
      pendo.track("Token Selected", {
        symbol: "auto",
        auto: true,
      });
    }
  }

  async function pay() {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (!merchantPubkey) return;
    // Show a "sending to <addr> — correct?" check before signing real funds.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const merchant = merchantPubkey;
    const settle = (report: StageReport) =>
      settleMainnet(
        { publicKey, sendTransaction, selections, outputUsdc, merchant },
        report,
      );
    await execute({ selections, amountUsd: amount, settle });
    setStep("success");
  }

  function resetAll() {
    setAllocations({});
    setWallet([]);
    setBalanceError(null);
    setRecipientInput(recipient && parsePubkey(recipient) ? recipient : "");
    setConfirming(false);
    reset();
    setStep("connect");
  }

  function handleClose() {
    if (step !== "success" && typeof pendo !== "undefined") {
      pendo.track("Checkout Abandoned", {
        step,
        amount,
        merchantName,
        selectedUsd,
        tokenCount: Object.keys(allocations).length,
        walletConnected: connected,
        quoteGenerated: outputUsdc > 0,
      });
    }
    onClose?.();
  }

  const walletValue = useMemo(() => wallet.reduce((s, w) => s + w.valueUsd, 0), [wallet]);
  const busy = status !== "idle" && status !== "error";

  const Inner = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Checkout
          </span>
        </div>
        {!embedded && (
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Order summary */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <div className="text-xs text-zinc-500">{merchantName}</div>
          <div className="text-sm font-medium text-white">{productName}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">Amount due</div>
          <div className="text-xl font-bold text-white tabular-nums">
            {formatUsd(amount)} <span className="text-sm font-medium text-fuse-400">{currency}</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {/* STEP 1 — CONNECT */}
          {step === "connect" && (
            <motion.div
              key="connect"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center py-6 text-center"
            >
              <div className="relative mb-5">
                <div className="absolute inset-0 animate-ping rounded-full bg-fuse-400/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-fuse-400/30 bg-fuse-400/10">
                  {loadingBalances ? (
                    <Loader2 className="h-7 w-7 animate-spin text-fuse-400" />
                  ) : (
                    <Wallet className="h-7 w-7 text-fuse-400" />
                  )}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white">
                {loadingBalances ? "Reading your balances…" : "Connect your wallet"}
              </h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">
                FUSE scans your balances and lets you pay with any token you already hold.
              </p>

              {balanceError && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {balanceError}
                </div>
              )}

              <Button onClick={connectWallet} size="lg" className="mt-6 w-full" disabled={loadingBalances}>
                <Wallet className="h-4 w-4" />
                {connected && publicKey ? `Use ${shortAddress(publicKey.toBase58(), 4)}` : "Connect Wallet"}
              </Button>

              <div className="mt-5 flex items-center gap-1.5 text-xs text-zinc-500">
                <ShieldCheck className="h-3.5 w-3.5 text-fuse-400" />
                Non-custodial · You approve every transaction
              </div>
              <div className="mt-3 rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Solana mainnet · Real USDC settlement
              </div>
            </motion.div>
          )}

          {/* STEP 2 — SELECT */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="flex h-2 w-2 rounded-full bg-fuse-400" />
                  {shortAddress(address, 5)}
                  <span className="rounded bg-fuse-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuse-300">
                    Mainnet
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="tabular-nums">{formatUsd(walletValue)}</span>
                </div>
                <button
                  onClick={autoFill}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-fuse-400/30 bg-fuse-400/10 px-2.5 py-1 text-xs font-medium text-fuse-300 hover:bg-fuse-400/20 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Auto-fill
                </button>
              </div>

              <TokenSelector
                wallet={wallet}
                allocations={allocations}
                onToggle={toggle}
                onAllocate={allocate}
              />

              {/* Recipient — where the USDC is sent */}
              <div className="mt-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <Store className="h-3.5 w-3.5 text-fuse-400" />
                  Send USDC to
                </label>
                <div className="relative">
                  <input
                    value={recipientInput}
                    onChange={(e) => {
                      setRecipientInput(e.target.value);
                      setConfirming(false);
                    }}
                    placeholder="Recipient's Solana address"
                    spellCheck={false}
                    autoComplete="off"
                    className={cn(
                      "w-full rounded-xl border bg-ink-900/60 px-3 py-2.5 pr-9 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-600 outline-none transition-colors",
                      recipientTouched && !recipientValid
                        ? "border-red-500/40 focus:border-red-500/60"
                        : recipientValid
                          ? "border-fuse-400/40 focus:border-fuse-400/60"
                          : "border-white/8 focus:border-white/20",
                    )}
                  />
                  {recipientValid && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fuse-400" strokeWidth={3} />
                  )}
                </div>
                {recipientTouched && !recipientValid && (
                  <p className="mt-1 text-[11px] text-red-400">Not a valid Solana address.</p>
                )}
              </div>

              {/* Live totals */}
              <div className="mt-4 rounded-2xl border border-white/8 bg-ink-900/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Selected</span>
                  <span className="font-semibold text-white tabular-nums">{formatUsd(selectedUsd)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-fuse-500 to-fuse-300"
                    animate={{ width: `${Math.min(100, (selectedUsd / amount) * 100)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-sm">
                  {covered ? (
                    <span className="flex items-center gap-1.5 font-medium text-fuse-400">
                      <Check className="h-4 w-4" /> Fully covered
                    </span>
                  ) : (
                    <span className="text-zinc-400">
                      Need <span className="font-semibold text-amber-400">{formatUsd(remaining)}</span> more
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">of {formatUsd(amount)}</span>
                </div>
              </div>

              {/* Quote */}
              <AnimatePresence>
                {selectedUsd > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Merchant receives</span>
                        <span className="flex items-center gap-1.5 font-semibold text-white tabular-nums">
                          {quoting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-fuse-400" /> : null}
                          {formatUsd(outputUsdc)} USDC
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                        <span>Network + FUSE fee</span>
                        <span className="tabular-nums">{formatUsd(totalFeesUsd)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                        <span>Price impact</span>
                        <span className="tabular-nums">{worstImpact.toFixed(2)}%</span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1 border-t border-white/8 pt-2.5 text-[11px] text-zinc-500">
                        <span>Routed via</span>
                        <span className="font-medium text-zinc-300">Jupiter</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-zinc-300">USDC</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-left text-xs text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Confirm destination before signing real funds */}
              <AnimatePresence>
                {confirming && !busy && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left">
                      <div className="flex items-start gap-2 text-xs text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Sending <strong>{formatUsd(outputUsdc)} USDC</strong> to this address. This
                          is final and can&apos;t be reversed — double-check it&apos;s correct.
                        </span>
                      </div>
                      <div className="mt-2 break-all rounded-lg bg-ink-950/60 px-2.5 py-2 font-mono text-[11px] text-white">
                        {recipientInput.trim()}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                onClick={pay}
                size="lg"
                className="mt-4 w-full"
                disabled={!covered || !recipientValid || quoting || busy}
              >
                {!busy ? (
                  <>
                    <Lock className="h-4 w-4" />
                    {!covered
                      ? `Select ${formatUsd(remaining)} more`
                      : !recipientValid
                        ? "Enter recipient address"
                        : confirming
                          ? `Confirm — send to ${shortAddress(recipientInput.trim(), 4)}`
                          : `Pay ${formatUsd(amount)}`}
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {stageLabel}
                  </>
                )}
              </Button>
              {confirming && !busy && (
                <button
                  onClick={() => setConfirming(false)}
                  className="mt-2 w-full text-center text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <p className="mt-2.5 text-center text-[11px] text-zinc-600">
                Live Jupiter swap · Real USDC settled on Solana mainnet
              </p>
            </motion.div>
          )}

          {/* STEP 3 — SUCCESS */}
          {step === "success" && result && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-4 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-fuse-400/15"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-fuse-400/20" />
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fuse-400">
                  <Check className="h-8 w-8 text-ink-950" strokeWidth={3} />
                </div>
              </motion.div>
              <h3 className="text-xl font-bold text-white">Payment complete</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {formatUsd(result.merchantReceivedUsdc)} USDC sent to{" "}
                <span className="font-mono text-zinc-300">{shortAddress(recipientInput, 4)}</span>
              </p>

              <div className="mt-5 w-full space-y-2.5 rounded-2xl border border-white/8 bg-ink-900/60 p-4 text-left text-sm">
                <Row label="Amount paid" value={formatUsd(result.amountPaidUsd)} />
                <Row
                  label="Paid with"
                  value={
                    <span className="flex items-center gap-1">
                      {selections.map((s) => (
                        <TokenIcon key={s.walletToken.token.symbol} token={s.walletToken.token} size={18} />
                      ))}
                      <span className="ml-1 text-zinc-300">{result.tokensUsed.join(" + ")}</span>
                    </span>
                  }
                />
                <Row label="Recipient received" value={`${formatUsd(result.merchantReceivedUsdc)} USDC`} />
                <Row label="Recipient" value={<span className="font-mono">{shortAddress(recipientInput, 4)}</span>} />
                <Row
                  label="Transaction"
                  value={
                    <a
                      className="text-fuse-400 hover:underline"
                      href={explorerTx(result.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(result.txHash, 6)} ↗
                    </a>
                  }
                />
              </div>

              <Button
                variant="outline"
                size="lg"
                className="mt-5 w-full"
                onClick={() => {
                  resetAll();
                  if (!embedded) onClose?.();
                }}
              >
                {embedded ? "Run another payment" : "Done"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="w-full max-w-[420px] overflow-hidden rounded-3xl glass-strong shadow-card">
        {Inner}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-3xl glass-strong shadow-card"
          >
            {Inner}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
