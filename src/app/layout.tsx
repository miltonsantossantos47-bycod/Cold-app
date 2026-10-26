import type { Metadata, Viewport } from "next";
import { Inter, Jost } from "next/font/google";
import "./globals.css";
import RegistarSW from "./registar-sw";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost" });

export const metadata: Metadata = {
  title: "Cold — The Learning Operating System",
  description:
    "Um sistema operativo de aprendizagem: um percurso de estudo único, construído à tua medida.",
  applicationName: "Cold",
  appleWebApp: { capable: true, title: "Cold", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#253440",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className={`${inter.variable} ${jost.variable}`}>
        {children}
        <RegistarSW />
      </body>
    </html>
  );
}
