"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampTemp,
  getNativeHome,
  type HomeDevice,
  type HomeSetKey,
  type NativeHomeBridge,
} from "@/lib/native-home";

export type HomeState = "unavailable" | "loading" | "denied" | "empty" | "ready" | "error";

// HomeKit takes a moment to load after launch; wait for it instead of failing.
const READY_RETRIES = 20;
const READY_DELAY_MS = 1000;
// Accessories report their changes by themselves; this is only a safety net.
const REFRESH_MS = 60_000;
// A burst of slider/stepper changes becomes one write.
const DEBOUNCE_MS = 350;

/**
 * Apple Home devices through the iPad app's bridge. `state` is "unavailable"
 * in a plain browser. Writes are applied on screen at once and corrected by
 * what the accessory reports back.
 */
export function useHomeDevices() {
  const [state, setState] = useState<HomeState>("loading");
  const [devices, setDevices] = useState<HomeDevice[]>([]);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridgeRef = useRef<NativeHomeBridge | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const devicesRef = useRef<HomeDevice[]>([]);
  devicesRef.current = devices;

  const refresh = useCallback(async (bridge: NativeHomeBridge): Promise<boolean> => {
    const status = await bridge.request("status");
    if (!status.ready) return false;
    if (!status.authorized) {
      setState("denied");
      return true;
    }
    if (status.homes === 0) {
      setDevices([]);
      setState("empty");
      return true;
    }
    const { devices: next } = await bridge.request("snapshot");
    setDevices(next);
    setState(next.length === 0 ? "empty" : "ready");
    return true;
  }, []);

  useEffect(() => {
    const found = getNativeHome();
    if (!found) {
      setState("unavailable");
      return;
    }
    const { bridge, demo: isDemo } = found;
    bridgeRef.current = bridge;
    setDemo(isDemo);
    let cancelled = false;
    const pendingTimers = timers.current;

    const start = async () => {
      try {
        for (let attempt = 0; attempt < READY_RETRIES && !cancelled; attempt++) {
          if (await refresh(bridge)) return;
          await new Promise((r) => setTimeout(r, READY_DELAY_MS));
        }
        if (!cancelled) setState("error");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setState("error");
        }
      }
    };
    void start();

    const unsubscribe = bridge.subscribe((event) => {
      if (event.event === "device") {
        setDevices((prev) => prev.map((d) => (d.id === event.device.id ? event.device : d)));
      } else {
        void refresh(bridge).catch(() => undefined);
      }
    });
    const interval = setInterval(() => void refresh(bridge).catch(() => undefined), REFRESH_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
      pendingTimers.forEach((t) => clearTimeout(t));
      pendingTimers.clear();
    };
  }, [refresh]);

  const write = useCallback(async (id: string, key: HomeSetKey, value: number | boolean) => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    try {
      await bridge.request("set", { id, key, value });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Put back what the accessory really says.
      void refresh(bridge).catch(() => undefined);
    }
  }, [refresh]);

  /** Change one value: shown immediately, written now (switches) or after a pause (sliders). */
  const act = useCallback(
    (id: string, key: HomeSetKey, value: number | boolean) => {
      // Dimming a light that is off means "switch it on": not every accessory
      // does that by itself when it receives a brightness, so say it.
      const current = devicesRef.current.find((d) => d.id === id);
      if (key === "brightness" && Number(value) > 0 && current?.on === false) {
        void write(id, "on", true);
      }
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          const next: HomeDevice = { ...d };
          if (key === "on") next.on = Boolean(value);
          if (key === "brightness") {
            next.brightness = Number(value);
            // Dimming a light that is off is an intention to switch it on.
            if (Number(value) > 0) next.on = true;
          }
          if (key === "targetTemp") next.targetTemp = clampTemp(d, Number(value));
          if (key === "mode") next.mode = Number(value);
          return next;
        }),
      );
      const sendValue = key === "targetTemp" ? Number(value) : value;
      if (key === "on" || key === "mode") {
        void write(id, key, sendValue);
        return;
      }
      const timerKey = `${id}:${key}`;
      const existing = timers.current.get(timerKey);
      if (existing) clearTimeout(existing);
      timers.current.set(
        timerKey,
        setTimeout(() => {
          timers.current.delete(timerKey);
          void write(id, key, sendValue);
        }, DEBOUNCE_MS),
      );
    },
    [write],
  );

  const lightsOff = useCallback(() => {
    devices.filter((d) => d.kind === "light" && d.on).forEach((d) => act(d.id, "on", false));
  }, [devices, act]);

  return { state, devices, demo, error, act, lightsOff };
}
