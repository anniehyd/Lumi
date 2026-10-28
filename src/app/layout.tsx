import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lumi — Every invite, sorted",
  description:
    "Lumi reads the newsletters in a student's inbox, pulls out the events, ranks them by fit, and asks one question per event: attending? Nothing lands on your calendar until you say so.",
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
