import React from "react";
import Link from "next/link";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
}

export function Logo({ className = "", size = "md", showWordmark = true }: LogoProps) {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  const textClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl",
  };

  return (
    <Link
      href="/"
      className={`group flex items-center gap-2.5 transition select-none ${className}`}
      aria-label="MCQ Junction Home"
    >
      {/* Precision 3D isometric cube/hexagon in champagne gold */}
      <div
        className={`relative flex ${sizeClasses[size]} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#231E14] via-[#171A1D] to-[#0B0D0F] border border-[#D6B36A]/40 shadow-xs transition group-hover:border-[#D6B36A] group-hover:shadow-[0_0_12px_rgba(214,179,106,0.35)]`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Top isometric facet */}
          <path
            d="M12 2.5L20.5 7.5L12 12.5L3.5 7.5L12 2.5Z"
            fill="#E4C582"
            fillOpacity="0.9"
          />
          {/* Left isometric facet */}
          <path
            d="M3.5 8.7L11.5 13.4V22L3.5 17.3V8.7Z"
            fill="#D6B36A"
            fillOpacity="0.75"
          />
          {/* Right isometric facet */}
          <path
            d="M12.5 13.4L20.5 8.7V17.3L12.5 22V13.4Z"
            fill="#B89243"
            fillOpacity="0.85"
          />
        </svg>
      </div>

      {showWordmark && (
        <div className="flex flex-col">
          <span
            className={`font-bold tracking-tight text-[#F1F2F3] ${textClasses[size]} leading-none`}
          >
            MCQ <span className="text-[#D6B36A]">Junction</span>
          </span>
          <span className="text-[10px] font-medium tracking-widest text-[#717780] uppercase">
            Exam Prep
          </span>
        </div>
      )}
    </Link>
  );
}

export default Logo;

