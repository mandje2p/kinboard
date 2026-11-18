"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Home, Lightbulb, Minus, Plug, Plus, Power, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WidgetCard } from "@/components/widget-card";
import { Button } from "@/components/ui/button";
import { useWidgetSize } from "@/components/widget-size-context";
import { useHomeDevices } from "@/hooks/use-home-devices";
import { clampTemp, type HomeDevice } from "@/lib/native-home";

const STEP = 0.5;
const ROOM_KEY = "kinboard.home-room";
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const MODES = [
  { value: 0, key: "modeOff" },
  { value: 1, key: "modeHeat" },
  { value: 3, key: "modeAuto" },
] as const;

type Act = ReturnType<typeof useHomeDevices>["act"];

/**
 * Apple Home on the wall, in the iOS glass style: room pills, then large
 * frosted tiles with a round power button. Works through the Kinboard iPad
 * app, which talks to HomeKit; in a plain browser it only explains that.
 */
export function HomeKitWidget({ className = "" }: { className?: string }) {
  const t = useTranslations("homekitWidget");
  const size = useWidgetSize();
  const tier = size?.tier ?? "medium";
  const { state, devices, demo, error, act, lightsOff } = useHomeDevices();
  const [room, setRoom] = useState<string>("");

  useEffect(() => {
    try {
      setRoom(window.localStorage.getItem(ROOM_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);
  const chooseRoom = (next: string) => {
    setRoom(next);
    try {
      window.localStorage.setItem(ROOM_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (error) toast.error(t("commandFailed"));
  }, [error, t]);

  const roomNames = useMemo(
    () => [...new Set(devices.map((d) => d.room))].sort((a, b) => a.localeCompare(b)),
    [devices],
  );
  // A room that no longer exists falls back to "all".
  const activeRoom = roomNames.includes(room) ? room : "";

  const groups = useMemo(() => {
    const kindOrder = { thermostat: 0, light: 1, outlet: 2, switch: 3 } as const;
    const shown = activeRoom ? devices.filter((d) => d.room === activeRoom) : devices;
    const byRoom = new Map<string, HomeDevice[]>();
    for (const d of shown) byRoom.set(d.room, [...(byRoom.get(d.room) ?? []), d]);
    return [...byRoom.entries()]
      .map(([name, list]) => ({
        name,
        list: [...list].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [devices, activeRoom]);

  if (state !== "ready") {
    const message =
      state === "unavailable" ? t("unavailable")
      : state === "denied" ? t("denied")
      : state === "empty" ? t("empty")
      : state === "error" ? t("error")
      : t("loading");
    return (
      <WidgetCard icon={Home} title={t("title")} className={className}>
        <p className="py-4 text-center text-sm text-muted-foreground" role="status">{message}</p>
      </WidgetCard>
    );
  }

  const lightsOn = devices.filter((d) => d.kind === "light" && d.on).length;
  const switchesOn = devices.filter((d) => d.kind !== "thermostat" && d.on).length;
  const badge = demo ? (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t("demo")}</span>
  ) : undefined;

  if (tier === "compact") {
    return (
      <WidgetCard icon={Home} title={t("title")} headerRight={badge} className={className}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("summary", { count: switchesOn })}</p>
          {lightsOn > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={lightsOff}>
              <Power className="size-4" aria-hidden="true" />
              {t("lightsOff")}
            </Button>
          )}
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={Home} title={t("title")} headerRight={badge} className={className}>
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        {roomNames.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("rooms")}>
            <Chip active={activeRoom === ""} onClick={() => chooseRoom("")}>{t("allRooms")}</Chip>
            {roomNames.map((name) => (
              <Chip key={name} active={activeRoom === name} onClick={() => chooseRoom(name)}>
                {name || t("noRoom")}
              </Chip>
            ))}
          </div>
        )}
        {groups.map(({ name, list }) => (
          <section key={name} aria-label={name || t("noRoom")}>
            {!activeRoom && (
              <h4 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {name || t("noRoom")}
              </h4>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {list.map((d) =>
                d.kind === "thermostat" ? (
                  <ThermostatTile key={d.id} device={d} showModes={tier === "large"} onChange={act} />
                ) : (
                  <SwitchTile key={d.id} device={d} onChange={act} />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </WidgetCard>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className="glass-chip" data-active={active}>
      {children}
    </button>
  );
}

function PowerButton({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="glass-power"
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Power className="size-[1.15rem]" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

function BrightnessSlider({ device, onChange, label }: { device: HomeDevice; onChange: Act; label: string }) {
  // A light that is off shows an empty bar; touching it switches the light on.
  const value = device.on ? device.brightness ?? 100 : 1;
  return (
    <div className="glass-range-wrap" onClick={(e) => e.stopPropagation()}>
      <Sun className="glass-range-icon size-4" aria-hidden="true" />
      <input
        type="range"
        min={1}
        max={100}
        value={value}
        style={{ ["--fill" as string]: `${value}%` }}
        onChange={(e) => onChange(device.id, "brightness", Number(e.target.value))}
        aria-label={label}
        className="glass-range"
      />
    </div>
  );
}

function SwitchTile({ device, onChange }: { device: HomeDevice; onChange: Act }) {
  const t = useTranslations("homekitWidget");
  const Icon = device.kind === "outlet" ? Plug : Lightbulb;
  const on = !!device.on;
  const dimmable = device.kind === "light" && device.brightness !== undefined && device.reachable;
  const toggle = () => device.reachable && onChange(device.id, "on", !on);
  const status = !device.reachable
    ? t("unreachable")
    : on
      ? dimmable ? `${device.brightness}%` : t("on")
      : t("off");
  return (
    <div className="glass-tile" data-on={on} data-reachable={device.reachable} onClick={toggle}>
      {dimmable ? (
        <BrightnessSlider device={device} onChange={onChange} label={`${device.name}: ${t("brightness")}`} />
      ) : (
        <span className="glass-tile-icon" aria-hidden="true">
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
      )}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-[0.95rem] font-semibold leading-tight">{device.name}</p>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
        <PowerButton on={on} disabled={!device.reachable} label={`${device.name}: ${on ? t("on") : t("off")}`} onClick={toggle} />
      </div>
    </div>
  );
}

function ThermostatTile({ device, showModes, onChange }: { device: HomeDevice; showModes: boolean; onChange: Act }) {
  const t = useTranslations("homekitWidget");
  const target = device.targetTemp;
  const off = device.mode === 0;
  const nudge = (delta: number) => {
    if (target === undefined) return;
    onChange(device.id, "targetTemp", clampTemp(device, Math.round((target + delta) / STEP) * STEP));
  };
  const status = !device.reachable
    ? t("unreachable")
    : off
      ? t("modeOff")
      : device.currentTemp !== undefined
        ? t("heatingStatus", { temp: fmt(device.currentTemp) })
        : t("modeHeat");
  return (
    <div className="glass-tile col-span-2" data-on={!off} data-reachable={device.reachable}>
      <div className="flex items-center justify-between gap-3">
        <div className="glass-stepper" role="group" aria-label={t("target")}>
          <button type="button" onClick={() => nudge(-STEP)} disabled={!device.reachable || off || target === undefined} aria-label={t("decrease")}>
            <Minus className="size-4" strokeWidth={2.25} />
          </button>
          <span className="min-w-[3.5rem] text-center text-lg font-semibold tabular-nums" aria-live="polite">
            {off || target === undefined ? "—" : `${fmt(target)}°`}
          </span>
          <button type="button" onClick={() => nudge(STEP)} disabled={!device.reachable || off || target === undefined} aria-label={t("increase")}>
            <Plus className="size-4" strokeWidth={2.25} />
          </button>
        </div>
        {device.currentTemp !== undefined && (
          <span className="font-display text-3xl font-light tabular-nums">{fmt(device.currentTemp)}°</span>
        )}
      </div>
      {showModes && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("mode")}>
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="glass-chip"
              data-active={device.mode === m.value}
              aria-pressed={device.mode === m.value}
              disabled={!device.reachable}
              onClick={() => onChange(device.id, "mode", m.value)}
            >
              {t(m.key)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[0.95rem] font-semibold leading-tight">
            <Flame className={`size-4 ${off ? "text-muted-foreground" : "text-state-alert"}`} aria-hidden="true" />
            {device.name}
          </p>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
        <PowerButton
          on={!off}
          disabled={!device.reachable}
          label={`${device.name}: ${off ? t("off") : t("on")}`}
          onClick={() => onChange(device.id, "mode", off ? 1 : 0)}
        />
      </div>
    </div>
  );
}
