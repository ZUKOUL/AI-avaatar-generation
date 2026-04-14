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
export { Minus } from "@untitledui/icons/Minus";
export { MagicWand02 as MagicWand } from "@untitledui/icons/MagicWand02";
export { Brush01 as Brush } from "@untitledui/icons/Brush01";
export { ChevronDown } from "@untitledui/icons/ChevronDown";
export { Download01 as Download } from "@untitledui/icons/Download01";
export { Trash01 as Trash } from "@untitledui/icons/Trash01";
export { Copy01 as Copy } from "@untitledui/icons/Copy01";
export { LayoutGrid02 as LayoutGrid } from "@untitledui/icons/LayoutGrid02";
export { Grid01 as Grid } from "@untitledui/icons/Grid01";
export { Maximize01 as Maximize } from "@untitledui/icons/Maximize01";

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
export { RefreshCw01 as RefreshCw } from "@untitledui/icons/RefreshCw01";
export { CheckSquare as CheckSquareIcon } from "@untitledui/icons/CheckSquare";
export { FolderPlus as FolderPlus } from "@untitledui/icons/FolderPlus";
export { Settings01 as Settings } from "@untitledui/icons/Settings01";
export { Shield01 as Shield } from "@untitledui/icons/Shield01";
export { Globe01 as Globe } from "@untitledui/icons/Globe01";
export { Lock01 as Lock } from "@untitledui/icons/Lock01";
export { Check as Check } from "@untitledui/icons/Check";
export { ChevronRight } from "@untitledui/icons/ChevronRight";
export { Heart } from "@untitledui/icons/Heart";
export { Edit01 as Pencil } from "@untitledui/icons/Edit01";
export { Share01 as Share } from "@untitledui/icons/Share01";
export { Save01 as Save } from "@untitledui/icons/Save01";
export { DotsHorizontal } from "@untitledui/icons/DotsHorizontal";
export { Calendar } from "@untitledui/icons/Calendar";
export { Palette } from "@untitledui/icons/Palette";
export { Scissors01 as Scissors } from "@untitledui/icons/Scissors01";
export { Droplets01 as Droplets } from "@untitledui/icons/Droplets01";
export { User01 as User } from "@untitledui/icons/User01";
export { FaceSmile } from "@untitledui/icons/FaceSmile";
export { Camera01 as Camera } from "@untitledui/icons/Camera01";

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
