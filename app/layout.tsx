import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import Nav from "@/app/_components/nav";
import Preloader from "@/app/_components/preloader";
import { DialogProvider } from "@/app/_components/dialog";
import InputSelectOnFocus from "@/app/_components/input-select-on-focus";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Stock",
  description: "Gestion de stock",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div aria-hidden="true" className="gold-topbar" />

        <div aria-hidden="true" className="watercolor-tl" />
        <div aria-hidden="true" className="watercolor-tr" />
        <div aria-hidden="true" className="watercolor-bl" />
        <div aria-hidden="true" className="watercolor-br" />

        <div aria-hidden="true" className="botanical-tl" />
        <div aria-hidden="true" className="botanical-tr" />
        <div aria-hidden="true" className="botanical-bl" />
        <div aria-hidden="true" className="botanical-br" />

        <div aria-hidden="true" className="watercolor-dots" />

        <Preloader />
        <InputSelectOnFocus />
        <DialogProvider>
          <div className="relative z-10 flex min-h-full flex-col">
            <Nav />
            <main className="flex-1 pt-14">{children}</main>
            <div aria-hidden="true" className="gold-separator" />
          </div>
        </DialogProvider>
      </body>
    </html>
  );
}
