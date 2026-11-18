"use client";

import { useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, Flame, Home, Lightbulb, Plug, Power } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WidgetCard } from "@/components/widget-card";
import { Button } from "@/components/ui/button";
import { useWidgetSize } from "@/components/widget-size-context";
import { useHomeDevices } from "@/hooks/use-home-devices";
import { clampTemp, type HomeDevice } from "@/lib/native-home";

const STEP = 0.5;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const MODES = [
  { value: 0, key: "modeOff" },
  { value: 1, key: "modeHeat" },
  { value: 3, key: "modeAuto" },
] as const;

/**
 * Apple Home on the wall: lights, plugs and thermostats as large glass tiles,
 * grouped by room. Works through the Kinboard iPad app, which talks to
 * HomeKit; in a plain browser it only explains that.
 */
export function HomeKitWidget({ className = "" }: { className?: string }) {
  const t = useTranslations("homekitWidget");
  const size = useWidgetSize();
  const tier = size?.tier ?? "medium";
  const { state, devices, demo, error, act, lightsOff } = useHomeDevices();

  useEffect(() => {
    if (error) toast.error(t("commandFailed"));
  }, [error, t]);

  const rooms = useMemo(() => {
    const byRoom = new Map<string, HomeDevice[]>();
    for (const d of devices) {
      const list = byRoom.get(d.room) ?? [];
      list.push(d);
      byRoom.set(d.room, list);
    }
    const kindOrder = { thermostat: 0, light: 1, outlet: 2, switch: 3 } as const;
    return [...byRoom.entries()]
      .map(([room, list]) => ({
        room,
        list: [...list].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.room.localeCompare(b.room));
  }, [devices]);

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

  const header = demo ? (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t("demo")}</span>
  ) : undefined;

  if (tier === "compact") {
    return (
      <WidgetCard icon={Home} title={t("title")} headerRight={header} className={className}>
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
    <WidgetCard icon={Home} title={t("title")} headerRight={header} className={className}>
      <div className="flex min-h-0 flex-col gap-4 overflow-auto">
        {rooms.map(({ room, list }) => (
          <section key={room} aria-label={room}>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {room || t("noRoom")}
            </h4>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {list.map((d) =>
                d.kind === "thermostat" ? (
                  <ThermostatTile key={d.id} device={d} onChange={act} />
                ) : (
                  <SwitchTile key={d.id} device={d} showSlider={tier === "large"} onChange={act} />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </WidgetCard>
  );
}

function SwitchTile({
  device,
  showSlider,
  onChange,
}: {
  device: HomeDevice;
  showSlider: boolean;
  onChange: ReturnType<typeof useHomeDevices>["act"];
}) {
  const t = useTranslations("homekitWidget");
  const Icon = device.kind === "light" ? Lightbulb : device.kind === "outlet" ? Plug : Power;
  const on = !!device.on;
  const dimmable = device.kind === "light" && device.brightness !== undefined;
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors ${
        on ? "border-primary/40 bg-primary/15" : "border-border/40 bg-muted/30"
      } ${device.reachable ? "" : "opacity-50"}`}
    >
      <button
        type="button"
        disabled={!device.reachable}
        onClick={() => onChange(device.id, "on", !on)}
        aria-pressed={on}
        aria-label={`${device.name}: ${on ? t("on") : t("off")}`}
        className="flex min-h-[4.25rem] flex-col items-start justify-between gap-2 text-left"
      >
        <Icon className={`size-7 ${on ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 max-w-full">
          <span className="block truncate text-sm font-medium">{device.name}</span>
          <span className="block text-xs text-muted-foreground">
            {!device.reachable ? t("unreachable") : on ? (dimmable ? `${device.brightness}%` : t("on")) : t("off")}
          </span>
        </span>
      </button>
      {showSlider && dimmable && device.reachable && (
        <input
          type="range"
          min={1}
          max={100}
          value={device.brightness ?? 100}
          onChange={(e) => onChange(device.id, "brightness", Number(e.target.value))}
          aria-label={`${device.name}: ${t("brightness")}`}
          className="h-8 w-full accent-[hsl(var(--primary))]"
        />
      )}
    </div>
  );
}

function ThermostatTile({
  device,
  onChange,
}: {
  device: HomeDevice;
  onChange: ReturnType<typeof useHomeDevices>["act"];
}) {
  const t = useTranslations("homekitWidget");
  const target = device.targetTemp;
  const off = device.mode === 0;
  const nudge = (delta: number) => {
    if (target === undefined) return;
    onChange(device.id, "targetTemp", clampTemp(device, Math.round((target + delta) / STEP) * STEP));
  };
  return (
    <div
      className={`col-span-2 flex flex-col gap-3 rounded-2xl border p-3 ${
        off ? "border-border/40 bg-muted/30" : "border-state-alert/30 bg-state-alert/10"
      } ${device.reachable ? "" : "opacity-50"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <Flame className={`size-4 ${off ? "text-muted-foreground" : "text-state-alert"}`} aria-hidden="true" />
            {device.name}
          </p>
          <p className="text-xs text-muted-foreground">{t("target")}</p>
        </div>
        {device.currentTemp !== undefined && (
          <span className="font-display text-3xl font-light tabular-nums">{fmt(device.currentTemp)}°</span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-11" onClick={() => nudge(-STEP)}
            disabled={!device.reachable || off || target === undefined} aria-label={t("decrease")}>
            <ChevronDown className="size-5" />
          </Button>
          <span className="min-w-[3.75rem] text-center text-xl font-semibold tabular-nums" aria-live="polite">
            {off || target === undefined ? "—" : `${fmt(target)}°`}
          </span>
          <Button variant="outline" size="icon" className="size-11" onClick={() => nudge(STEP)}
            disabled={!device.reachable || off || target === undefined} aria-label={t("increase")}>
            <ChevronUp className="size-5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("mode")}>
          {MODES.map((m) => (
            <Button
              key={m.value}
              size="sm"
              variant={device.mode === m.value ? "default" : "outline"}
              disabled={!device.reachable}
              aria-pressed={device.mode === m.value}
              onClick={() => onChange(device.id, "mode", m.value)}
            >
              {t(m.key)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
