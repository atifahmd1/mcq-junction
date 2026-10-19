"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  userEmail?: string | null;
  isAdmin?: boolean;
}

export function Header({ userEmail: initialEmail, isAdmin: initialIsAdmin }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(initialEmail ?? null);
  const [isAdmin, setIsAdmin] = useState<boolean>(initialIsAdmin ?? false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.email) {
          setUserEmail(data.user.email);
          const appMeta = data.user.app_metadata || {};
          if (appMeta.role === "ADMIN" || appMeta.role === "SUPER_ADMIN") {
            setIsAdmin(true);
          }
        }
      });
    } catch {
      // In tests or offline without env vars
    }
  }, []);


  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Exams", href: "/exams" },
    { label: "Practice", href: "/learn" },
    { label: "AI Studio", href: "/ai-studio" },
    { label: "Progress", href: "/progress" },
  ];

  const isActive = (href: string) => {
    if (href === "/" && pathname === "/") return true;
    if (href !== "/" && pathname.startsWith(href)) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#2A2F34] bg-[#0B0D0F]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Logo size="md" />

        {/* Desktop Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-1 lg:gap-2"
          aria-label="Main Navigation"
        >
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 text-xs lg:text-sm font-medium transition rounded-full ${
                  active
                    ? "text-[#D6B36A] bg-[#D6B36A]/10 font-semibold"
                    : "text-[#A1A1AA] hover:text-[#F1F2F3] hover:bg-[#171A1D]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/admin"
              className={`px-2.5 py-1 text-xs font-semibold rounded-full border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition ml-2`}
            >
              Admin Portal
            </Link>
          )}
        </nav>

        {/* Right Utility Bar: Search, Notification Bell, User Avatar */}
        <div className="flex items-center gap-3">
          {/* Search Trigger */}
          <Link
            href="/exams"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#3E444B] transition"
            aria-label="Search exams and topics"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </Link>

          {/* Notification Bell */}
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#3E444B] transition"
            aria-label="View notifications"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            {/* Notification pip */}
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#D6B36A]" />
          </button>

          {/* User Profile Avatar / Sign In */}
          {userEmail ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl bg-[#171A1D] border border-[#2A2F34] p-1.5 hover:border-[#D6B36A]/50 transition"
              aria-label="User Dashboard"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-[#D6B36A] to-[#E4C582] text-[11px] font-bold text-[#0B0D0F]">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <span className="hidden lg:inline text-xs font-medium text-[#F1F2F3] pr-1 max-w-[120px] truncate">
                {userEmail.split("@")[0]}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] px-3 py-1.5 text-xs font-semibold text-[#F1F2F3] hover:border-[#D6B36A]/60 hover:text-[#D6B36A] transition"
            >
              Sign In
            </Link>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3] md:hidden transition"
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu (Progressive enhancement for tablet/mobile) */}
      {mobileMenuOpen && (
        <div className="border-b border-[#2A2F34] bg-[#111416] px-4 py-4 md:hidden">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2 text-sm font-medium rounded-xl transition ${
                    active
                      ? "bg-[#D6B36A]/10 text-[#D6B36A] font-semibold"
                      : "text-[#A1A1AA] hover:bg-[#171A1D] hover:text-[#F1F2F3]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 block rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-300"
              >
                Admin Management Portal
              </Link>
            )}

            <div className="pt-2 mt-2 border-t border-[#2A2F34] flex items-center justify-between">
              {userEmail ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-xs text-[#D6B36A] font-semibold"
                >
                  Manage Account ({userEmail}) →
                </Link>
              ) : (
                <Link
                  href="/auth/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-xs text-[#D6B36A] font-semibold"
                >
                  Sign In to MCQ Junction →
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
