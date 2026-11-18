"use client";

import { useTranslations } from "next-intl";
import { Check, LayoutGrid, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  editing: boolean;
  hasCustomLayout: boolean;
  onEdit: () => void;
  onDone: () => void;
  onReset: () => void;
}

export function WidgetGridToolbar({ editing, hasCustomLayout, onEdit, onDone, onReset }: Props) {
  const t = useTranslations("dashboard");
  if (!editing) {
    return (
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onEdit} className="gap-2 opacity-70 hover:opacity-100">
          <LayoutGrid className="size-4" aria-hidden="true" />
          {t("gridCustomize")}
        </Button>
      </div>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-2 elev-sm">
      <p className="text-sm text-muted-foreground">{t("gridHint")}</p>
      <div className="flex gap-2">
        {hasCustomLayout && (
          <Button variant="outline" size="sm" onClick={onReset} className="gap-2">
            <RotateCcw className="size-4" aria-hidden="true" />
            {t("gridReset")}
          </Button>
        )}
        <Button size="sm" onClick={onDone} className="gap-2">
          <Check className="size-4" aria-hidden="true" />
          {t("gridDone")}
        </Button>
      </div>
    </div>
  );
}
