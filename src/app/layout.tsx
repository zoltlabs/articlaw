import type { Metadata } from "next";
import Header from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snipclaw - Clip & Share Snips",
  description:
    "Snip articles from across the web to share easily.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Header />
        <main className="min-h-[calc(100vh-57px)]">{children}</main>
      </body>
    </html>
  );
}
