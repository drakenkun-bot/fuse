"use client";

/**
 * FUSE analytics — a thin Novus.ai-compatible event layer.
 *
 * In production this calls `novus.track(event, props)`. For the demo we persist
 * events to localStorage and emit a browser event so the dashboard can render
 * live funnel metrics without a backend.
 */

export type FuseEvent =
  | "Checkout Opened"
  | "Wallet Connected"
  | "Token Selected"
  | "Quote Generated"
  | "Payment Started"
  | "Payment Completed"
  | "Payment Failed";

export interface TrackedEvent {
  event: FuseEvent;
  props?: Record<string, unknown>;
  ts: number;
  id: string;
}

const STORAGE_KEY = "fuse:events";
export const FUSE_EVENT_BUS = "fuse:event";

declare global {
  // eslint-disable-next-line no-var
  var __novus__: { track: (e: string, p?: Record<string, unknown>) => void } | undefined;
  // eslint-disable-next-line no-var
  var pendo: { track: (event: string, properties?: Record<string, unknown>) => void } | undefined;
}

function read(): TrackedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(events: TrackedEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-500)));
}

let counter = 0;

export function track(event: FuseEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const entry: TrackedEvent = {
    event,
    props,
    ts: Date.now(),
    id: `${Date.now()}-${counter++}`,
  };

  const events = read();
  events.push(entry);
  write(events);

  // Forward to Novus if present (the real integration point).
  globalThis.__novus__?.track(event, props);

  window.dispatchEvent(new CustomEvent(FUSE_EVENT_BUS, { detail: entry }));
}

export function getEvents(): TrackedEvent[] {
  return read();
}

export function clearEvents() {
  write([]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FUSE_EVENT_BUS, { detail: null }));
  }
}

export interface FunnelMetrics {
  checkoutOpens: number;
  walletConnections: number;
  tokenSelections: number;
  quotesGenerated: number;
  paymentsStarted: number;
  paymentsCompleted: number;
  paymentsFailed: number;
  conversionRate: number; // completed / opens
  completionRate: number; // completed / started
  totalSettledUsd: number;
}

export function computeMetrics(events: TrackedEvent[]): FunnelMetrics {
  const count = (e: FuseEvent) => events.filter((x) => x.event === e).length;

  const checkoutOpens = count("Checkout Opened");
  const paymentsStarted = count("Payment Started");
  const paymentsCompleted = count("Payment Completed");

  const totalSettledUsd = events
    .filter((e) => e.event === "Payment Completed")
    .reduce((sum, e) => sum + (Number(e.props?.amountUsd) || 0), 0);

  return {
    checkoutOpens,
    walletConnections: count("Wallet Connected"),
    tokenSelections: count("Token Selected"),
    quotesGenerated: count("Quote Generated"),
    paymentsStarted,
    paymentsCompleted,
    paymentsFailed: count("Payment Failed"),
    conversionRate: checkoutOpens ? paymentsCompleted / checkoutOpens : 0,
    completionRate: paymentsStarted ? paymentsCompleted / paymentsStarted : 0,
    totalSettledUsd,
  };
}

/**
 * Seed a believable funnel so the dashboard never looks empty during the demo.
 * Only runs once per browser.
 */
export function seedDemoData() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem("fuse:seeded") === "1") return;

  const now = Date.now();
  const seeded: TrackedEvent[] = [];
  let id = 0;
  const push = (event: FuseEvent, minsAgo: number, props?: Record<string, unknown>) => {
    seeded.push({ event, props, ts: now - minsAgo * 60_000, id: `seed-${id++}` });
  };

  // 64 opens → 51 wallets → 47 quotes → 41 started → 38 completed, 3 failed
  const opens = 64;
  for (let i = 0; i < opens; i++) {
    const m = Math.floor((i / opens) * 60 * 24);
    push("Checkout Opened", 60 * 24 - m);
    if (i < 51) push("Wallet Connected", 60 * 24 - m - 0.3);
    if (i < 49) push("Token Selected", 60 * 24 - m - 0.5, { symbol: ["SOL", "BONK", "JUP"][i % 3] });
    if (i < 47) push("Quote Generated", 60 * 24 - m - 0.7);
    if (i < 41) push("Payment Started", 60 * 24 - m - 0.9);
    if (i < 38) push("Payment Completed", 60 * 24 - m - 1.1, { amountUsd: [49.99, 50, 24, 120, 9.5][i % 5] });
    else if (i < 41) push("Payment Failed", 60 * 24 - m - 1.1);
  }

  write([...seeded, ...read()]);
  window.localStorage.setItem("fuse:seeded", "1");
  window.dispatchEvent(new CustomEvent(FUSE_EVENT_BUS, { detail: null }));
}
