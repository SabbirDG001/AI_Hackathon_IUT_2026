import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Fan, 
  Lightbulb, 
  AlertTriangle, 
  Clock, 
  Zap, 
  BatteryCharging, 
  RefreshCw, 
  Search, 
  Sliders, 
  CheckCircle,
  TrendingUp, 
  Map, 
  Grid,
  History,
  Database
} from "lucide-react";
import { Device, Alert, PowerStats, RoomStats, UsageHistoryPoint, SimulationState, DeviceToggleEvent } from "./types";
import DeviceTile from "./components/DeviceTile";
import PowerChart from "./components/PowerChart";

const SAMPLE_DATASETS: Array<{
  DR: { fans: number; lights: number };
  W1: { fans: number; lights: number };
  W2: { fans: number; lights: number };
}> = [
  { DR: { fans: 1, lights: 2 }, W1: { fans: 2, lights: 3 }, W2: { fans: 2, lights: 3 } },
  { DR: { fans: 0, lights: 1 }, W1: { fans: 2, lights: 3 }, W2: { fans: 2, lights: 3 } },
  { DR: { fans: 0, lights: 1 }, W1: { fans: 1, lights: 2 }, W2: { fans: 2, lights: 3 } },
  { DR: { fans: 0, lights: 0 }, W1: { fans: 1, lights: 2 }, W2: { fans: 1, lights: 2 } },
  { DR: { fans: 0, lights: 0 }, W1: { fans: 1, lights: 0 }, W2: { fans: 1, lights: 2 } },
  { DR: { fans: 0, lights: 0 }, W1: { fans: 0, lights: 0 }, W2: { fans: 1, lights: 2 } },
  { DR: { fans: 0, lights: 0 }, W1: { fans: 0, lights: 0 }, W2: { fans: 0, lights: 1 } },
  { DR: { fans: 0, lights: 0 }, W1: { fans: 0, lights: 0 }, W2: { fans: 0, lights: 0 } }
];

// Generate remaining 56 combinations to reach 64
for (let i = 8; i < 64; i++) {
  const drFans = (i % 2) === 0 ? 1 : 2;
  const drLights = (Math.floor(i / 2) % 3) + 1; // 1, 2, 3
  const w1Fans = (Math.floor(i / 6) % 3); // 0, 1, 2
  const w1Lights = (Math.floor(i / 3) % 4); // 0, 1, 2, 3
  const w2Fans = (Math.floor(i / 4) % 3); // 0, 1, 2
  const w2Lights = (Math.floor(i / 5) % 4); // 0, 1, 2, 3

  SAMPLE_DATASETS.push({
    DR: { fans: Math.min(2, drFans), lights: Math.min(3, drLights) },
    W1: { fans: Math.min(2, w1Fans), lights: Math.min(3, w1Lights) },
    W2: { fans: Math.min(2, w2Fans), lights: Math.min(3, w2Lights) }
  });
}

