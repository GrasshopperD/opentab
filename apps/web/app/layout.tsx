import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./experience/experience.css";
import { SWRegister } from "./sw-register";
import { AppShell } from "./experience/app-shell";

export const metadata: Metadata = {
  title: "OpenTab",
  description: "A little support for your family’s everyday.",
  manifest: "/manifest.webmanifest?v=opentab",
  icons: { icon: "/icon.svg?v=opentab", apple: "/icon-192.png?v=opentab" },
  appleWebApp: { capable: true, title: "OpenTab", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101211" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
        <SWRegister />
      </body>
    </html>
  );
}
