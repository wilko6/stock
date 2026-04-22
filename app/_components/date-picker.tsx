"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface DatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
}

const MONTH_NAMES: string[] = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const DAY_LABELS: string[] = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

function toDisplayDate(iso: string): string {
  const date: Date = new Date(iso);

  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("/");
}

function toIso(year: number, month: number, day: number): string {
  return [
    String(year),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [viewYear, setViewYear] = useState<number>(new Date(value).getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(new Date(value).getMonth());
  const wrapperRef: React.RefObject<HTMLDivElement | null> = useRef<HTMLDivElement>(null);

  const close = useCallback((): void => {
    setIsOpen(false);
  }, []);

  function open(): void {
    const date: Date = new Date(value);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
    setIsOpen(true);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onMouseDown(event: MouseEvent): void {
      if (wrapperRef.current !== null && !wrapperRef.current.contains(event.target as Node)) {
        close();
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  const now: Date = new Date();
  const todayIso: string = toIso(now.getFullYear(), now.getMonth(), now.getDate());

  const selectedIso: string = useMemo((): string => {
    const date: Date = new Date(value);

    return toIso(date.getFullYear(), date.getMonth(), date.getDate());
  }, [value]);

  const cells: (number | null)[] = useMemo((): (number | null)[] => {
    const firstDay: number = new Date(viewYear, viewMonth, 1).getDay();
    const offset: number = (firstDay + 6) % 7;
    const daysInMonth: number = new Date(viewYear, viewMonth + 1, 0).getDate();
    const spacers: null[] = Array.from({ length: offset }, (): null => null);
    const days: number[] = Array.from({ length: daysInMonth }, (_: unknown, i: number): number => i + 1);

    return [...spacers, ...days];
  }, [viewYear, viewMonth]);

  function changeMonth(delta: number): void {
    const date: Date = new Date(viewYear, viewMonth + delta);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  }

  function selectDay(day: number): void {
    onChange(toIso(viewYear, viewMonth, day));
    close();
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => isOpen ? close() : open()}
        className="rounded border border-transparent bg-transparent px-1 py-0.5 font-mono outline-none hover:border-foreground/20 focus:border-foreground/40 cursor-pointer"
        style={{ color: "inherit" }}
      >
        {toDisplayDate(value)}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-foreground/10 bg-background p-3 text-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="rounded p-1 text-foreground/65 hover:bg-foreground/5 hover:text-foreground"
            >
              ‹
            </button>
            <span className="text-sm font-medium">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="rounded p-1 text-foreground/65 hover:bg-foreground/5 hover:text-foreground"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label: string) => (
              <span key={label} className="text-xs font-medium text-foreground/55 text-center">
                {label}
              </span>
            ))}

            {cells.map((day: number | null, index: number) => {
              if (day === null) {
                return <span key={`empty-${String(index)}`} />;
              }

              const iso: string = toIso(viewYear, viewMonth, day);
              const isSelected: boolean = iso === selectedIso;
              const isToday: boolean = iso === todayIso;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 w-full rounded-md text-sm cursor-pointer transition-colors flex items-center justify-center ${
                    isSelected
                      ? "bg-foreground text-background font-medium"
                      : isToday
                        ? "ring-1 ring-foreground/30 font-medium hover:bg-foreground/10"
                        : "hover:bg-foreground/10"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
