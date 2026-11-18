"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Flame, Snowflake, Thermometer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WidgetCard } from "@/components/widget-card";
import { Button } from "@/components/ui/button";
import { useWidgetSize } from "@/components/widget-size-context";
import {
  useCallService,
  useHomeAssistantEntities,
  useHomeAssistantEntityStates,
  useHomeAssistantStatus,
} from "@/hooks";
import type { HAEntity } from "@/types/home-assistant";

// Which thermostat a device shows is a per-device choice (the kitchen panel
// shows the living room; a phone might show the bedroom).
const SELECTED_KEY = "kinboard.thermostat-entity";
// Taps are batched: one service call per burst instead of one per tap.
const SEND_DELAY_MS = 700;
// If Home Assistant never confirms the value, stop showing our guess.
const PENDING_TIMEOUT_MS = 20_000;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number, step: number) => Math.round(v / step) * step;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Heating controls for Home Assistant `climate` entities: current and target
 * temperature, +/- in the entity's own step, and the modes it supports.
 * Compact cells show one thermostat's temperature and target; medium adds the
 * modes and a switcher; large lists every thermostat.
 */
export function ThermostatWidget({ className = "" }: { className?: string }) {
  const t = useTranslations("thermostatWidget");
  const size = useWidgetSize();
  const tier = size?.tier ?? "medium";
  const { data: haStatus } = useHomeAssistantStatus();
  const isConnected = !!haStatus?.url;
  const { data: listed = [] } = useHomeAssistantEntities("climate", isConnected);
  const ids = listed.map((e) => e.entity_id);
  // The list refreshes every minute; the states every 15 s, so a change made
  // from the wall or from elsewhere shows up quickly.
  const { data: live } = useHomeAssistantEntityStates(ids, isConnected, 15_000);
  const entities: HAEntity[] = (live && live.length > 0 ? live : listed).filter((e) => e.domain === "climate");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelectedId(window.localStorage.getItem(SELECTED_KEY));
    } catch {
      /* ignore */
    }
  }, []);
  const selected = entities.find((e) => e.entity_id === selectedId) ?? entities[0];
  const selectIndex = (index: number) => {
    const next = entities[(index + entities.length) % entities.length];
    if (!next) return;
    setSelectedId(next.entity_id);
    try {
      window.localStorage.setItem(SELECTED_KEY, next.entity_id);
    } catch {
      /* ignore */
    }
  };

  if (!isConnected || entities.length === 0) {
    return (
      <WidgetCard icon={Thermometer} title={t("title")} className={className}>
        <div className="flex flex-col items-center gap-3 py-4 text-center text-sm text-muted-foreground">
          <p>{isConnected ? t("noThermostats") : t("notConnected")}</p>
          {!isConnected && (
            <Link href="/settings/homeassistant" className="text-primary underline-offset-2 hover:underline">
              {t("connect")}
            </Link>
          )}
        </div>
      </WidgetCard>
    );
  }

  const switcher =
    entities.length > 1 && tier !== "large" && selected ? (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" aria-label={t("previous")} onClick={() => selectIndex(entities.indexOf(selected) - 1)}>
          <ChevronDown className="size-4 rotate-90" />
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {entities.indexOf(selected) + 1}/{entities.length}
        </span>
        <Button variant="ghost" size="icon" className="size-8" aria-label={t("next")} onClick={() => selectIndex(entities.indexOf(selected) + 1)}>
          <ChevronUp className="size-4 rotate-90" />
        </Button>
      </div>
    ) : undefined;

  return (
    <WidgetCard icon={Thermometer} title={t("title")} headerRight={switcher} className={className}>
      <div className="flex min-h-0 flex-col gap-3 overflow-auto">
        {tier === "large"
          ? entities.map((e) => <Thermostat key={e.entity_id} entity={e} tier="large" />)
          : selected && <Thermostat entity={selected} tier={tier} />}
      </div>
    </WidgetCard>
  );
}

