import type { Metadata, Viewport } from "next";

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

export default function RootLayout({
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