export default function App() {
  // Application State
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toggleHistory, setToggleHistory] = useState<DeviceToggleEvent[]>([]);
  const [simulation, setSimulation] = useState<SimulationState>({
    simulatedHour: 10,
    simulatedMinute: 30,
    speedFactor: 2,
    isSimulating: true,
    officeHoursStart: 9,
    officeHoursEnd: 17
  });
  const [stats, setStats] = useState<PowerStats>({
    livePower: 0,
    energyUsageToday: 0,
    totalDevices: 0,
    activeDevices: 0
  });
  const [usageHistory, setUsageHistory] = useState<UsageHistoryPoint[]>([]);

  // UI States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [layoutMode, setLayoutMode] = useState<"grid" | "floorplan">("grid");
  const [historyFilter, setHistoryFilter] = useState<"all" | "on" | "off">("all");
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [currentDatasetId, setCurrentDatasetId] = useState<string>("iut-hq");
  const [currentDatasetIndex, setCurrentDatasetIndex] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);

  // Setup WebSocket Connection with automatic reconnection
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connectWS = () => {
      setWsStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus("connected");
        console.log("WebSocket connected.");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log("WebSocket message received:", payload.type);

          switch (payload.type) {
            case "INITIAL_STATE":
              setDevices(payload.devices);
              setAlerts(payload.alerts);
              setSimulation(payload.simulation);
              setStats(payload.stats);
              setUsageHistory(payload.usageHistory);
              if (payload.toggleHistory) setToggleHistory(payload.toggleHistory);
              if (payload.datasetId) setCurrentDatasetId(payload.datasetId);
              if (payload.currentDatasetIndex !== undefined) setCurrentDatasetIndex(payload.currentDatasetIndex);
              break;
            case "DEVICE_UPDATE":
              setDevices(prev => prev.map(d => d.id === payload.device.id ? payload.device : d));
              if (payload.stats) setStats(payload.stats);
              if (payload.toggleHistory) setToggleHistory(payload.toggleHistory);
              break;
            case "TICK":
              setSimulation(payload.simulation);
              setStats(payload.stats);
              setUsageHistory(payload.usageHistory);
              if (payload.devices) setDevices(payload.devices);
              if (payload.currentDatasetIndex !== undefined) setCurrentDatasetIndex(payload.currentDatasetIndex);
              if (payload.toggleHistory) setToggleHistory(payload.toggleHistory);
              break;
            case "ALERT_TRIGGER":
              setAlerts(prev => {
                // Avoid duplicate alert rows
                const filtered = prev.filter(a => a.id !== payload.alert.id);
                return [payload.alert, ...filtered];
              });
              break;
            case "ALERT_RESOLVE":
              setAlerts(prev => prev.map(a => a.id === payload.alert.id ? payload.alert : a));
              break;
            default:
              break;
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      socket.onclose = () => {
        setWsStatus("disconnected");
        console.log("WebSocket disconnected. Attempting to reconnect in 4 seconds...");
        reconnectTimeout = setTimeout(connectWS, 4000);
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
        socket.close();
      };
    };

    connectWS();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);



  // Fetch initial REST data as a fallback/guard
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const resDev = await fetch("/api/devices");
        if (resDev.ok) {
          const devs = await resDev.json();
          setDevices(devs);
        }
        const resAlerts = await fetch("/api/alerts");
        if (resAlerts.ok) {
          const alts = await resAlerts.json();
          setAlerts(alts);
        }
        const resHistory = await fetch("/api/usage/history");
        if (resHistory.ok) {
          const hist = await resHistory.json();
          setUsageHistory(hist);
        }
        const resToggleHist = await fetch("/api/history/toggles");
        if (resToggleHist.ok) {
          const toggles = await resToggleHist.json();
          setToggleHistory(toggles);
        }
      } catch (err) {
        console.error("Failed to query API endpoints on startup:", err);
      }
    };
    fetchInitialData();
  }, []);

  // API Call: Toggle Device Status
  const handleToggleDevice = async (id: string) => {
    // Optimistic Update
    setDevices(prev => prev.map(d => {
      if (d.id === id) {
        const updatedStatus = d.status === "on" ? "off" : "on";
        return {
          ...d,
          status: updatedStatus,
          lastChanged: new Date().toISOString(),
          onSince: updatedStatus === "on" ? new Date().toISOString() : null
        };
      }
      return d;
    }));

    try {
      const response = await fetch(`/api/devices/${id}/toggle`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("API toggle rejected");
      }
    } catch (err) {
      console.error("API toggle failed. Reverting...", err);
      // Revert if API failed (will be overwritten by next WS update anyway)
    }
  };

  // API Call: Force simulation alerts (Demo-Day Safety Net)
  const handleForceAlert = async (type: "after-hours" | "continuous-on") => {
    try {
      const response = await fetch("/api/alerts/force", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Forced alert successfully:", data);
      }
    } catch (err) {
      console.error("Failed to force alert:", err);
    }
  };

  // API Call: Resolve all active violations
  const handleResolveAllAlerts = async () => {
    try {
      const response = await fetch("/api/alerts/resolve-all", {
        method: "POST"
      });
      if (response.ok) {
        console.log("All alerts resolved.");
      }
    } catch (err) {
      console.error("Failed to resolve alerts:", err);
    }
  };

  // API Call: Switch active dataset
  const handleSwitchDataset = async (datasetId: string) => {
    try {
      const response = await fetch("/api/simulation/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId })
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Dataset switched successfully:", data);
        setCurrentDatasetId(data.datasetId);
      }
    } catch (err) {
      console.error("Failed to switch dataset:", err);
    }
  };

  // API Call: Switch active dataset by 1-64 index
  const handleSwitchDatasetIndex = async (index: number) => {
    try {
      const response = await fetch("/api/simulation/dataset-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index })
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Dataset index switched successfully:", data);
        setCurrentDatasetIndex(data.currentDatasetIndex);
      }
    } catch (err) {
      console.error("Failed to switch dataset index:", err);
    }
  };

  // API Call: Set simulated hour
  const handleSetSimulatedHour = async (hour: number) => {
    try {
      const response = await fetch("/api/simulation/hour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour })
      });
      if (response.ok) {
        const data = await response.json();
        setSimulation(data.simulation);
      }
    } catch (err) {
      console.error("Failed to set simulated hour:", err);
    }
  };

  // API Call: Reset simulation
  const handleResetSimulation = async () => {
    try {
      const response = await fetch("/api/simulation/reset", { method: "POST" });
      if (response.ok) {
        console.log("Simulation state reset.");
      }
    } catch (err) {
      console.error("Failed to reset simulation:", err);
    }
  };



  // Filter Logic
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          device.room.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          device.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRoom = selectedRoom === "All" || device.room === selectedRoom;
    const matchesType = selectedType === "All" || 
                        (selectedType === "Fans" && device.type === "fan") || 
                        (selectedType === "Lights" && device.type === "light");
    
    const matchesStatus = selectedStatus === "All" || 
                          (selectedStatus === "ON" && device.status === "on") || 
                          (selectedStatus === "OFF" && device.status === "off");

    return matchesSearch && matchesRoom && matchesType && matchesStatus;
  });

  // Derived Clock formatting
  const formatVirtualClock = () => {
    const hour = simulation.simulatedHour;
    const min = simulation.simulatedMinute;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const dispHour = hour % 12 === 0 ? 12 : hour % 12;
    const dispMin = min < 10 ? `0${min}` : min;
    return `${dispHour}:${dispMin} ${ampm}`;
  };

  const activeAlerts = alerts.filter(a => a.status === "active");

  // Filtered Toggle History (Fans & Lights only)
  const filteredToggleHistory = toggleHistory
    .filter(event => event.deviceId !== "sys")
    .filter(event => event.deviceType === "fan" || event.deviceType === "light")
    .filter(event => historyFilter === "all" || event.action === historyFilter);

  return (
    <div className="min-h-screen bg-[#090A0D] text-[#E2E8F0] select-none selection:bg-blue-500/20 flex flex-col font-sans">
      
      {/* HEADER SECTION */}
      <header className="w-full border-b border-[#1E293B] bg-[#0F1115] px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0" id="header-section">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold tracking-tight text-[#E2E8F0] uppercase">
              LIGHTS_FANS_DISCORD
            </h1>
            <p className="text-[10px] text-blue-400 font-mono uppercase tracking-widest">
              Smart Office Monitor & Pipeline
            </p>
          </div>
        </div>

        {/* Right Header items */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_#10B981] ${
              wsStatus === "connected" ? "bg-green-500 animate-pulse" : 
              wsStatus === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
            }`} />
            <span className="text-[10px] font-mono text-[#E2E8F0] uppercase tracking-wider">
              {wsStatus === "connected" ? "WebSocket Active" : 
               wsStatus === "connecting" ? "WS Connecting..." : "Offline"}
            </span>
          </div>

          <div className="hidden md:block h-8 w-[1px] bg-[#1E293B]"></div>

          {/* Simulation Hour Controls & Digital Clock */}
          <div className="flex flex-wrap items-center gap-2 bg-[#11141A] border border-[#1E293B] p-1.5 rounded shadow-lg">
            <div className="flex items-center gap-2 pr-2 border-r border-[#1E293B]">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-mono text-xs font-semibold text-blue-400 min-w-[76px] text-center bg-blue-950/20 py-0.5 px-2 rounded border border-blue-500/10 shadow-[0_0_6px_rgba(59,130,246,0.1)]">
                {formatVirtualClock()}
              </span>
              <span className="font-mono text-[9px] text-slate-500 uppercase">Sim</span>
            </div>

            <div className="flex items-center gap-1">
              <button 
                id="btn-hour-9am"
                onClick={() => handleSetSimulatedHour(9)}
                className="px-2 py-0.5 text-[9px] font-mono font-medium rounded bg-[#1E293B] border border-[#334155] text-slate-300 hover:border-blue-500/50 hover:bg-slate-800 cursor-pointer"
                title="Jump to 9:00 AM"
              >
                9 AM
              </button>
              <button 
                id="btn-hour-1pm"
                onClick={() => handleSetSimulatedHour(13)}
                className="px-2 py-0.5 text-[9px] font-mono font-medium rounded bg-[#1E293B] border border-[#334155] text-slate-300 hover:border-blue-500/50 hover:bg-slate-800 cursor-pointer"
                title="Jump to 1:00 PM"
              >
                1 PM
              </button>
              <button 
                id="btn-hour-6pm"
                onClick={() => handleSetSimulatedHour(18)}
                className="px-2 py-0.5 text-[9px] font-mono font-medium rounded bg-[#1E293B] border border-[#334155] text-slate-300 hover:border-blue-500/50 hover:bg-slate-800 cursor-pointer"
                title="Jump to 6:00 PM"
              >
                6 PM
              </button>
              <button 
                id="btn-hour-9pm"
                onClick={() => handleSetSimulatedHour(21)}
                className="px-2 py-0.5 text-[9px] font-mono font-medium rounded bg-[#1E293B] border border-[#334155] text-slate-300 hover:border-blue-500/50 hover:bg-slate-800 cursor-pointer"
                title="Jump to 9:00 PM"
              >
                9 PM
              </button>
              <button 
                id="btn-reset-sim"
                onClick={handleResetSimulation}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors bg-[#1E293B] border border-[#334155] rounded cursor-pointer"
                title="Reset Simulation"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-4 flex-1">
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* LEFT COLUMN: STATISTICS, GRID, ALERTS (COVERS 8 COLS) */}
          <section className="lg:col-span-8 space-y-4">

          {/* REAL-TIME BENTO METRICS BAR */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" id="stats-dashboard">
            <div className="bg-[#11141A] border border-[#1E293B] p-3 rounded flex items-center gap-3 shadow-sm">
              <div className="p-2 rounded bg-amber-950/30 border border-amber-500/10 shrink-0">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">Live Load</span>
                <span className="font-mono font-bold text-base text-[#E2E8F0]">
                  {stats.livePower}<span className="text-[10px] text-slate-400 font-normal ml-1">W</span>
                </span>
              </div>
            </div>

            <div className="bg-[#11141A] border border-[#1E293B] p-3 rounded flex items-center gap-3 shadow-sm">
              <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/10 shrink-0">
                <BatteryCharging className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">Energy Used</span>
                <span className="font-mono font-bold text-base text-[#E2E8F0]">
                  {stats.energyUsageToday.toFixed(2)}<span className="text-[10px] text-slate-400 font-normal ml-1">kWh</span>
                </span>
              </div>
            </div>

            <div className="bg-[#11141A] border border-[#1E293B] p-3 rounded flex items-center gap-3 shadow-sm">
              <div className="p-2 rounded bg-cyan-950/30 border border-cyan-500/10 shrink-0">
                <Sliders className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">Devices ON</span>
                <span className="font-mono font-bold text-base text-[#E2E8F0]">
                  {stats.activeDevices}<span className="text-[10px] text-slate-400 font-normal ml-1">/{stats.totalDevices}</span>
                </span>
              </div>
            </div>

            <div className={`p-3 rounded border flex items-center gap-3 shadow-sm transition-all duration-300 ${
              activeAlerts.length > 0 
                ? "bg-red-950/20 border-red-500/30" 
                : "bg-[#11141A] border-[#1E293B]"
            }`}>
              <div className={`p-2 rounded border shrink-0 ${
                activeAlerts.length > 0 ? "bg-red-900/20 border-red-500/20" : "bg-slate-900/60 border-[#1E293B]"
              }`}>
                <AlertTriangle className={`w-4 h-4 ${activeAlerts.length > 0 ? "text-red-500 animate-bounce" : "text-slate-500"}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">Active Alerts</span>
                <span className={`font-mono font-bold text-base ${activeAlerts.length > 0 ? "text-red-500" : "text-[#E2E8F0]"}`}>
                  {activeAlerts.length}
                </span>
              </div>
            </div>
          </div>

          {/* CONTROLS & FILTERING RAIL */}
          <div className="bg-[#11141A] border border-[#1E293B] p-3 rounded flex flex-col md:flex-row items-center gap-3 justify-between" id="filtering-rail">
            
            {/* Search Input */}
            <div className="relative w-full md:w-60">
              <input
                type="text"
                placeholder="Search appliances..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1E293B] text-xs text-[#E2E8F0] placeholder-slate-500 rounded pl-8 pr-3 py-1.5 border border-[#334155] focus:outline-none focus:border-blue-500 font-sans"
              />
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              
              {/* Room select */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider mr-1">Room</span>
                {["All", "Drawing Room", "Work Room 1", "Work Room 2"].map((room) => (
                  <button
                    key={room}
                    onClick={() => setSelectedRoom(room)}
                    className={`px-2 py-1 rounded text-[10px] font-sans transition-all cursor-pointer ${
                      selectedRoom === room 
                        ? "bg-blue-600 text-white font-bold" 
                        : "bg-[#1E293B] border border-[#334155] text-slate-400 hover:text-[#E2E8F0] hover:bg-[#1E293B]/80"
                    }`}
                  >
                    {room === "Drawing Room" ? "Drawing" : room === "Work Room 1" ? "Work 1" : room === "Work Room 2" ? "Work 2" : "All"}
                  </button>
                ))}
              </div>

              {/* Status select */}
              <div className="flex items-center gap-1 md:ml-2">
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider mr-1">Status</span>
                {["All", "ON", "OFF"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`px-2 py-1 rounded text-[10px] font-sans transition-all cursor-pointer ${
                      selectedStatus === status 
                        ? "bg-blue-600 text-white font-bold" 
                        : "bg-[#1E293B] border border-[#334155] text-slate-400 hover:text-[#E2E8F0] hover:bg-[#1E293B]/80"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

            </div>

            {/* Layout switch buttons */}
            <div className="flex items-center gap-1 border-t md:border-t-0 pt-2.5 md:pt-0 border-[#1E293B] w-full md:w-auto justify-end">
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider mr-1">View</span>
              <button
                id="btn-layout-grid"
                onClick={() => setLayoutMode("grid")}
                className={`p-1.5 rounded transition-all cursor-pointer border ${
                  layoutMode === "grid" 
                    ? "bg-blue-600 border-blue-500 text-white font-bold" 
                    : "bg-[#1E293B] border-[#334155] text-slate-400 hover:text-[#E2E8F0]"
                }`}
                title="Bento Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-layout-floorplan"
                onClick={() => setLayoutMode("floorplan")}
                className={`p-1.5 rounded transition-all cursor-pointer border ${
                  layoutMode === "floorplan" 
                    ? "bg-blue-600 border-blue-500 text-white font-bold" 
                    : "bg-[#1E293B] border-[#334155] text-slate-400 hover:text-[#E2E8F0]"
                }`}
                title="Office Map Top-View Layout"
              >
                <Map className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          {/* DYNAMIC LAYOUT WINDOW */}
          <AnimatePresence mode="wait">
            {layoutMode === "grid" ? (
              
              // GRID VIEW
              <motion.div
                key="grid-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
                id="device-grid-layout"
              >
                {filteredDevices.length > 0 ? (
                  filteredDevices.map(device => (
                    <DeviceTile 
                      key={device.id} 
                      device={device} 
                      onToggle={handleToggleDevice} 
                    />
                  ))
                ) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-500">
                    <Search className="w-8 h-8 mb-2.5 opacity-40 text-amber-500" />
                    <p className="font-sans text-sm">No appliances match your current filters.</p>
                    <p className="font-sans text-xs opacity-60 mt-1">Try resetting search string or selecting 'All' rooms.</p>
                  </div>
                )}
              </motion.div>

            ) : (

              // INTERACTIVE FLOOR PLAN TOP-VIEW LAYOUT (BONUS VISUAL)
              <motion.div
                key="floorplan-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="bg-[#11141A] border border-[#1E293B] p-4 rounded flex flex-col"
                id="floor-plan-view"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#1E293B] mb-4">
                  <div>
                    <h3 className="font-sans font-semibold text-[#E2E8F0] text-xs uppercase tracking-wider">Interactive Office Floor Plan</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Click device icons inside rooms directly to command them.</p>
                  </div>
                  <div className="flex gap-3 font-mono text-[9px] text-slate-400 bg-[#0F1115] p-1.5 rounded border border-[#1E293B]">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded bg-blue-500" />
                      <span>ON (Glow)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded bg-slate-700" />
                      <span>OFF (Muted)</span>
                    </div>
                  </div>
                </div>

                {/* Simulated SVG Floorplan Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative p-1">
                  
                  {/* Drawing Room Block */}
                  <div className="relative min-h-[180px] bg-[#0F1115] rounded border border-[#1E293B] p-3 hover:border-blue-500/30 transition-all flex flex-col justify-between">
                    <div className="absolute top-2 right-2 font-mono text-[9px] font-bold text-slate-500 bg-[#11141A] px-1 py-0.5 rounded border border-[#1E293B]">
                      DRAWING
                    </div>
                    
                    <span className="font-sans font-bold text-xs text-slate-300">Drawing Room</span>
 
                    {/* Room Interior Layout representing specific physical coordinates */}
                    <div className="flex-1 grid grid-cols-3 gap-2 items-center justify-center p-2 my-1">
                      {devices.filter(d => d.room === "Drawing Room").map(d => {
                        const active = d.status === "on";
                        return (
                          <button
                            key={d.id}
                            onClick={() => handleToggleDevice(d.id)}
                            className={`p-1.5 rounded border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer hover:scale-[1.02] ${
                              active 
                                ? "bg-amber-950/30 border-amber-500/40 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.15)]"
                                : "bg-[#11141A] border-[#1E293B] text-slate-600 hover:text-slate-400 hover:border-slate-700"
                            }`}
                            title={`Toggle ${d.name} (${d.ratedWatts}W)`}
                          >
                            {d.type === "fan" && <Fan className={`w-3.5 h-3.5 ${active ? "animate-[spin_2s_linear_infinite]" : ""}`} />}
                            {d.type === "light" && <Lightbulb className="w-3.5 h-3.5" />}
                            <span className="font-mono text-[8px] truncate max-w-full font-bold">{d.name}</span>
                          </button>
                        );
                      })}
                    </div>
 
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1.5 border-t border-[#1E293B]">
                      <span>Live Draw:</span>
                      <span className="text-blue-400 font-bold">
                        {devices.filter(d => d.room === "Drawing Room" && d.status === "on").reduce((sum, d) => sum + d.ratedWatts, 0)} W
                      </span>
                    </div>
                  </div>

                  {/* Work Room 1 Block */}
                  <div className="relative min-h-[180px] bg-[#0F1115] rounded border border-[#1E293B] p-3 hover:border-blue-500/30 transition-all flex flex-col justify-between">
                    <div className="absolute top-2 right-2 font-mono text-[9px] font-bold text-slate-500 bg-[#11141A] px-1 py-0.5 rounded border border-[#1E293B]">
                      WORK 1
                    </div>

                    <span className="font-sans font-bold text-xs text-slate-300">Work Room 1</span>

                    <div className="flex-1 grid grid-cols-3 gap-2 items-center justify-center p-2 my-1">
                      {devices.filter(d => d.room === "Work Room 1").map(d => {
                        const active = d.status === "on";
                        return (
                          <button
                            key={d.id}
                            onClick={() => handleToggleDevice(d.id)}
                            className={`p-1.5 rounded border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer hover:scale-[1.02] ${
                              active 
                                ? "bg-amber-950/30 border-amber-500/40 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.15)]"
                                : "bg-[#11141A] border-[#1E293B] text-slate-600 hover:text-slate-400 hover:border-slate-700"
                            }`}
                            title={`Toggle ${d.name} (${d.ratedWatts}W)`}
                          >
                            {d.type === "fan" && <Fan className={`w-3.5 h-3.5 ${active ? "animate-[spin_2s_linear_infinite]" : ""}`} />}
                            {d.type === "light" && <Lightbulb className="w-3.5 h-3.5" />}
                            <span className="font-mono text-[8px] truncate max-w-full font-bold">{d.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1.5 border-t border-[#1E293B]">
                      <span>Live Draw:</span>
                      <span className="text-blue-400 font-bold">
                        {devices.filter(d => d.room === "Work Room 1" && d.status === "on").reduce((sum, d) => sum + d.ratedWatts, 0)} W
                      </span>
                    </div>
                  </div>

                  {/* Work Room 2 Block */}
                  <div className="relative min-h-[180px] bg-[#0F1115] rounded border border-[#1E293B] p-3 hover:border-blue-500/30 transition-all flex flex-col justify-between">
                    <div className="absolute top-2 right-2 font-mono text-[9px] font-bold text-slate-500 bg-[#11141A] px-1 py-0.5 rounded border border-[#1E293B]">
                      WORK 2
                    </div>

                    <span className="font-sans font-bold text-xs text-slate-300">Work Room 2</span>

                    <div className="flex-1 grid grid-cols-3 gap-2 items-center justify-center p-2 my-1">
                      {devices.filter(d => d.room === "Work Room 2").map(d => {
                        const active = d.status === "on";
                        return (
                          <button
                            key={d.id}
                            onClick={() => handleToggleDevice(d.id)}
                            className={`p-1.5 rounded border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer hover:scale-[1.02] ${
                              active 
                                ? "bg-amber-950/30 border-amber-500/40 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.15)]"
                                : "bg-[#11141A] border-[#1E293B] text-slate-600 hover:text-slate-400 hover:border-slate-700"
                            }`}
                            title={`Toggle ${d.name} (${d.ratedWatts}W)`}
                          >
                            {d.type === "fan" && <Fan className={`w-3.5 h-3.5 ${active ? "animate-[spin_2s_linear_infinite]" : ""}`} />}
                            {d.type === "light" && <Lightbulb className="w-3.5 h-3.5" />}
                            <span className="font-mono text-[8px] truncate max-w-full font-bold">{d.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1.5 border-t border-[#1E293B]">
                      <span>Live Draw:</span>
                      <span className="text-blue-400 font-bold">
                        {devices.filter(d => d.room === "Work Room 2" && d.status === "on").reduce((sum, d) => sum + d.ratedWatts, 0)} W
                      </span>
                    </div>
                  </div>

                </div>
              </motion.div>

            )}
          </AnimatePresence>

          {/* REAL-TIME HOURLY CONSUMPTION GRAPH (CHART.JS) */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl" id="analytics-panel">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-850">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <h3 className="font-sans font-semibold text-sm text-slate-200">Hourly Consumption Analysis</h3>
              </div>
              <span className="font-mono text-[10px] text-slate-500">Live 24-Hour Sliding Scale</span>
            </div>

            {usageHistory.length > 0 ? (
              <PowerChart history={usageHistory} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-slate-500 italic text-sm">
                Collecting historical tick data... Graph will render shortly.
              </div>
            )}
          </div>

        </section>

        {/* RIGHT COLUMN: DISCORD BOT, ACTIVE ALERTS, SCENARIOS (COVERS 4 COLS) */}
        <section className="lg:col-span-4 space-y-6">

          {/* SYSTEM ALERTS BOARD */}
          <div className="bg-[#11141A] border border-[#1E293B] p-3 rounded flex flex-col" id="alerts-panel">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1E293B]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                <h3 className="font-sans font-semibold text-xs text-[#E2E8F0] uppercase tracking-wider">Active System Alerts</h3>
              </div>
              {activeAlerts.length > 0 && (
                <button
                  id="btn-resolve-all"
                  onClick={handleResolveAllAlerts}
                  className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-950/70 rounded cursor-pointer transition-colors"
                >
                  Resolve All
                </button>
              )}
            </div>

            {/* Active alerts list */}
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {activeAlerts.length > 0 ? (
                activeAlerts.map(alert => (
                  <div 
                    key={alert.id}
                    id={`alert-row-${alert.id}`}
                    className="p-2.5 bg-red-955/10 border border-red-500/20 rounded flex gap-2.5 items-start"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-sans text-[11px] font-bold text-red-400">{alert.title}</h4>
                      <p className="text-[10px] text-slate-300 mt-0.5">{alert.message}</p>
                      <span className="font-mono text-[8px] text-slate-500 block mt-1 uppercase">
                        Triggered at {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 flex flex-col items-center justify-center border border-dashed border-[#1E293B] rounded bg-[#0F1115]/30 text-slate-500">
                  <CheckCircle className="w-5 h-5 mb-1.5 text-emerald-500 opacity-60" />
                  <p className="font-sans text-[11px] font-bold">All appliances compliant.</p>
                  <p className="font-mono text-[9px] opacity-60 mt-0.5">No unauthorized energy usage detected.</p>
                </div>
              )}
            </div>

            {/* DEMO SCENARIO SHORTCUTS */}
            <div className="mt-3 pt-2 border-t border-[#1E293B] bg-[#0F1115] p-2.5 rounded border border-[#1E293B]">
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                ⚠️ Scenario Injection Hooks (Safety Net)
              </span>
              <p className="text-[9px] text-slate-500 mt-0.5">
                Force specific alert violations instantly to verify live dashboard and Discord bot synchronization.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  id="btn-force-after-hours"
                  onClick={() => handleForceAlert("after-hours")}
                  className="bg-[#1E293B] border border-[#334155] hover:border-red-500/30 text-slate-300 px-2 py-1 rounded text-[10px] font-sans transition-all cursor-pointer"
                >
                  Force After-Hours
                </button>
                <button
                  id="btn-force-continuous"
                  onClick={() => handleForceAlert("continuous-on")}
                  className="bg-[#1E293B] border border-[#334155] hover:border-red-500/30 text-slate-300 px-2 py-1 rounded text-[10px] font-sans transition-all cursor-pointer"
                >
                  Force Cont. Fan {">"}2h
                </button>
              </div>
            </div>
          </div>

          {/* SAMPLE DATASET SECTION */}
          <div className="bg-[#11141A] border border-[#1E293B] p-3.5 rounded flex flex-col shadow-lg animate-fade-in" id="sample-dataset-panel">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1E293B]">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h3 className="font-sans font-semibold text-xs text-[#E2E8F0] uppercase tracking-wider font-bold">Sample Datasets</h3>
              </div>
              <span className="font-mono text-[9px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                Total: 64
              </span>
            </div>

            {/* Active Dataset Overview */}
            {(() => {
              const config = SAMPLE_DATASETS[currentDatasetIndex] || { DR: { fans: 0, lights: 0 }, W1: { fans: 0, lights: 0 }, W2: { fans: 0, lights: 0 } };
              return (
                <>
                  <div className="p-2.5 bg-[#0F1115]/60 border border-[#1E293B] rounded mb-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-sans font-bold text-xs text-slate-200">Dataset #{currentDatasetIndex + 1} Loaded</span>
                      <span className="font-mono text-[8px] px-1.5 py-0.5 bg-emerald-950/35 border border-emerald-500/30 text-emerald-400 rounded uppercase font-semibold">
                        Active
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Authoritative device state override applied dynamically to the interactive office floor plan.
                    </p>
                  </div>

                  {/* Room configurations breakdown */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <div className="bg-[#0F1115] border border-[#1E293B] p-2 rounded flex flex-col items-center">
                      <span className="font-sans text-[8px] text-slate-500 uppercase tracking-wider font-bold">DR (Drawing)</span>
                      <span className="font-sans text-xs font-bold text-blue-400 mt-1">
                        {config.DR.fans}F / {config.DR.lights}L
                      </span>
                    </div>
                    <div className="bg-[#0F1115] border border-[#1E293B] p-2 rounded flex flex-col items-center">
                      <span className="font-sans text-[8px] text-slate-500 uppercase tracking-wider font-bold">W1 (Work 1)</span>
                      <span className="font-sans text-xs font-bold text-blue-400 mt-1">
                        {config.W1.fans}F / {config.W1.lights}L
                      </span>
                    </div>
                    <div className="bg-[#0F1115] border border-[#1E293B] p-2 rounded flex flex-col items-center">
                      <span className="font-sans text-[8px] text-slate-500 uppercase tracking-wider font-bold">W2 (Work 2)</span>
                      <span className="font-sans text-xs font-bold text-blue-400 mt-1">
                        {config.W2.fans}F / {config.W2.lights}L
                      </span>
                    </div>
                  </div>

                  {/* Quick navigation index grid */}
                  <div className="mt-1 pt-2 border-t border-[#1E293B]">
                    <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold block mb-2.5">
                      Auto-Cycling Datasets (1-64) with Configuration:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 bg-[#0F1115] p-2 rounded border border-[#1E293B] max-h-[320px] overflow-y-auto" id="dataset-grid">
                      {SAMPLE_DATASETS.map((ds, i) => {
                        const isActive = currentDatasetIndex === i;
                        return (
                          <button
                            key={i}
                            id={`dataset-card-${i}`}
                            onClick={() => handleSwitchDatasetIndex(i)}
                            className={`flex flex-col p-2 rounded cursor-pointer transition-all border text-left ${
                              isActive
                                ? "bg-emerald-600/15 border-emerald-500 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)] animate-pulse-slow"
                                : "bg-[#1E293B]/40 border-[#334155]/40 text-slate-400 hover:text-[#E2E8F0] hover:bg-[#1E293B]/70 hover:border-slate-500"
                            }`}
                            title={`Load Dataset #${i + 1}`}
                          >
                            <div className="flex items-center justify-between border-b border-[#334155]/20 pb-1 mb-1.5 w-full">
                              <span className="font-mono text-[10px] font-bold text-slate-300">Dataset #{i + 1}</span>
                              {isActive ? (
                                <span className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  <span className="text-[7px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">Active</span>
                                </span>
                              ) : (
                                <span className="text-[7px] font-mono text-slate-500">View</span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-[8px] font-mono w-full">
                              <div className="flex flex-col items-center bg-[#0F1115]/90 p-0.5 rounded border border-[#1E293B]/60">
                                <span className="text-[7px] text-slate-500 font-semibold">DR</span>
                                <span className={`font-bold ${isActive ? "text-emerald-400" : "text-slate-300"}`}>{ds.DR.fans}F/{ds.DR.lights}L</span>
                              </div>
                              <div className="flex flex-col items-center bg-[#0F1115]/90 p-0.5 rounded border border-[#1E293B]/60">
                                <span className="text-[7px] text-slate-500 font-semibold">W1</span>
                                <span className={`font-bold ${isActive ? "text-emerald-400" : "text-slate-300"}`}>{ds.W1.fans}F/{ds.W1.lights}L</span>
                              </div>
                              <div className="flex flex-col items-center bg-[#0F1115]/90 p-0.5 rounded border border-[#1E293B]/60">
                                <span className="text-[7px] text-slate-500 font-semibold">W2</span>
                                <span className={`font-bold ${isActive ? "text-emerald-400" : "text-slate-300"}`}>{ds.W2.fans}F/{ds.W2.lights}L</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>



        </section>

        {/* FANS & LIGHTS DEVICE SWITCH HISTORY & LIVE STATUS */}
        <section className="lg:col-span-12 mt-2 animate-fade-in">
          <div className="bg-[#11141A] border border-[#1E293B] p-4.5 rounded-2xl flex flex-col shadow-xl" id="toggle-history-panel">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-2 border-b border-[#1E293B]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-sm text-[#E2E8F0] uppercase tracking-wider">Device Switch History & Operation Logs</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Real-time scrolling log of all appliances showing exact state transitions, timing, and wattage footprint.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-[#1E293B]/60 p-1 rounded border border-[#334155]/60">
                  <span className="font-mono text-[8px] text-slate-500 uppercase tracking-wider px-1">Filter Logs:</span>
                  {(["all", "on", "off"] as const).map((filterVal) => (
                    <button
                      key={filterVal}
                      onClick={() => setHistoryFilter(filterVal)}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all cursor-pointer ${
                        historyFilter === filterVal
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:text-[#E2E8F0]"
                      }`}
                    >
                      {filterVal}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[9px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 px-2 py-1 rounded font-bold uppercase tracking-wider animate-pulse-slow">
                  Active Load: {devices.filter(d => d.status === "on").length} / {devices.length} Devices On
                </span>
              </div>
            </div>

            {/* Live scrolling history log as requested by the user */}
            <div className="overflow-x-auto w-full rounded-lg border border-[#1E293B] bg-[#0F1115]/30 max-h-[480px] overflow-y-auto" id="device-history-table">
              <table className="w-full text-left border-collapse font-sans min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#1E293B] bg-[#0F1115] text-[10px] font-mono text-slate-400 uppercase tracking-wider sticky top-0">
                    <th className="py-3 px-4">Log Index</th>
                    <th className="py-3 px-4">Device (Fan or Light)</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Operation Event</th>
                    <th className="py-3 px-4">Device Power</th>
                    <th className="py-3 px-4 text-right">Logged Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/60 text-[11px] text-slate-300">
                  {filteredToggleHistory.length > 0 ? (
                    filteredToggleHistory.map((event, index) => {
                      const isOn = event.action === "on";
                      const isFan = event.deviceType === "fan";
                      const deviceWattage = devices.find(dev => dev.id === event.deviceId)?.ratedWatts || (isFan ? 45 : 9);
                      
                      // Format event timestamp nicely
                      const dateObj = new Date(event.timestamp);
                      const formattedTime = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                      const formattedDate = dateObj.toLocaleDateString([], { month: "short", day: "numeric" });

                      return (
                        <tr 
                          key={event.id} 
                          id={`history-row-${event.id}`}
                          className={`hover:bg-[#1E293B]/30 transition-colors ${
                            isOn ? "bg-emerald-500/[0.01]" : "bg-red-500/[0.01]"
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-slate-500">
                            #{filteredToggleHistory.length - index}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-200">
                            <div className="flex items-center gap-2.5">
                              <div className={`p-1.5 rounded-lg border shrink-0 ${
                                isOn 
                                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]" 
                                  : "bg-slate-950/40 border-slate-800 text-slate-500"
                              }`}>
                                {isFan ? (
                                  <Fan className={`w-3.5 h-3.5 ${isOn ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
                                ) : (
                                  <Lightbulb className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-sans text-xs text-slate-200">{event.deviceName}</span>
                                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">{event.deviceType}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-medium">
                            {event.room}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${
                              isOn
                                ? "bg-emerald-950/25 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                : "bg-red-950/25 border-red-500/30 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]"
                            }`}>
                              {isOn ? "SWITCHED ON" : "SWITCHED OFF"}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300 font-bold">
                            {deviceWattage} W
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-200 font-medium">{formattedTime}</span>
                              <span className="text-[9px] text-slate-500">{formattedDate}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                        No switch operations captured. Toggle any fan or light to record history in real-time!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </main>
    </div>

      {/* FOOTER - SYSTEM SPECIFICATION */}
      <footer className="max-w-7xl mx-auto mt-8 pt-4 border-t border-[#1E293B] flex flex-col sm:flex-row items-center justify-between gap-4 text-[9px] font-mono text-slate-500 uppercase tracking-wider" id="footer-section">
        <div className="flex items-center gap-2">
          <span>Smart Office Micro-grid v1.0.0</span>
          <span>•</span>
          <span>ESP32 Node (Simulated)</span>
          <span>•</span>
          <span>No-Refresh WS Stream</span>
        </div>
        <div className="text-right">
          <span>Techathon Nationals Preliminary Round • IUT Robotics Society</span>
        </div>
      </footer>

    </div>
  );
}
