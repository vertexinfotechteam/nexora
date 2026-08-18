import type { Metadata, Viewport } from "next";

import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Nexus — AI Data Analytics Platform",
    template: "%s · Nexus",
  },
  description:
    "Upload a dataset, ask a question in plain language, and watch the analysis run step by step — every figure computed, never guessed. Powered by Vertex Infotech.",
  applicationName: "Nexus",
  authors: [{ name: "Vertex Infotech" }],
  robots: { index: false, follow: false },
};

// One palette, so the browser chrome does not follow the OS preference either.
export const viewport: Viewport = {
  themeColor: "#faf8f5",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /*
   * No inline script and no hydration suppression.
   *
   * Both existed only for the theme: a blocking script had to set the dark
   * class before first paint to avoid a flash, and that mutation made the
   * server and client markup disagree. With one palette there is nothing to
   * apply early and nothing to suppress.
   */

  /*
   * proxy.ts issues a fresh CSP nonce on every request and expects Next to
   * stamp it onto every script tag it renders. Next only does that during a
   * real per-request render — a statically-optimised page is rendered once
   * at build time with no nonce at all, then served from cache forever with
   * whatever nonce the proxy happens to generate for that particular
   * request. Header and markup disagree, `strict-dynamic` trusts neither,
   * and every script on the page — including Next's own bundle — is
   * silently blocked by the browser for every visitor.
   *
   * Reading the nonce here (root layout, so it covers every route) is the
   * documented way to opt the whole app into dynamic rendering, which keeps
   * the nonce and the markup made in the same request. See
   * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
   */
  await headers();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--nx-card)",
              border: "1px solid var(--nx-border)",
              color: "var(--nx-text)",
              fontSize: "12.5px",
            },
          }}
        />
      </body>
    </html>
  );
}
