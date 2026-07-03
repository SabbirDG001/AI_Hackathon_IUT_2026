export type DeviceType = 'fan' | 'light';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  room: string;
  status: 'on' | 'off';
  ratedWatts: number;
  lastChanged: string; // ISO timestamp
  onSince: string | null; // ISO timestamp when last turned 'on' (or null if 'off')
  lastOff?: string | null; // ISO timestamp when last turned 'off'
  totalUsageWh?: number; // accumulated Watt-hours
}

export type AlertType = 'after-hours' | 'continuous-on' | 'forced';

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  room: string | null;
  deviceId: string | null;
  deviceName: string | null;
  triggeredAt: string; // ISO timestamp
  status: 'active' | 'resolved';
  resolvedAt: string | null; // ISO timestamp or null
}

export interface PowerStats {
  livePower: number; // Current live draw in Watts
  energyUsageToday: number; // Total accumulated energy in kWh
  totalDevices: number;
  activeDevices: number;
}

export interface UsageHistoryPoint {
  hour: string; // e.g. "00:00" to "23:00"
  energy: number; // kWh consumed in that hour
  cost: number; // Simulated monetary cost
}

export interface RoomStats {
  name: string;
  activeDevices: number;
  totalDevices: number;
  livePower: number; // Watts
  isOfficeHoursActive: boolean;
}

export interface DiscordCommandResponse {
  command: string;
  input: string;
  response: string;
  timestamp: string;
}

export interface SimulationState {
  simulatedHour: number; // 0 to 23
  simulatedMinute: number; // 0 to 59
  speedFactor: number; // how fast time progresses (minutes per tick)
  isSimulating: boolean;
  officeHoursStart: number; // Hour (e.g. 9)
  officeHoursEnd: number; // Hour (e.g. 17)
}

export interface DeviceToggleEvent {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  room: string;
  action: 'on' | 'off';
  timestamp: string; // ISO timestamp
}

