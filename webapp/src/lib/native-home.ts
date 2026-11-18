/**
 * Bridge to Apple Home (HomeKit), available only inside the Kinboard iPad app.
 *
 * A web page cannot talk to HomeKit. The iPad app (ios/) loads this site in a
 * WKWebView and injects `window.kinboardNative`; it owns the HomeKit calls and
 * this file is the web side of that contract. In a plain browser there is no
 * bridge, and the widget says so. `?homedemo=1` swaps in a built-in demo home
 * so the interface can be tried (and tested) without an iPad.
 */

export type HomeDeviceKind = "light" | "outlet" | "switch" | "thermostat";

export interface HomeDevice {
  id: string;
  name: string;
  room: string;
  home: string;
  kind: HomeDeviceKind;
  reachable: boolean;
  /** Lights, outlets, switches. */
  on?: boolean;
  /** 0-100, dimmable lights only. */
  brightness?: number;
  /** Thermostats, in °C. */
  currentTemp?: number;
  targetTemp?: number;
  minTemp?: number;
  maxTemp?: number;
  /** HomeKit target heating/cooling state: 0 off, 1 heat, 2 cool, 3 auto. */
  mode?: number;
}

export type HomeSetKey = "on" | "brightness" | "targetTemp" | "mode";

export interface NativeHomeStatus {
  /** HomeKit finished loading the homes. */
  ready: boolean;
  /** The person allowed Kinboard to use Home. */
  authorized: boolean;
  homes: number;
}

export type NativeHomeEvent =
  | { event: "device"; device: HomeDevice }
  | { event: "changed" };

export interface NativeHomeBridge {
  request(action: "status"): Promise<NativeHomeStatus>;
  request(action: "snapshot"): Promise<{ devices: HomeDevice[] }>;
  request(action: "set", params: { id: string; key: HomeSetKey; value: number | boolean }): Promise<unknown>;
  subscribe(listener: (event: NativeHomeEvent) => void): () => void;
}

declare global {
  interface Window {
    kinboardNative?: { platform: string; version: number; home: NativeHomeBridge };
  }
}

const DEMO_KEY = "kinboard.home-demo";

function demoRequested(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("homedemo") === "1") window.localStorage.setItem(DEMO_KEY, "1");
    if (params.get("homedemo") === "0") window.localStorage.removeItem(DEMO_KEY);
    return window.localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

/** The iPad app's bridge, a demo home when asked for, otherwise null (plain browser). */
export function getNativeHome(): { bridge: NativeHomeBridge; demo: boolean } | null {
  if (typeof window === "undefined") return null;
  const native = window.kinboardNative?.home;
  if (native) return { bridge: native, demo: false };
  if (demoRequested()) return { bridge: createDemoHome(), demo: true };
  return null;
}

export function clampTemp(device: HomeDevice, value: number): number {
  const min = device.minTemp ?? 7;
  const max = device.maxTemp ?? 30;
  return Math.min(max, Math.max(min, value));
}

/** An in-memory home, for trying the widget in a browser and for tests. */
export function createDemoHome(): NativeHomeBridge {
  const devices: HomeDevice[] = [
    { id: "d1", name: "Lampe", room: "Salon", home: "Maison", kind: "light", reachable: true, on: true, brightness: 70 },
    { id: "d2", name: "Plafonnier", room: "Cuisine", home: "Maison", kind: "light", reachable: true, on: false, brightness: 100 },
    { id: "d3", name: "Cafetière", room: "Cuisine", home: "Maison", kind: "outlet", reachable: true, on: true },
    { id: "d4", name: "TV", room: "Salon", home: "Maison", kind: "outlet", reachable: true, on: false },
    { id: "d5", name: "Lampe de chevet", room: "Chambre", home: "Maison", kind: "light", reachable: true, on: true, brightness: 40 },
    { id: "d6", name: "Prise garage", room: "Garage", home: "Maison", kind: "outlet", reachable: false, on: false },
    { id: "d7", name: "Thermostat", room: "Salon", home: "Maison", kind: "thermostat", reachable: true, currentTemp: 20.5, targetTemp: 21, minTemp: 10, maxTemp: 30, mode: 1 },
  ];
  const listeners = new Set<(event: NativeHomeEvent) => void>();
  const emit = (event: NativeHomeEvent) => listeners.forEach((l) => l(event));

  return {
    request: (async (action: string, params?: { id: string; key: HomeSetKey; value: number | boolean }) => {
      if (action === "status") return { ready: true, authorized: true, homes: 1 };
      if (action === "snapshot") return { devices: devices.map((d) => ({ ...d })) };
      if (action === "set" && params) {
        const device = devices.find((d) => d.id === params.id);
        if (!device) throw new Error("unknown device");
        (device as unknown as Record<string, unknown>)[params.key] = params.value;
        // A real accessory confirms a moment later; so does the demo.
        setTimeout(() => emit({ event: "device", device: { ...device } }), 150);
        return {};
      }
      throw new Error("unknown action");
    }) as NativeHomeBridge["request"],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
