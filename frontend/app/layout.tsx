import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AccessMap AI — Frontend shell",
  description:
    "Interactive accessibility map UI: profiles, explanations, overlays, and Gemini-style image review (visual only).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${plusJakarta.variable} ${jetbrainsMono.variable} font-sans text-[15px] leading-[1.55] tracking-[-0.01em] antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
