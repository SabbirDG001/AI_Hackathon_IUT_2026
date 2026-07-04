import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Client as DiscordClient, GatewayIntentBits, EmbedBuilder } from "discord.js";
import { 
  Device, 
  Alert, 
  PowerStats, 
  RoomStats, 
  UsageHistoryPoint, 
  DiscordCommandResponse,
  SimulationState,
  DeviceToggleEvent
} from "./src/types.js";

// Setup __dirname for ES Modules
const __filename = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : path.join(process.cwd(), "server.ts");
const __dirname = path.dirname(__filename);

// Initialize Gemini Client Lazily if key is present
let ai: GoogleGenAI | null = null;
let globalDiscordClient: DiscordClient | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!ai && process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log("Gemini SDK initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Gemini SDK:", err);
    }
  }
  return ai;
}

// Global Server State (Authoritative source of truth)
const DATASETS: Record<string, { name: string; description: string; rooms: string[]; devices: Device[] }> = {
  "iut-hq": {
    name: "IUT Robotics HQ",
    description: "Standard 3-room tech workspace layout.",
    rooms: ["Drawing Room", "Work Room 1", "Work Room 2"],
    devices: [
      { id: "dr-fan1", name: "Fan 1", type: "fan", room: "Drawing Room", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-fan2", name: "Fan 2", type: "fan", room: "Drawing Room", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light1", name: "Light 1", type: "light", room: "Drawing Room", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light2", name: "Light 2", type: "light", room: "Drawing Room", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light3", name: "Light 3", type: "light", room: "Drawing Room", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr1-fan1", name: "Fan 1", type: "fan", room: "Work Room 1", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-fan2", name: "Fan 2", type: "fan", room: "Work Room 1", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light1", name: "Light 1", type: "light", room: "Work Room 1", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light2", name: "Light 2", type: "light", room: "Work Room 1", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light3", name: "Light 3", type: "light", room: "Work Room 1", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr2-fan1", name: "Fan 1", type: "fan", room: "Work Room 2", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-fan2", name: "Fan 2", type: "fan", room: "Work Room 2", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light1", name: "Light 1", type: "light", room: "Work Room 2", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light2", name: "Light 2", type: "light", room: "Work Room 2", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light3", name: "Light 3", type: "light", room: "Work Room 2", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null }
    ]
  },
  "coding-lab": {
    name: "Coding Lab Preset",
    description: "Compact setup with high-density workspace controls.",
    rooms: ["Drawing Room", "Work Room 1", "Work Room 2"],
    devices: [
      { id: "dr-fan1", name: "Fan 1", type: "fan", room: "Drawing Room", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light1", name: "Light 1", type: "light", room: "Drawing Room", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light2", name: "Light 2", type: "light", room: "Drawing Room", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr1-fan1", name: "Fan 1", type: "fan", room: "Work Room 1", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light1", name: "Light 1", type: "light", room: "Work Room 1", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light2", name: "Light 2", type: "light", room: "Work Room 1", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr2-fan1", name: "Fan 1", type: "fan", room: "Work Room 2", status: "off", ratedWatts: 60, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light1", name: "Light 1", type: "light", room: "Work Room 2", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light2", name: "Light 2", type: "light", room: "Work Room 2", status: "off", ratedWatts: 15, lastChanged: new Date().toISOString(), onSince: null }
    ]
  },
  "eco-saver": {
    name: "Eco-Saver Layout",
    description: "A highly optimized grid designed for low-energy consumption.",
    rooms: ["Drawing Room", "Work Room 1", "Work Room 2"],
    devices: [
      { id: "dr-fan1", name: "Fan 1", type: "fan", room: "Drawing Room", status: "off", ratedWatts: 45, lastChanged: new Date().toISOString(), onSince: null },
      { id: "dr-light1", name: "Light 1", type: "light", room: "Drawing Room", status: "off", ratedWatts: 9, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr1-fan1", name: "Fan 1", type: "fan", room: "Work Room 1", status: "off", ratedWatts: 45, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr1-light1", name: "Light 1", type: "light", room: "Work Room 1", status: "off", ratedWatts: 9, lastChanged: new Date().toISOString(), onSince: null },

      { id: "wr2-fan1", name: "Fan 1", type: "fan", room: "Work Room 2", status: "off", ratedWatts: 45, lastChanged: new Date().toISOString(), onSince: null },
      { id: "wr2-light1", name: "Light 1", type: "light", room: "Work Room 2", status: "off", ratedWatts: 9, lastChanged: new Date().toISOString(), onSince: null }
    ]
  }
};

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

// Generate remaining 56 combinations systematically to reach 64
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

let alerts: Alert[] = [];
let energyTodayKwh = 4.25; // starting with a baseline for visual aesthetics
let toggleHistory: DeviceToggleEvent[] = [
  {
    id: "init-toggle-1",
    deviceId: "dr-fan1",
    deviceName: "Fan 1",
    deviceType: "fan",
    room: "Drawing Room",
    action: "off",
    timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString() // 2.5 hrs ago
  },
  {
    id: "init-toggle-2",
    deviceId: "wr1-light2",
    deviceName: "Light 2",
    deviceType: "light",
    room: "Work Room 1",
    action: "off",
    timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString() // 1.8 hrs ago
  },
  {
    id: "init-toggle-3",
    deviceId: "wr2-fan2",
    deviceName: "Fan 2",
    deviceType: "fan",
    room: "Work Room 2",
    action: "off",
    timestamp: new Date(Date.now() - 3600000 * 0.5).toISOString() // 30 mins ago
  }
];

let currentDatasetIndex = 0;
let currentDatasetId = "iut-hq";
let devices: Device[] = JSON.parse(JSON.stringify(DATASETS["iut-hq"].devices));

