import type { Metadata } from "next";
import { ShopProvider } from "@/components/shop-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forma — A little art. A lot of feeling.",
  description:
    "Find your kind of art. Explore 10 colourful art prints from ₦30 to ₦50 at Forma, a small art shop for everyday spaces. Art prints with Airbenda airtime checkout.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <ShopProvider>
          <div id="main-content">{children}</div>
        </ShopProvider>
      </body>
    </html>
  );
}
