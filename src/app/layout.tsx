import type { Metadata } from "next";
import { Inter, Jost } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost" });

export const metadata: Metadata = {
  title: "Cold — The Learning Operating System",
  description:
    "Um sistema operativo de aprendizagem: um percurso de estudo único, construído à tua medida.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className={`${inter.variable} ${jost.variable}`}>{children}</body>
    </html>
  );
}
