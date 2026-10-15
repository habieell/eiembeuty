import type { Metadata } from "next";
import "./globals.css";
import "./typography.css";
export const metadata: Metadata = {
  title: "eiem.beauty · Pemesanan Mitra",
  description: "Pemesanan produk eiem.beauty untuk outlet dan distributor.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <head>
        <link
          rel="preload"
          href="/fonts/Poppins-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
