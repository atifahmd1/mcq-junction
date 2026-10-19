import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/ui/Header";
import { BottomNav } from "@/components/ui/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCQ Junction — Competitive Exam Preparation & Mock Tests",
  description:
    "Master BPSC, Bihar TRE, CTET, SSC and competitive examinations with high-yield questions, instant feedback, deep conceptual analysis, and official mock test simulations.",
};

export const viewport: Viewport = {
  themeColor: "#0B0D0F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0D0F] text-[#F1F2F3] font-sans selection:bg-[#D6B36A]/20 selection:text-[#E4C582]">
        <Header />
        <div className="flex-1 flex flex-col pb-16 md:pb-0">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
