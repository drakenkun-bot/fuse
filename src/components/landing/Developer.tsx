"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

const SNIPPET = `import { FuseCheckout } from "@fuse/sdk";

export default function Pay() {
  return (
    <FuseCheckout
      amount={49.99}
      currency="USDC"
      recipient="merchant"
    />
  );
}`;

const FEATURES = [
  "Drop-in React component",
  "Solana Wallet Adapter built in",
  "Jupiter routing & Pyth pricing",
  "Webhooks + analytics events",
];

export function Developer() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    if (typeof pendo !== "undefined") {
      pendo.track("Code Snippet Copied", {
        snippetLength: SNIPPET.length,
        source: "landing_developer",
      });
    }
  }

  return (
    <section id="developers" className="relative mx-auto max-w-6xl px-5 py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Badge className="mb-5">For developers</Badge>
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            <span className="text-gradient">Ship crypto checkout in</span>{" "}
            <span className="text-neon">3 lines.</span>
          </h2>
          <p className="mt-4 max-w-md text-lg text-zinc-400">
            Install the SDK, drop in <code className="rounded bg-white/5 px-1.5 py-0.5 text-sm text-fuse-300">{"<FuseCheckout/>"}</code>,
            and you&apos;re accepting any token while settling in USDC. No smart contracts to deploy.
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 text-zinc-300"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuse-400/15">
                  <Check className="h-3 w-3 text-fuse-400" strokeWidth={3} />
                </span>
                {f}
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900/80 shadow-card"
        >
          <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Terminal className="h-3.5 w-3.5" />
              app/checkout/page.tsx
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-fuse-400/60" />
              </div>
              <button
                onClick={copy}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-fuse-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
            <Code />
          </pre>
        </motion.div>
      </div>
    </section>
  );
}

/** Tiny hand-rolled highlighter for the snippet. */
function Code() {
  return (
    <code className="font-mono">
      <span className="text-violet-400">import</span>{" "}
      <span className="text-zinc-300">{"{ FuseCheckout }"}</span>{" "}
      <span className="text-violet-400">from</span>{" "}
      <span className="text-fuse-300">&quot;@fuse/sdk&quot;</span>
      <span className="text-zinc-500">;</span>
      {"\n\n"}
      <span className="text-violet-400">export default function</span>{" "}
      <span className="text-amber-300">Pay</span>
      <span className="text-zinc-300">() {"{"}</span>
      {"\n  "}
      <span className="text-violet-400">return</span>{" "}
      <span className="text-zinc-300">(</span>
      {"\n    "}
      <span className="text-zinc-500">&lt;</span>
      <span className="text-fuse-400">FuseCheckout</span>
      {"\n      "}
      <span className="text-sky-300">amount</span>
      <span className="text-zinc-300">{"={"}</span>
      <span className="text-orange-300">49.99</span>
      <span className="text-zinc-300">{"}"}</span>
      {"\n      "}
      <span className="text-sky-300">currency</span>
      <span className="text-zinc-300">=</span>
      <span className="text-fuse-300">&quot;USDC&quot;</span>
      {"\n      "}
      <span className="text-sky-300">recipient</span>
      <span className="text-zinc-300">=</span>
      <span className="text-fuse-300">&quot;merchant&quot;</span>
      {"\n    "}
      <span className="text-zinc-500">/&gt;</span>
      {"\n  "}
      <span className="text-zinc-300">);</span>
      {"\n"}
      <span className="text-zinc-300">{"}"}</span>
    </code>
  );
}
