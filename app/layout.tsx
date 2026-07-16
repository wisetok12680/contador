import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowFinance - Credit Line Manager",
  description: "Track your baseline balance, parse transaction SMS messages, and manage UPI renaming rules.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlowFinance"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
