import { Space_Grotesk, Cinzel, Roboto_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "AGON | Autonomous Agent Bid Arena on BOT Chain",
  description: "Watch aggressive, conservative, and randomized agents clash in rapid block-timed micro-auctions on BOT Chain. Real transactions, instant refunds, high-frequency economics.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${cinzel.variable} ${robotoMono.variable} antialiased h-full`}
      suppressHydrationWarning
    >
      <body className="bg-[#09090b] text-[#ececed] min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
