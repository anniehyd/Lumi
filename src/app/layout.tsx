import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lumi — AI Email-to-Calendar",
  description: "Scan your inbox, detect events, add them to your calendar with one click.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-lumi-bg text-lumi-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