function Thermostat({ entity, tier }: { entity: HAEntity; tier: "compact" | "medium" | "large" }) {
  const t = useTranslations("thermostatWidget");
  const tMode = useTranslations("homeAutomation.hvacMode");
  const tAction = useTranslations("homeAutomation.hvacAction");
  const { mutateAsync: callService } = useCallService();

  const unavailable = entity.state === "unavailable" || entity.state === "unknown";
  const current = num(entity.attributes.current_temperature);
  const target = num(entity.attributes.temperature);
  const step = num(entity.attributes.target_temp_step) ?? 0.5;
  const min = num(entity.attributes.min_temp) ?? 7;
  const max = num(entity.attributes.max_temp) ?? 30;
  const action = entity.attributes.hvac_action as string | undefined;
  const modes = (entity.attributes.hvac_modes as string[] | undefined) ?? [];
  const isOff = entity.state === "off";
  const heating = action === "heating";
  const cooling = action === "cooling";

  // What the screen shows while a change is on its way to Home Assistant.
  const [pending, setPending] = useState<number | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const expireTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(sendTimer.current);
      clearTimeout(expireTimer.current);
    },
    [],
  );
  // Confirmed by Home Assistant: drop the guess.
  useEffect(() => {
    if (pending !== null && target !== undefined && Math.abs(target - pending) < 0.01) setPending(null);
  }, [target, pending]);

  const shownTarget = pending ?? target;

  const nudge = useCallback(
    (direction: 1 | -1) => {
      if (unavailable || isOff || shownTarget === undefined) return;
      const next = clamp(snap(shownTarget + direction * step, step), min, max);
      setPending(next);
      clearTimeout(sendTimer.current);
      clearTimeout(expireTimer.current);
      sendTimer.current = setTimeout(async () => {
        try {
          await callService({
            domain: "climate",
            service: "set_temperature",
            entity_id: entity.entity_id,
            service_data: { temperature: next },
          });
          expireTimer.current = setTimeout(() => setPending(null), PENDING_TIMEOUT_MS);
        } catch {
          setPending(null);
          toast.error(t("setFailed"));
        }
      }, SEND_DELAY_MS);
    },
    [callService, entity.entity_id, isOff, max, min, shownTarget, step, t, unavailable],
  );

  const setMode = async (mode: string) => {
    try {
      await callService({
        domain: "climate",
        service: "set_hvac_mode",
        entity_id: entity.entity_id,
        service_data: { hvac_mode: mode },
      });
    } catch {
      toast.error(t("modeFailed"));
    }
  };

  const statusText = unavailable
    ? t("unavailable")
    : action && ["heating", "cooling", "drying", "idle", "off"].includes(action)
      ? tAction(action as "heating" | "cooling" | "drying" | "idle" | "off")
      : ["auto", "heat", "cool", "heat_cool", "dry", "fan_only", "off"].includes(entity.state)
        ? tMode(entity.state as "auto" | "heat" | "cool" | "heat_cool" | "dry" | "fan_only" | "off")
        : entity.state;
  const statusColor = heating ? "text-state-alert" : cooling ? "text-state-cool" : "text-muted-foreground";
  const StatusIcon = cooling ? Snowflake : Flame;

  const stepper = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="size-11"
        onClick={() => nudge(-1)}
        disabled={unavailable || isOff || shownTarget === undefined || shownTarget <= min}
        aria-label={t("decrease")}
      >
        <ChevronDown className="size-5" />
      </Button>
      <span className="min-w-[4.5rem] text-center text-2xl font-semibold tabular-nums" aria-live="polite">
        {isOff || shownTarget === undefined ? "—" : `${fmt(shownTarget)}°`}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-11"
        onClick={() => nudge(1)}
        disabled={unavailable || isOff || shownTarget === undefined || shownTarget >= max}
        aria-label={t("increase")}
      >
        <ChevronUp className="size-5" />
      </Button>
    </div>
  );

  const modeButtons =
    tier !== "compact" && modes.length > 0 ? (
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("modes")}>
        {modes.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={entity.state === m ? "default" : "outline"}
            onClick={() => setMode(m)}
            disabled={unavailable}
            aria-pressed={entity.state === m}
          >
            {["auto", "heat", "cool", "heat_cool", "dry", "fan_only", "off"].includes(m)
              ? tMode(m as "auto" | "heat" | "cool" | "heat_cool" | "dry" | "fan_only" | "off")
              : m}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl ${tier === "large" ? "border border-border/40 p-3" : ""} ${
        unavailable ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entity.name}</p>
          <p className={`flex items-center gap-1 text-xs ${statusColor}`}>
            {(heating || cooling) && <StatusIcon className="size-3" aria-hidden="true" />}
            {statusText}
          </p>
        </div>
        {current !== undefined && (
          <div className="text-right">
            <span className={`font-display font-light tabular-nums ${tier === "compact" ? "text-3xl" : "text-5xl"}`}>
              {fmt(current)}°
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
        <span className="text-xs text-muted-foreground">{t("target")}</span>
        {stepper}
      </div>
      {modeButtons}
    </div>
  );
}
