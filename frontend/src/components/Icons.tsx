// Untitled UI Icons — re-exported with project-compatible names
// https://www.untitledui.com/free-icons

import React from "react";

// Direct re-exports (same name)
export { UserCircle } from "@untitledui/icons/UserCircle";
export { Eye } from "@untitledui/icons/Eye";
export { EyeOff as EyeSlash } from "@untitledui/icons/EyeOff";
export { ArrowRight } from "@untitledui/icons/ArrowRight";
export { ArrowLeft } from "@untitledui/icons/ArrowLeft";
export { ArrowUpRight } from "@untitledui/icons/ArrowUpRight";
export { ArrowDownRight } from "@untitledui/icons/ArrowDownRight";
export { Play } from "@untitledui/icons/Play";
export { Plus } from "@untitledui/icons/Plus";
export { Zap } from "@untitledui/icons/Zap";
export { Sun } from "@untitledui/icons/Sun";
export { Clock } from "@untitledui/icons/Clock";

// Renamed re-exports
export { Home01 as House } from "@untitledui/icons/Home01";
export { Image01 as ImageSquare } from "@untitledui/icons/Image01";
export { VideoRecorder as VideoCamera } from "@untitledui/icons/VideoRecorder";
export { CreditCard01 as CreditCard } from "@untitledui/icons/CreditCard01";
export { SearchLg as Search } from "@untitledui/icons/SearchLg";
export { LogOut01 as SignOut } from "@untitledui/icons/LogOut01";
export { ChevronLeft as CaretLeft } from "@untitledui/icons/ChevronLeft";
export { ChevronRight as CaretRight } from "@untitledui/icons/ChevronRight";
export { Grid01 as GridFour } from "@untitledui/icons/Grid01";
export { Star01 as Star } from "@untitledui/icons/Star01";
export { Upload01 as Upload } from "@untitledui/icons/Upload01";
export { XClose as XIcon } from "@untitledui/icons/XClose";
export { Mail01 as Mail } from "@untitledui/icons/Mail01";
export { Moon01 as Moon } from "@untitledui/icons/Moon01";
export { Stars01 as SparkleIcon } from "@untitledui/icons/Stars01";
export { Coins01 as Coins } from "@untitledui/icons/Coins01";
export { Film01 as Video } from "@untitledui/icons/Film01";
export { AlertCircle as Info } from "@untitledui/icons/AlertCircle";

// Custom Spinner (Untitled UI has no animated spinner)
export const Spinner: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 24,
  color,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    style={{ color: color || "currentColor" }}
  >
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="0.75s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);