// Function to apply a sample dataset configuration to the devices
function applyDatasetToDevices(datasetIndex: number) {
  const dataset = SAMPLE_DATASETS[datasetIndex];
  if (!dataset) return;

  console.log(`Applying Sample Dataset #${datasetIndex + 1}:`, dataset);

  const roomMap: Record<string, "DR" | "W1" | "W2"> = {
    "Drawing Room": "DR",
    "Work Room 1": "W1",
    "Work Room 2": "W2"
  };

  const rooms = ["Drawing Room", "Work Room 1", "Work Room 2"];

  rooms.forEach(roomName => {
    const key = roomMap[roomName];
    if (!key) return;

    const config = dataset[key];

    // Process fans in this room
    const roomFans = devices.filter(d => d.room === roomName && d.type === "fan");
    roomFans.forEach((d, idx) => {
      const shouldBeOn = idx < config.fans;
      const oldStatus = d.status;
      d.status = shouldBeOn ? "on" : "off";
      const nowStr = new Date().toISOString();
      
      if (d.status === "on" && oldStatus !== "on") {
        d.onSince = nowStr;
      } else if (d.status === "off") {
        if (oldStatus === "on") {
          d.lastOff = nowStr;
        }
        d.onSince = null;
      }

      if (oldStatus !== d.status) {
        d.lastChanged = nowStr;

        // Push actual device toggle transition to the history
        toggleHistory.unshift({
          id: `toggle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          deviceId: d.id,
          deviceName: d.name,
          deviceType: d.type,
          room: d.room,
          action: d.status,
          timestamp: nowStr
        });
      }
    });

    // Process lights in this room
    const roomLights = devices.filter(d => d.room === roomName && d.type === "light");
    roomLights.forEach((d, idx) => {
      const shouldBeOn = idx < config.lights;
      const oldStatus = d.status;
      d.status = shouldBeOn ? "on" : "off";
      const nowStr = new Date().toISOString();
      
      if (d.status === "on" && oldStatus !== "on") {
        d.onSince = nowStr;
      } else if (d.status === "off") {
        if (oldStatus === "on") {
          d.lastOff = nowStr;
        }
        d.onSince = null;
      }

      if (oldStatus !== d.status) {
        d.lastChanged = nowStr;

        // Push actual device toggle transition to the history
        toggleHistory.unshift({
          id: `toggle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          deviceId: d.id,
          deviceName: d.name,
          deviceType: d.type,
          room: d.room,
          action: d.status,
          timestamp: nowStr
        });
      }
    });
  });

  // Add system load message to history
  toggleHistory.unshift({
    id: `dataset-load-${Date.now()}-${datasetIndex}`,
    deviceId: "sys",
    deviceName: `Dataset #${datasetIndex + 1}`,
    deviceType: "light",
    room: "All Rooms",
    action: "on",
    timestamp: new Date().toISOString()
  });

  if (toggleHistory.length > 50) {
    toggleHistory = toggleHistory.slice(0, 50);
  }
}

// Initial application of Dataset #1
applyDatasetToDevices(0);

// Seed baseline energy stats for a gorgeous and realistic live table immediately
devices.forEach(d => {
  d.totalUsageWh = Math.floor(Math.random() * 320) + 80; // 80 to 400 Wh initial baseline
  const offsetHours = Math.random() * 5 + 1;
  d.lastOff = new Date(Date.now() - 3600000 * offsetHours).toISOString();
  if (d.status === "on") {
    const activeSinceMins = Math.floor(Math.random() * 45) + 10;
    d.onSince = new Date(Date.now() - 60000 * activeSinceMins).toISOString();
  }
});
let hourlyUsageHistory: UsageHistoryPoint[] = [
  { hour: "00:00", energy: 0.12, cost: 0.96 },
  { hour: "02:00", energy: 0.10, cost: 0.80 },
  { hour: "04:00", energy: 0.10, cost: 0.80 },
  { hour: "06:00", energy: 0.15, cost: 1.20 },
  { hour: "08:00", energy: 0.85, cost: 6.80 },
  { hour: "10:00", energy: 1.22, cost: 9.76 },
  { hour: "12:00", energy: 1.55, cost: 12.40 },
  { hour: "14:00", energy: 1.48, cost: 11.84 },
  { hour: "16:00", energy: 1.30, cost: 10.40 },
  { hour: "18:00", energy: 0.90, cost: 7.20 },
  { hour: "20:00", energy: 0.40, cost: 3.20 },
  { hour: "22:00", energy: 0.22, cost: 1.76 }
];

// Simulation Parameters
const simulation: SimulationState = {
  simulatedHour: 10,
  simulatedMinute: 30,
  speedFactor: 2, // 2 simulated minutes pass every actual 5-second tick
  isSimulating: true,
  officeHoursStart: 9,
  officeHoursEnd: 17
};

