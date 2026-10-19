import React from "react";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barColor?: string;
  trackColor?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className = "",
  barColor = "bg-[#D6B36A]",
  trackColor = "bg-[#2A2F34]",
  size = "md",
  showLabel = false,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heightClasses = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="mb-1 flex justify-between text-xs text-[#A1A1AA]">
          <span>Progress</span>
          <span className="font-medium text-[#F1F2F3]">{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full ${trackColor} ${heightClasses[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`${heightClasses[size]} rounded-full ${barColor} transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;

