import React from "react";

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string | React.ReactNode;
  sublabel?: string;
  className?: string;
  color?: string;
}

export function CircularProgress({
  value,
  max = 100,
  size = 72,
  strokeWidth = 6,
  label,
  sublabel,
  className = "",
  color = "#D6B36A",
}: CircularProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transform"
      >
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2A2F34"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Filled Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Center Label / Metrics */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label !== undefined ? (
          typeof label === "string" ? (
            <span className="text-xs sm:text-sm font-bold tracking-tight text-[#F1F2F3]">
              {label}
            </span>
          ) : (
            label
          )
        ) : (
          <span className="text-xs sm:text-sm font-bold tracking-tight text-[#F1F2F3]">
            {Math.round(percentage)}%
          </span>
        )}
        {sublabel && (
          <span className="text-[9px] text-[#A1A1AA] uppercase tracking-wider">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default CircularProgress;