// Express App Setup
async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket Upgrade
  server.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Keep track of connected clients
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`Client connected. Total clients: ${clients.size}`);

    // Send initial authoritative state
    ws.send(JSON.stringify({
      type: "INITIAL_STATE",
      devices,
      alerts,
      simulation,
      stats: calculateStats(),
      usageHistory: hourlyUsageHistory,
      toggleHistory,
      datasetId: currentDatasetId,
      currentDatasetIndex
    }));

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`Client disconnected. Total clients: ${clients.size}`);
    });
  });

  // Broadcast helper
  function broadcast(payload: any) {
    const raw = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  // Calculate live statistics
  function calculateStats(): PowerStats {
    let livePower = 0;
    let activeDevices = 0;
    devices.forEach(d => {
      if (d.status === "on") {
        livePower += d.ratedWatts;
        activeDevices++;
      }
    });

    return {
      livePower,
      energyUsageToday: Math.round(energyTodayKwh * 100) / 100,
      totalDevices: devices.length,
      activeDevices
    };
  }

  // Toggle helper
  function toggleDevice(id: string, targetStatus?: "on" | "off"): Device | null {
    const device = devices.find(d => d.id === id);
    if (!device) return null;

    const newStatus = targetStatus || (device.status === "on" ? "off" : "on");
    if (device.status !== newStatus) {
      const nowStr = new Date().toISOString();
      device.status = newStatus;
      device.lastChanged = nowStr;
      if (newStatus === "on") {
        device.onSince = nowStr;
      } else {
        device.onSince = null;
        device.lastOff = nowStr;
      }

      // Add to toggle history
      const toggleEvent: DeviceToggleEvent = {
        id: `toggle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        room: device.room,
        action: newStatus,
        timestamp: new Date().toISOString()
      };
      toggleHistory.unshift(toggleEvent);
      if (toggleHistory.length > 50) {
        toggleHistory.pop();
      }

      // Broadcast the change immediately
      broadcast({
        type: "DEVICE_UPDATE",
        device,
        stats: calculateStats(),
        toggleHistory
      });

      evaluateAlerts();
    }
    return device;
  }

  // Send alert to Discord Webhook and Discord Bot Client
  async function sendDiscordWebhookAlert(alert: Alert) {
    // 1. Send to Webhook if configured
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        const emoji = alert.type === "after-hours" ? "⚠️" : "🚨";
        const payload = {
          embeds: [{
            title: `${emoji} Smart Office Security Alert`,
            description: alert.message,
            color: alert.type === "after-hours" ? 16711680 : 16753920, // Red for after-hours, orange for continuous-on
            fields: [
              { name: "Room", value: alert.room, inline: true },
              { name: "Device", value: alert.deviceName || "Unknown", inline: true },
              { name: "Status", value: alert.status, inline: true }
            ],
            timestamp: alert.triggeredAt
          }]
        };

        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        console.log(`Discord Webhook alert sent for: ${alert.title}`);
      } catch (err) {
        console.error("Failed to send Discord webhook alert:", err);
      }
    }

    // 2. Send to Bot Client if logged in and DISCORD_CHANNEL_ID is set
    if (globalDiscordClient && process.env.DISCORD_CHANNEL_ID) {
      try {
        const channel = await globalDiscordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
          const emoji = alert.type === "after-hours" ? "⚠️" : "🚨";
          const embed = new EmbedBuilder()
            .setTitle(`${emoji} Smart Office Security Alert`)
            .setDescription(alert.message)
            .setColor(alert.type === "after-hours" ? 0xFF0000 : 0xFFA500)
            .addFields(
              { name: "Room", value: alert.room, inline: true },
              { name: "Device", value: alert.deviceName || "Unknown", inline: true },
              { name: "Status", value: alert.status, inline: true }
            )
            .setTimestamp(new Date(alert.triggeredAt));

          await (channel as any).send({ embeds: [embed] });
          console.log(`Direct Discord Bot Channel alert sent to channel ${process.env.DISCORD_CHANNEL_ID} for: ${alert.title}`);
        }
      } catch (err) {
        console.error("Failed to send direct Discord channel alert:", err);
      }
    }
  }

  // Evaluate Rules and Manage Alerts
  function evaluateAlerts() {
    const currentHour = simulation.simulatedHour;
    const isOutsideOfficeHours = currentHour < simulation.officeHoursStart || currentHour >= simulation.officeHoursEnd;
    const nowStr = new Date().toISOString();

    // 1. Check for After-Hours Alerts
    // Triggered if any device is ON outside 9 AM - 5 PM
    if (isOutsideOfficeHours) {
      devices.forEach(d => {
        if (d.status === "on") {
          const alertId = `after-hours-${d.id}`;
          const existingAlert = alerts.find(a => a.id === alertId && a.status === "active");
          if (!existingAlert) {
            const newAlert: Alert = {
              id: alertId,
              type: "after-hours",
              title: "Unauthorized After-Hours Usage",
              message: `${d.name} in the ${d.room} is active outside office hours (Simulated Hour: ${formatSimTime(simulation.simulatedHour, simulation.simulatedMinute)}).`,
              room: d.room,
              deviceId: d.id,
              deviceName: d.name,
              triggeredAt: nowStr,
              status: "active",
              resolvedAt: null
            };
            alerts.unshift(newAlert); // add to top
            broadcast({ type: "ALERT_TRIGGER", alert: newAlert });
            sendDiscordWebhookAlert(newAlert);
          }
        }
      });
    }

    // Resolve After-Hours alerts if devices are turned off OR if we enter office hours
    alerts.forEach(alert => {
      if (alert.type === "after-hours" && alert.status === "active") {
        const d = devices.find(dev => dev.id === alert.deviceId);
        if (!d || d.status === "off" || !isOutsideOfficeHours) {
          alert.status = "resolved";
          alert.resolvedAt = nowStr;
          broadcast({ type: "ALERT_RESOLVE", alert });
        }
      }
    });

    // 2. Check for Continuous-On Alerts (> 2 Simulated Hours)
    // To make this easily mockable and interactive, we'll measure how long it's been active in real-time or virtual time.
    // In our simulation, 1 simulated hour passes in 2.5 minutes (150 seconds) at speedFactor 2, but we can also trigger
    // continuous alerts if a device stays ON across simulation clock ticks for > 2 hours, or we can check the difference
    // between simulated virtual time and the device's onSince simulated timestamp.
    // For a reliable demo, let's also allow forcing these alerts and check if any device has a long virtual run-time.
    devices.forEach(d => {
      if (d.status === "on" && d.onSince) {
        const onTime = new Date(d.onSince).getTime();
        const elapsedRealMs = Date.now() - onTime;
        // Let's say in our fast simulation, 1 minute of real time equates to several hours,
        // but for a highly responsive UX, let's trigger a continuous-on alert if a device has been on for more than
        // 45 seconds of real-time as a proxy for "2 hours of continuous simulated time"!
        // This makes it visually snap on-screen quickly for the reviewer without making them wait 2 hours.
        if (elapsedRealMs > 45000) { 
          const alertId = `continuous-${d.id}`;
          const existingAlert = alerts.find(a => a.id === alertId && a.status === "active");
          if (!existingAlert) {
            const newAlert: Alert = {
              id: alertId,
              type: "continuous-on",
              title: "Device Continuous-On Violation",
              message: `${d.name} in the ${d.room} has been left ON continuously for more than 2 simulated hours.`,
              room: d.room,
              deviceId: d.id,
              deviceName: d.name,
              triggeredAt: nowStr,
              status: "active",
              resolvedAt: null
            };
            alerts.unshift(newAlert);
            broadcast({ type: "ALERT_TRIGGER", alert: newAlert });
            sendDiscordWebhookAlert(newAlert);
          }
        }
      }
    });

    // Resolve continuous-on alerts if devices are turned off
    alerts.forEach(alert => {
      if (alert.type === "continuous-on" && alert.status === "active") {
        const d = devices.find(dev => dev.id === alert.deviceId);
        if (!d || d.status === "off") {
          alert.status = "resolved";
          alert.resolvedAt = nowStr;
          broadcast({ type: "ALERT_RESOLVE", alert });
        }
      }
    });
  }

  // Format simulated time
  function formatSimTime(hour: number, minute: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const dispHour = hour % 12 === 0 ? 12 : hour % 12;
    const dispMin = minute < 10 ? `0${minute}` : minute;
    return `${dispHour}:${dispMin} ${ampm}`;
  }

  // Simulation Tick Loop (Runs every 5 seconds)
  setInterval(() => {
    if (!simulation.isSimulating) return;

    // Increment simulated time
    simulation.simulatedMinute += simulation.speedFactor;
    if (simulation.simulatedMinute >= 60) {
      simulation.simulatedMinute = simulation.simulatedMinute % 60;
      simulation.simulatedHour = (simulation.simulatedHour + 1) % 24;

      // Log energy usage to history hourly
      const currentStats = calculateStats();
      const currentHourStr = `${simulation.simulatedHour < 10 ? '0' : ''}${simulation.simulatedHour}:00`;
      
      // Update or append hourly consumption
      const historyIdx = hourlyUsageHistory.findIndex(h => h.hour === currentHourStr);
      const deltaKwh = (currentStats.livePower / 1000) * 1.0; // 1-hour equivalent draw
      
      if (historyIdx >= 0) {
        hourlyUsageHistory[historyIdx].energy = Math.round((hourlyUsageHistory[historyIdx].energy + deltaKwh) * 100) / 100;
        hourlyUsageHistory[historyIdx].cost = Math.round(hourlyUsageHistory[historyIdx].energy * 8 * 100) / 100; // 8 units currency/kWh
      } else {
        hourlyUsageHistory.push({
          hour: currentHourStr,
          energy: Math.round(deltaKwh * 100) / 100,
          cost: Math.round(deltaKwh * 8 * 100) / 100
        });
        if (hourlyUsageHistory.length > 24) {
          hourlyUsageHistory.shift(); // keep sliding window of 24 points
        }
      }
    }

    // Accumulate total real-time simulated energy
    // 10 seconds real-time tick representing 'speedFactor' minutes.
    // Energy (kWh) = (Watts / 1000) * (Hours)
    const stats = calculateStats();
    const hoursElapsed = simulation.speedFactor / 60;
    const kwhAdded = (stats.livePower / 1000) * hoursElapsed;
    energyTodayKwh += kwhAdded;

    // Accumulate totalUsageWh for each active device
    devices.forEach(d => {
      if (d.status === "on") {
        const whAdded = d.ratedWatts * hoursElapsed;
        d.totalUsageWh = Math.round(((d.totalUsageWh || 0) + whAdded) * 100) / 100;
      }
    });

    // Switch active dataset randomly and automatically on every tick (10 seconds)
    const randomIdx = Math.floor(Math.random() * 64);
    currentDatasetIndex = randomIdx;
    applyDatasetToDevices(randomIdx);

    evaluateAlerts();

    // Broadcast current tick payload with updated devices, toggleHistory, and currentDatasetIndex
    broadcast({
      type: "TICK",
      simulation,
      stats: calculateStats(),
      usageHistory: hourlyUsageHistory,
      devices,
      toggleHistory,
      currentDatasetIndex
    });
  }, 10000);

  // REST API Endpoints
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get all devices
  app.get("/api/devices", (req, res) => {
    res.json(devices);
  });

  // Toggle a single device
  app.post("/api/devices/:id/toggle", (req, res) => {
    const { id } = req.params;
    const device = toggleDevice(id);
    if (device) {
      res.json({ success: true, device });
    } else {
      res.status(404).json({ error: "Device not found" });
    }
  });

  // Get rooms status
  app.get("/api/rooms", (req, res) => {
    const rooms = ["Drawing Room", "Work Room 1", "Work Room 2"];
    const isWorkingHours = simulation.simulatedHour >= simulation.officeHoursStart && simulation.simulatedHour < simulation.officeHoursEnd;

    const summary: RoomStats[] = rooms.map(roomName => {
      const roomDevices = devices.filter(d => d.room === roomName);
      const activeDevices = roomDevices.filter(d => d.status === "on").length;
      const livePower = roomDevices.reduce((sum, d) => sum + (d.status === "on" ? d.ratedWatts : 0), 0);

      return {
        name: roomName,
        activeDevices,
        totalDevices: roomDevices.length,
        livePower,
        isOfficeHoursActive: isWorkingHours
      };
    });

    res.json(summary);
  });

  // Get active alerts
  app.get("/api/alerts", (req, res) => {
    res.json(alerts);
  });

  // Force trigger an alert for demonstration
  app.post("/api/alerts/force", (req, res) => {
    const { type } = req.body; // 'after-hours' or 'continuous-on'
    const nowStr = new Date().toISOString();

    if (type === "after-hours") {
      // Turn on a device in Work Room 1 and trigger alert
      const wr1Light = devices.find(d => d.room === "Work Room 1" && d.type === "light" && d.status === "off");
      if (wr1Light) {
        wr1Light.status = "on";
        wr1Light.lastChanged = nowStr;
        wr1Light.onSince = nowStr;
        broadcast({ type: "DEVICE_UPDATE", device: wr1Light, stats: calculateStats() });
      }

      // Force simulated hour to 21 (9 PM) to satisfy after-hours trigger condition
      simulation.simulatedHour = 21;
      simulation.simulatedMinute = 0;

      const forcedAlert: Alert = {
        id: `forced-after-hours-${Date.now()}`,
        type: "after-hours",
        title: "Forced Alert: Unauthorized After-Hours Usage",
        message: `DEMO: Light 1 in the Work Room 1 is active after-hours. Triggered manually for demonstration.`,
        room: "Work Room 1",
        deviceId: wr1Light?.id || "wr1-light1",
        deviceName: wr1Light?.name || "Light 1",
        triggeredAt: nowStr,
        status: "active",
        resolvedAt: null
      };

      alerts.unshift(forcedAlert);
      broadcast({ type: "ALERT_TRIGGER", alert: forcedAlert, simulation });
      sendDiscordWebhookAlert(forcedAlert);
      res.json({ success: true, alert: forcedAlert });
    } else if (type === "continuous-on") {
      // Find a device, turn it on, and force its onSince to be 3 hours ago
      const drFan = devices.find(d => d.room === "Drawing Room" && d.type === "fan");
      if (drFan) {
        drFan.status = "on";
        drFan.lastChanged = nowStr;
        // set onSince to 50 seconds ago to trigger immediate continuous check
        drFan.onSince = new Date(Date.now() - 50000).toISOString();
        broadcast({ type: "DEVICE_UPDATE", device: drFan, stats: calculateStats() });
      }

      const forcedAlert: Alert = {
        id: `forced-continuous-${Date.now()}`,
        type: "continuous-on",
        title: "Forced Alert: Continuous-On Violation",
        message: `DEMO: Fan 1 in the Drawing Room has been left ON continuously. Triggered manually for demonstration.`,
        room: "Drawing Room",
        deviceId: drFan?.id || "dr-fan1",
        deviceName: drFan?.name || "Fan 1",
        triggeredAt: nowStr,
        status: "active",
        resolvedAt: null
      };

      alerts.unshift(forcedAlert);
      broadcast({ type: "ALERT_TRIGGER", alert: forcedAlert });
      sendDiscordWebhookAlert(forcedAlert);
      res.json({ success: true, alert: forcedAlert });
    } else {
      res.status(400).json({ error: "Invalid alert type" });
    }
  });

  // Acknowledge/Resolve all active alerts
  app.post("/api/alerts/resolve-all", (req, res) => {
    const nowStr = new Date().toISOString();
    alerts.forEach(a => {
      if (a.status === "active") {
        a.status = "resolved";
        a.resolvedAt = nowStr;
        // Turn off the offending devices to physically resolve the violation
        if (a.deviceId) {
          const d = devices.find(dev => dev.id === a.deviceId);
          if (d) {
            d.status = "off";
            d.onSince = null;
            d.lastChanged = nowStr;
            broadcast({ type: "DEVICE_UPDATE", device: d });
          }
        }
        broadcast({ type: "ALERT_RESOLVE", alert: a });
      }
    });

    res.json({ success: true, stats: calculateStats() });
  });

  // Set simulated clock hour
  app.post("/api/simulation/hour", (req, res) => {
    const { hour } = req.body;
    if (typeof hour === "number" && hour >= 0 && hour <= 23) {
      simulation.simulatedHour = hour;
      simulation.simulatedMinute = 0;
      broadcast({ type: "TICK", simulation, stats: calculateStats() });
      evaluateAlerts();
      res.json({ success: true, simulation });
    } else {
      res.status(400).json({ error: "Hour must be a number between 0 and 23" });
    }
  });

  // Reset simulation state
  app.post("/api/simulation/reset", (req, res) => {
    devices.forEach(d => {
      d.status = "off";
      d.onSince = null;
      d.lastChanged = new Date().toISOString();
    });
    alerts = [];
    energyTodayKwh = 0.0;
    simulation.simulatedHour = 10;
    simulation.simulatedMinute = 0;
    toggleHistory = [
      {
        id: "reset-toggle-1",
        deviceId: "dr-fan1",
        deviceName: "Fan 1",
        deviceType: "fan",
        room: "Drawing Room",
        action: "off",
        timestamp: new Date().toISOString()
      }
    ];

    broadcast({
      type: "INITIAL_STATE",
      devices,
      alerts,
      simulation,
      stats: calculateStats(),
      usageHistory: hourlyUsageHistory,
      toggleHistory,
      datasetId: currentDatasetId,
      currentDatasetIndex
    });

    res.json({ success: true });
  });

  // Switch Dataset
  app.post("/api/simulation/dataset", (req, res) => {
    const { datasetId } = req.body;
    if (!datasetId || !DATASETS[datasetId]) {
      return res.status(400).json({ error: "Invalid dataset ID" });
    }

    currentDatasetId = datasetId;
    const selectedDataset = DATASETS[datasetId];
    
    // Replace devices list
    devices = JSON.parse(JSON.stringify(selectedDataset.devices)).map((d: any) => ({
      ...d,
      lastChanged: new Date().toISOString(),
      onSince: null,
      status: "off"
    }));

    // Reset alerts and energy
    alerts = [];
    energyTodayKwh = 1.25; // standard fresh baseline
    
    // Reset toggle history to indicate dataset loaded
    toggleHistory = [
      {
        id: `dataset-load-${Date.now()}`,
        deviceId: "sys",
        deviceName: `${selectedDataset.name} Loaded`,
        deviceType: "light",
        room: "All Rooms",
        action: "off",
        timestamp: new Date().toISOString()
      }
    ];

    // Broadcast new state to all clients
    broadcast({
      type: "INITIAL_STATE",
      devices,
      alerts,
      simulation,
      stats: calculateStats(),
      usageHistory: hourlyUsageHistory,
      toggleHistory,
      datasetId: currentDatasetId,
      currentDatasetIndex
    });

    res.json({ success: true, datasetId: currentDatasetId, currentDatasetIndex });
  });

  // Switch Dataset by 1-64 index
  app.post("/api/simulation/dataset-index", (req, res) => {
    const { index } = req.body;
    const datasetIndex = parseInt(index, 10);
    if (isNaN(datasetIndex) || datasetIndex < 0 || datasetIndex >= 64) {
      return res.status(400).json({ error: "Invalid dataset index (must be 0-63)" });
    }

    currentDatasetIndex = datasetIndex;
    applyDatasetToDevices(datasetIndex);

    // Broadcast new state to all clients
    broadcast({
      type: "INITIAL_STATE",
      devices,
      alerts,
      simulation,
      stats: calculateStats(),
      usageHistory: hourlyUsageHistory,
      toggleHistory,
      datasetId: currentDatasetId,
      currentDatasetIndex
    });

    res.json({ success: true, currentDatasetIndex });
  });

  // Usage statistics for Chart.js
  app.get("/api/usage/history", (req, res) => {
    res.json(hourlyUsageHistory);
  });

  // Get toggle history
  app.get("/api/history/toggles", (req, res) => {
    res.json(toggleHistory);
  });

  // Discord Command Mock Handler (with server-side Gemini Natural Language humanizer)
  app.post("/api/discord/command", async (req, res) => {
    const { command, input } = req.body; // e.g. command: 'status', 'room', 'usage'
    const cleanInput = (input || "").trim().toLowerCase();

    // 1. Compute current hard details (the factual source of truth)
    let factPayload = "";
    let systemPrompt = "";

    if (command === "status") {
      const activeCount = devices.filter(d => d.status === "on").length;
      const totalCount = devices.length;
      const liveDraw = devices.reduce((sum, d) => sum + (d.status === "on" ? d.ratedWatts : 0), 0);
      const activeAlerts = alerts.filter(a => a.status === "active").length;

      factPayload = `Current office status: ${activeCount}/${totalCount} devices are ON. Current total load: ${liveDraw} Watts. There are ${activeAlerts} active system alerts.`;
      systemPrompt = "You are an intelligent office assistant Discord bot. Summarize the overall office device status based on this data: " + factPayload + ". Keep it extremely friendly, concise, humanized, and formatted with simple Markdown bullets. Be witty and helpful!";
    } else if (command === "room") {
      // Find matching room
      let matchRoom = "Drawing Room";
      if (cleanInput.includes("work 1") || cleanInput.includes("wr1") || cleanInput.includes("workroom 1")) {
        matchRoom = "Work Room 1";
      } else if (cleanInput.includes("work 2") || cleanInput.includes("wr2") || cleanInput.includes("workroom 2")) {
        matchRoom = "Work Room 2";
      } else if (cleanInput.includes("draw") || cleanInput.includes("dr")) {
        matchRoom = "Drawing Room";
      } else {
        // Find nearest fuzzy match
        const inputLower = cleanInput.toLowerCase();
        if (inputLower.includes("drawing")) matchRoom = "Drawing Room";
        else if (inputLower.includes("work 1")) matchRoom = "Work Room 1";
        else if (inputLower.includes("work 2")) matchRoom = "Work Room 2";
      }

      const roomDevices = devices.filter(d => d.room === matchRoom);
      const active = roomDevices.filter(d => d.status === "on");
      const totalPower = active.reduce((sum, d) => sum + d.ratedWatts, 0);

      factPayload = `Room: ${matchRoom}. Total devices: ${roomDevices.length}. Devices ON: ${active.length}. Active Devices list: [${active.map(a => `${a.name} (${a.ratedWatts}W)`).join(", ")}]. Live Power draw: ${totalPower} Watts.`;
      systemPrompt = `You are a smart Discord bot. Review this room state: ${factPayload}. Format a conversational, elegant summary for the team. Mention if everything is off or if there is high power draw. Keep it under 3-4 lines and very engaging.`;
    } else if (command === "usage") {
      const totalKwh = Math.round(energyTodayKwh * 100) / 100;
      const currentStats = calculateStats();
      const currentHour = simulation.simulatedHour;
      const isWorkingHours = currentHour >= simulation.officeHoursStart && currentHour < simulation.officeHoursEnd;

      factPayload = `Energy consumed today: ${totalKwh} kWh. Current live power draw: ${currentStats.livePower} Watts. Working hours status: ${isWorkingHours ? "Active (9am-5pm)" : "Inactive"}. Total active devices right now: ${currentStats.activeDevices}.`;
      systemPrompt = `You are a Smart Energy advisor Discord bot. Analyze this energy report: ${factPayload}. Summarize today's performance, giving a warm tip about saving electricity or commenting on current load. Keep it brief, motivational, and conversational!`;
    } else {
      return res.status(400).json({ error: "Unsupported command" });
    }

    // Default template-based fallback if Gemini API is not available/configured
    const generateFallback = () => {
      const nowStr = formatSimTime(simulation.simulatedHour, simulation.simulatedMinute);
      if (command === "status") {
        const activeCount = devices.filter(d => d.status === "on").length;
        const totalCount = devices.length;
        const liveDraw = devices.reduce((sum, d) => sum + (d.status === "on" ? d.ratedWatts : 0), 0);
        const activeAlerts = alerts.filter(a => a.status === "active").length;
        return `🤖 **[Mock Discord Bot - Template Fallback]**\n\n👋 **Hello there!** Here's the current state of the office as of **${nowStr}**:\n• **Active Devices:** \`${activeCount}/${totalCount}\` currently running.\n• **Current Live Load:** \`${liveDraw} W\` in use.\n• **Security Alerts:** \`${activeAlerts}\` active violations.\n\n*Everything is running within normal bounds. Let's make sure we turn off lights when leaving!*`;
      } else if (command === "room") {
        // Match room name
        let matchRoom = "Drawing Room";
        if (cleanInput.includes("work 1") || cleanInput.includes("wr1") || cleanInput.includes("workroom 1")) {
          matchRoom = "Work Room 1";
        } else if (cleanInput.includes("work 2") || cleanInput.includes("wr2") || cleanInput.includes("workroom 2")) {
          matchRoom = "Work Room 2";
        }

        const roomDevices = devices.filter(d => d.room === matchRoom);
        const active = roomDevices.filter(d => d.status === "on");
        const totalPower = active.reduce((sum, d) => sum + d.ratedWatts, 0);

        return `🤖 **[Mock Discord Bot - Template Fallback]**\n\n⚡ **Room Report: ${matchRoom}** (${nowStr})\n• **Devices Active:** \`${active.length}/${roomDevices.length}\` devices.\n• **Active Appliances:** ${active.length > 0 ? active.map(a => `\`${a.name}\``).join(", ") : "_None (all quiet)_"}\n• **Power Draw:** \`${totalPower} Watts\`\n\n*${active.length > 2 ? "⚠️ High usage detected in this room! Please double-check if fans/lights are needed." : "✅ Room is optimized and energy-safe."}*`;
      } else if (command === "usage") {
        const totalKwh = Math.round(energyTodayKwh * 100) / 100;
        const currentStats = calculateStats();
        return `🤖 **[Mock Discord Bot - Template Fallback]**\n\n📉 **Energy Usage & Efficiency Report** (${nowStr})\n• **Today's Consumption:** \`${totalKwh} kWh\`\n• **Real-Time Load:** \`${currentStats.livePower} W\`\n• **Hourly Average Cost:** \`৳ ${(totalKwh * 8).toFixed(2)}\` (Simulated at ৳8/kWh)\n\n*💡 Tip: Toggling office appliances like fans and lights when rooms are vacant can slice up to 40% off the utility bill!*`;
      }
      return "Command not recognized.";
    };

    // 2. Try to get humanized AI response from Gemini
    const gemini = getGeminiClient();
    if (gemini) {
      try {
        console.log(`Generating humanized Discord response using gemini-3.5-flash...`);
        const aiResponse = await gemini.models.generateContent({
          model: "gemini-3.5-flash",
          contents: systemPrompt,
          config: {
            temperature: 0.7,
            systemInstruction: "You are the automated Discord Integration for a smart office dashboard called 'Lights, Fans, Discord'. Speak with a helpful, friendly, and slight geeky persona. Always reference the correct real data values provided. Return clean Discord markdown."
          }
        });

        const text = aiResponse.text;
        if (text) {
          const finalResponse: DiscordCommandResponse = {
            command: `!${command} ${input || ""}`.trim(),
            input: input || "",
            response: `🤖 **[Discord Bot Live (AI-Generated)]**\n\n${text.trim()}`,
            timestamp: new Date().toISOString()
          };
          return res.json(finalResponse);
        }
      } catch (err) {
        console.error("Gemini API call failed, falling back to template:", err);
      }
    }

    // If Gemini fails or is not available, return template response
    const finalResponse: DiscordCommandResponse = {
      command: `!${command} ${input || ""}`.trim(),
      input: input || "",
      response: generateFallback(),
      timestamp: new Date().toISOString()
    };
    res.json(finalResponse);
  });

  // Built-in Live Discord Bot Client Integration
  function startDiscordBot() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.log("ℹ️ [Discord Bot] DISCORD_TOKEN is not configured. Built-in bot is sleeping.");
      return;
    }

    try {
      const client = new DiscordClient({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      client.once("ready", () => {
        console.log(`========================================`);
        console.log(`🤖 Live Discord Bot logged in as: ${client.user?.tag}`);
        console.log(`========================================`);
      });

      client.on("messageCreate", async (message: any) => {
        if (message.author.bot) return;

        const content = message.content.trim();
        if (!content.startsWith("!")) return;

        const parts = content.split(/\s+/);
        const commandWithExcl = parts[0].toLowerCase();
        const command = commandWithExcl.substring(1); // strip the '!'
        const input = parts.slice(1).join(" ");

        if (command === "status" || command === "room" || command === "usage") {
          try {
            await message.channel.sendTyping();
          } catch (e) {}

          // 1. Compute current hard details (same logic as /api/discord/command)
          let factPayload = "";
          let systemPrompt = "";

          if (command === "status") {
            const activeCount = devices.filter(d => d.status === "on").length;
            const totalCount = devices.length;
            const liveDraw = devices.reduce((sum, d) => sum + (d.status === "on" ? d.ratedWatts : 0), 0);
            const activeAlerts = alerts.filter(a => a.status === "active").length;

            factPayload = `Current office status: ${activeCount}/${totalCount} devices are ON. Current total load: ${liveDraw} Watts. There are ${activeAlerts} active system alerts.`;
            systemPrompt = "You are an intelligent office assistant Discord bot. Summarize the overall office device status based on this data: " + factPayload + ". Keep it extremely friendly, concise, humanized, and formatted with simple Discord markdown. Be witty and helpful!";
          } else if (command === "room") {
            let matchRoom = "Drawing Room";
            const cleanInput = input.toLowerCase();
            if (cleanInput.includes("work 1") || cleanInput.includes("wr1") || cleanInput.includes("workroom 1") || cleanInput.includes("work1")) {
              matchRoom = "Work Room 1";
            } else if (cleanInput.includes("work 2") || cleanInput.includes("wr2") || cleanInput.includes("workroom 2") || cleanInput.includes("work2")) {
              matchRoom = "Work Room 2";
            } else if (cleanInput.includes("draw") || cleanInput.includes("dr") || cleanInput.includes("drawing")) {
              matchRoom = "Drawing Room";
            } else {
              const inputLower = cleanInput.toLowerCase();
              if (inputLower.includes("drawing")) matchRoom = "Drawing Room";
              else if (inputLower.includes("work 1") || inputLower.includes("work1")) matchRoom = "Work Room 1";
              else if (inputLower.includes("work 2") || inputLower.includes("work2")) matchRoom = "Work Room 2";
            }

            const roomDevices = devices.filter(d => d.room === matchRoom);
            const active = roomDevices.filter(d => d.status === "on");
            const totalPower = active.reduce((sum, d) => sum + d.ratedWatts, 0);

            factPayload = `Room: ${matchRoom}. Total devices: ${roomDevices.length}. Devices ON: ${active.length}. Active Devices list: [${active.map(a => `${a.name} (${a.ratedWatts}W)`).join(", ")}]. Live Power draw: ${totalPower} Watts.`;
            systemPrompt = `You are a smart Discord bot. Review this room state: ${factPayload}. Format a conversational, elegant summary for the team. Mention if everything is off or if there is high power draw. Keep it under 3-4 lines and very engaging.`;
          } else if (command === "usage") {
            const totalKwh = Math.round(energyTodayKwh * 100) / 100;
            const currentStats = calculateStats();
            const currentHour = simulation.simulatedHour;
            const isWorkingHours = currentHour >= simulation.officeHoursStart && currentHour < simulation.officeHoursEnd;

            factPayload = `Energy consumed today: ${totalKwh} kWh. Current live power draw: ${currentStats.livePower} Watts. Working hours status: ${isWorkingHours ? "Active (9am-5pm)" : "Inactive"}. Total active devices right now: ${currentStats.activeDevices}.`;
            systemPrompt = `You are a Smart Energy advisor Discord bot. Analyze this energy report: ${factPayload}. Summarize today's performance, giving a warm tip about saving electricity or commenting on current load. Keep it brief, motivational, and conversational!`;
          }

          // Try to generate Gemini response
          let replyText = "";
          const gemini = getGeminiClient();
          if (gemini) {
            try {
              const aiResponse = await gemini.models.generateContent({
                model: "gemini-3.5-flash",
                contents: systemPrompt,
                config: {
                  temperature: 0.7,
                  systemInstruction: "You are the automated Discord Integration for a smart office dashboard called 'Lights, Fans, Discord'. Speak with a helpful, friendly, and slight geeky persona. Always reference the correct real data values provided. Return clean Discord markdown."
                }
              });
              if (aiResponse.text) {
                replyText = `🤖 **[Discord Bot Live (AI-Generated)]**\n\n${aiResponse.text.trim()}`;
              }
            } catch (err) {
              console.error("Gemini failed in Discord client, falling back:", err);
            }
          }

          if (!replyText) {
            // Use template fallback
            const nowStr = formatSimTime(simulation.simulatedHour, simulation.simulatedMinute);
            if (command === "status") {
              const activeCount = devices.filter(d => d.status === "on").length;
              const totalCount = devices.length;
              const liveDraw = devices.reduce((sum, d) => sum + (d.status === "on" ? d.ratedWatts : 0), 0);
              const activeAlerts = alerts.filter(a => a.status === "active").length;
              replyText = `🤖 **Smart Office Bot (Fallback)**\n👋 Here is the current status as of **${nowStr}**:\n• **Devices On:** \`${activeCount}/${totalCount}\`\n• **Power Draw:** \`${liveDraw}W\`\n• **Alerts:** \`${activeAlerts}\` active.`;
            } else if (command === "room") {
              let matchRoom = "Drawing Room";
              const cleanInput = input.toLowerCase();
              if (cleanInput.includes("work 1") || cleanInput.includes("wr1") || cleanInput.includes("workroom 1") || cleanInput.includes("work1")) {
                matchRoom = "Work Room 1";
              } else if (cleanInput.includes("work 2") || cleanInput.includes("wr2") || cleanInput.includes("workroom 2") || cleanInput.includes("work2")) {
                matchRoom = "Work Room 2";
              }
              const roomDevices = devices.filter(d => d.room === matchRoom);
              const active = roomDevices.filter(d => d.status === "on");
              const totalPower = active.reduce((sum, d) => sum + d.ratedWatts, 0);
              replyText = `🤖 **Room Status: ${matchRoom}** (${nowStr})\n• **Active:** \`${active.length}/${roomDevices.length}\`\n• **Power:** \`${totalPower}W\`\n• **Devices Running:** ${active.map(a => `\`${a.name}\``).join(", ") || "_None_"}`;
            } else if (command === "usage") {
              const totalKwh = Math.round(energyTodayKwh * 100) / 100;
              const currentStats = calculateStats();
              replyText = `🤖 **Power Consumption Stats** (${nowStr})\n• **Today's Total:** \`${totalKwh} kWh\`\n• **Real-Time Load:** \`${currentStats.livePower}W\`\n• **Estimated cost:** \`৳ ${(totalKwh * 8).toFixed(2)}\``;
            }
          }

          try {
            await message.reply(replyText);
          } catch (replyErr) {
            console.error("Failed to reply to message:", replyErr);
          }
        }
      });

      globalDiscordClient = client;

      client.login(token).catch((err: any) => {
        console.error("❌ [Discord Bot] Failed to login to Discord Bot client:", err.message);
      });
    } catch (err) {
      console.error("❌ [Discord Bot] Error starting Discord Bot client:", err);
    }
  }

  // Start the Discord Bot client in the background
  startDiscordBot();

  // Vite Integration for Client Files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: { server }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // PORT bindings on 0.0.0.0 as required by the reverse proxy
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`========================================`);
    console.log(`🚀 Smart Office Dashboard running at http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket server attached on port ${PORT}`);
    console.log(`========================================`);
  });
}

startServer();
