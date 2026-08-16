import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "NEXORA AI — AI Data Analytics Platform",
    template: "%s · NEXORA AI",
  },
  description:
    "Upload a dataset, ask a question in plain language, and watch the analysis run step by step — every figure computed, never guessed. Powered by Vertex Infotech.",
  applicationName: "NEXORA AI",
  authors: [{ name: "Vertex Infotech" }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#080b12" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The CSP nonce is set per request in proxy.ts; inline scripts must carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
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
