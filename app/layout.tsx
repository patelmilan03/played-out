import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Played Out",
  description: "Your Spotify listening history, roasted by an AI with no chill.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
