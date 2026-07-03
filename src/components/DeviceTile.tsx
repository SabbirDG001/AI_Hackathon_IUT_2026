import { motion } from "motion/react";
import { Fan, Lightbulb, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { Device } from "../types";

interface DeviceTileProps {
  key?: string;
  device: Device;
  onToggle: (id: string) => void | Promise<void>;
}

export default function DeviceTile({ device, onToggle }: DeviceTileProps) {
  const isOn = device.status === "on";

  // Select appropriate icon
  const getIcon = () => {
    switch (device.type) {
      case "fan":
        return (
          <Fan 
            className={`w-5 h-5 transition-colors ${
              isOn ? "text-amber-500 animate-[spin_3s_linear_infinite]" : "text-gray-500"
            }`} 
          />
        );
      case "light":
        return (
          <Lightbulb 
            className={`w-5 h-5 transition-colors ${
              isOn ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "text-gray-500"
            }`} 
          />
        );
      default:
        return <Zap className="w-5 h-5 text-gray-500" />;
    }
  };

  // Humanize time elapsed since last change or active
  const getRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);

      if (diffSecs < 10) return "just now";
      if (diffSecs < 60) return `${diffSecs}s ago`;
      if (diffMins < 60) return `${diffMins}m ago`;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "unknown";
    }
  };

  return (
    <motion.div
      id={`device-tile-${device.id}`}
      layoutId={`device-${device.id}`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative p-3 rounded border transition-all duration-300 flex flex-col justify-between ${
        isOn 
          ? "bg-[#0F1115] border-blue-500/40 shadow shadow-blue-500/5" 
          : "bg-[#11141A] border-[#1E293B] hover:border-[#334155]"
      }`}
    >
      {/* Glow Effect when ON */}
      {isOn && (
        <div 
          className="absolute inset-0 -z-10 rounded filter blur-lg opacity-5 transition-all duration-300 bg-amber-500" 
        />
      )}

      {/* Top Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded transition-colors ${
            isOn 
              ? 'bg-amber-950/40' 
              : 'bg-[#1A1F26]'
          }`}>
            {getIcon()}
          </div>
          <div>
            <h4 className="font-sans font-bold text-xs text-slate-100">{device.name}</h4>
            <p className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">{device.room}</p>
          </div>
        </div>

        {/* Toggle button */}
        <button
          id={`toggle-btn-${device.id}`}
          onClick={() => onToggle(device.id)}
          className="cursor-pointer focus:outline-none text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isOn ? (
            <ToggleRight className="w-7 h-7 text-blue-500" />
          ) : (
            <ToggleLeft className="w-7 h-7 text-slate-600" />
          )}
        </button>
      </div>

      {/* Bottom info */}
      <div className="mt-3.5 flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">Load</span>
          <span className={`font-mono text-xs font-bold ${isOn ? "text-blue-400" : "text-slate-400"}`}>
            {device.ratedWatts} W
          </span>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">Changed</span>
          <span className="font-sans text-[10px] text-slate-400">
            {getRelativeTime(device.lastChanged)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
