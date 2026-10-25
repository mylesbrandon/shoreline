import type { Metadata, Viewport } from "next";
import { Baloo_2, Bowlby_One } from "next/font/google";
import "./globals.css";

// Baloo 2: rounded, friendly UI text. Bowlby One: chunky surf-shop poster lettering for big moments.
const baloo = Baloo_2({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-baloo" });
const bowlby = Bowlby_One({ subsets: ["latin"], weight: "400", variable: "--font-bowlby" });

export const metadata: Metadata = {
  title: "Red Flag Day",
  description: "Swimmers are getting dragged past the buoys by the rip. Two crews, four phones, 120 seconds. Save the most swimmers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f8a96",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baloo.variable} ${bowlby.variable}`}>
      <body className="font-display antialiased">{children}</body>
    </html>
  );
}
