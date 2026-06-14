import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FUSE — Pay with any token. Settle in stablecoins.",
  description:
    "FUSE lets customers pay with assets they already own; merchants receive USDC automatically. One checkout. One payment flow.",
  keywords: ["crypto payments", "USDC", "Solana", "stablecoin checkout", "Web3 payments", "Jupiter"],
  openGraph: {
    title: "FUSE — Pay with any token. Settle in stablecoins.",
    description: "Any token in, USDC out — in one tap.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="antialiased">
        <Script id="pendo-install" strategy="beforeInteractive">{`
(function(apiKey){
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];
    v=['initialize','identify','updateOptions','pageLoad','track','trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){
        o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
})('678fc43d-0837-41b9-bd57-634e6a78ae9b');
`}</Script>
        <div className="bg-field" />
        <div className="bg-grid" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
