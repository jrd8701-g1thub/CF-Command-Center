import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "C&F Command Center",
  description: "Point of Sale Stage 1",
};

import AuthWrapper from "@/components/AuthWrapper";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-charcoal-900 text-foreground antialiased selection:bg-brand-teal/30`}>
        <AuthWrapper>
          <div className="flex min-h-screen">
            <Navigation />
            <main className="flex-1 ml-64 p-6 overflow-x-hidden min-h-screen">
              <div className="max-w-[1600px] mx-auto w-full">
                {children}
              </div>
            </main>
          </div>
        </AuthWrapper>
      </body>
    </html>
  );
}
