import { create } from "zustand";

export type PrinterConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type PrintState = "idle" | "printing" | "paused" | "finished" | "error";

export interface PrinterInfo {
  id: string;
  name: string;
  model: string;
  ip: string;
  serial: string;
}

export interface PrinterStatus {
  state: PrintState;
  progressPercent: number;
  layerCurrent: number;
  layerTotal: number;
  timeRemainingMin: number;
  timeElapsedMin: number;
  nozzleTemp: number;
  nozzleTarget: number;
  bedTemp: number;
  bedTarget: number;
  filename: string | null;
}

export interface PrinterProfile {
  id: string;
  name: string;
  bedX: number;
  bedY: number;
  bedZ: number;
  nozzleDiameter: number;
}

interface PrinterStore {
  // Discovery
  isDiscovering: boolean;
  discoveredPrinters: PrinterInfo[];
  setDiscovering: (discovering: boolean) => void;
  setDiscoveredPrinters: (printers: PrinterInfo[]) => void;

  // Connection
  selectedPrinter: PrinterInfo | null;
  connectionState: PrinterConnectionState;
  connectionError: string | null;
  selectPrinter: (printer: PrinterInfo | null) => void;
  setConnectionState: (state: PrinterConnectionState) => void;
  setConnectionError: (error: string | null) => void;

  // Status
  status: PrinterStatus | null;
  setStatus: (status: PrinterStatus | null) => void;

  // Print settings
  printTemp: number;
  bedTemp: number;
  selectedProfile: string;
  setPrintTemp: (temp: number) => void;
  setBedTemp: (temp: number) => void;
  setSelectedProfile: (profileId: string) => void;

  // Profiles
  profiles: PrinterProfile[];
  setProfiles: (profiles: PrinterProfile[]) => void;
}

export const usePrinterStore = create<PrinterStore>((set) => ({
  // Discovery
  isDiscovering: false,
  discoveredPrinters: [],
  setDiscovering: (discovering) => set({ isDiscovering: discovering }),
  setDiscoveredPrinters: (printers) => set({ discoveredPrinters: printers }),

  // Connection
  selectedPrinter: null,
  connectionState: "disconnected",
  connectionError: null,
  selectPrinter: (printer) => set({ selectedPrinter: printer }),
  setConnectionState: (state) => set({ connectionState: state }),
  setConnectionError: (error) => set({ connectionError: error }),

  // Status
  status: null,
  setStatus: (status) => set({ status }),

  // Print settings
  printTemp: 220,
  bedTemp: 55,
  selectedProfile: "generic",
  setPrintTemp: (temp) => set({ printTemp: temp }),
  setBedTemp: (temp) => set({ bedTemp: temp }),
  setSelectedProfile: (profileId) => set({ selectedProfile: profileId }),

  // Profiles
  profiles: [
    { id: "generic", name: "Generic", bedX: 220, bedY: 220, bedZ: 250, nozzleDiameter: 0.4 },
    { id: "bambu_x1c", name: "Bambu Lab X1 Carbon", bedX: 256, bedY: 256, bedZ: 256, nozzleDiameter: 0.4 },
    { id: "bambu_p1s", name: "Bambu Lab P1S", bedX: 256, bedY: 256, bedZ: 256, nozzleDiameter: 0.4 },
    { id: "bambu_a1", name: "Bambu Lab A1", bedX: 256, bedY: 256, bedZ: 256, nozzleDiameter: 0.4 },
    { id: "ender3", name: "Creality Ender 3", bedX: 220, bedY: 220, bedZ: 250, nozzleDiameter: 0.4 },
    { id: "prusa_mk4", name: "Prusa MK4", bedX: 250, bedY: 210, bedZ: 220, nozzleDiameter: 0.4 },
  ],
  setProfiles: (profiles) => set({ profiles }),
}));

/**
 * Format minutes as human-readable duration
 */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
