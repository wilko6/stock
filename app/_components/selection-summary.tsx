"use client";

import { centsToDisplay } from "@/lib/types";

export interface SummaryItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  autoPrice: number;
}

interface SelectionSummaryProps {
  items: SummaryItem[];
  priceOverrides: Record<string, string>;
  onPriceOverrideChange: (productId: string, value: string) => void;
  descriptions: Record<string, string>;
  onDescriptionChange: (productId: string, value: string) => void;
  onItemClick?: (productId: string) => void;
  onItemRemove?: (productId: string) => void;
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
  );
}

function handleRowKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onActivate: () => void
): void {
  if (event.key === "Enter") {
    onActivate();

    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

function stopMouseEventPropagation(event: React.MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}

function stopKeyboardEventPropagation(
  event: React.KeyboardEvent<HTMLElement>
): void {
  event.stopPropagation();
}

export default function SelectionSummary({
  items,
  priceOverrides,
  onPriceOverrideChange,
  descriptions,
  onDescriptionChange,
  onItemClick,
  onItemRemove,
}: SelectionSummaryProps) {
  const total: number = items.reduce(
    (sum: number, item: SummaryItem) =>
      sum + item.quantity * item.unitPriceCents,
    0
  );

  const isInteractive: boolean = onItemClick !== undefined;

  return (
    <div className="rounded-lg border border-foreground/10">
      {/* Mobile: stacked cards */}
      <div className="sm:hidden">
        {items.map((item: SummaryItem) => {
          const rowInteractiveProps = isInteractive
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => onItemClick?.(item.productId),
                onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) =>
                  handleRowKeyDown(event, () => onItemClick?.(item.productId)),
              }
            : {};
          const rowInteractiveClass: string = isInteractive
            ? "cursor-pointer hover:bg-foreground/5"
            : "";

          return (
            <div
              key={item.productId}
              {...rowInteractiveProps}
              className={`border-b border-foreground/5 px-3 py-3 last:border-b-0 ${rowInteractiveClass}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.productName}</span>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span className="font-mono text-sm text-foreground/70">
                    &times;{item.quantity}
                  </span>
                  {onItemRemove !== undefined && (
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onItemRemove(item.productId);
                      }}
                      onKeyDown={stopKeyboardEventPropagation}
                      className="btn-danger text-red-500/70 transition-colors hover:text-red-500"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
              <div
                className="mt-2 flex gap-2"
                onClick={stopMouseEventPropagation}
                onKeyDown={stopKeyboardEventPropagation}
              >
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`${centsToDisplay(item.autoPrice)} €`}
                    value={priceOverrides[item.productId] ?? ""}
                    onChange={(event) => {
                      const val: string = event.target.value;

                      if (val !== "" && Number(val) < 0) {
                        return;
                      }

                      onPriceOverrideChange(item.productId, val);
                    }}
                    className="w-full rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/50"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="description"
                    value={descriptions[item.productId] ?? ""}
                    onChange={(event) =>
                      onDescriptionChange(item.productId, event.target.value)
                    }
                    className="w-full rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/50"
                  />
                </div>
              </div>
              <div className="mt-1 text-right font-mono text-sm text-foreground/70">
                {centsToDisplay(item.quantity * item.unitPriceCents)}
                &nbsp;&euro;
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t border-foreground/10 px-3 py-3 font-medium">
          <span>Total</span>
          <span className="font-mono">
            {centsToDisplay(total)}&nbsp;&euro;
          </span>
        </div>
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="thead-row border-b border-foreground/10">
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 text-right font-medium">Qt&eacute;</th>
              <th className="px-4 py-3 font-medium">Prix &euro;</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Sous-total</th>
              {onItemRemove !== undefined && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item: SummaryItem) => {
              const rowInteractiveProps = isInteractive
                ? {
                    role: "button",
                    tabIndex: 0,
                    onClick: () => onItemClick?.(item.productId),
                    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) =>
                      handleRowKeyDown(event, () =>
                        onItemClick?.(item.productId)
                      ),
                  }
                : {};
              const rowInteractiveClass: string = isInteractive
                ? "cursor-pointer hover:bg-foreground/5"
                : "";

              return (
                <tr
                  key={item.productId}
                  {...rowInteractiveProps}
                  className={`border-b border-foreground/5 last:border-b-0 ${rowInteractiveClass}`}
                >
                  <td className="px-4 py-3">{item.productName}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.quantity}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={stopMouseEventPropagation}
                    onKeyDown={stopKeyboardEventPropagation}
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={centsToDisplay(item.autoPrice)}
                      value={priceOverrides[item.productId] ?? ""}
                      onChange={(event) => {
                        const val: string = event.target.value;

                        if (val !== "" && Number(val) < 0) {
                          return;
                        }

                        onPriceOverrideChange(item.productId, val);
                      }}
                      className="w-24 rounded-md border border-foreground/20 bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-foreground/50"
                    />
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={stopMouseEventPropagation}
                    onKeyDown={stopKeyboardEventPropagation}
                  >
                    <input
                      type="text"
                      placeholder="optionnel"
                      value={descriptions[item.productId] ?? ""}
                      onChange={(event) =>
                        onDescriptionChange(item.productId, event.target.value)
                      }
                      className="w-full min-w-[120px] rounded-md border border-foreground/20 bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-foreground/50"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground/70">
                    {centsToDisplay(item.quantity * item.unitPriceCents)}
                    &nbsp;&euro;
                  </td>
                  {onItemRemove !== undefined && (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={stopMouseEventPropagation}
                      onKeyDown={stopKeyboardEventPropagation}
                    >
                      <button
                        type="button"
                        aria-label="Supprimer"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          onItemRemove(item.productId);
                        }}
                        className="btn-danger text-red-500/70 transition-colors hover:text-red-500"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-foreground/10 font-medium">
              <td className="px-4 py-3" colSpan={4}>
                Total
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {centsToDisplay(total)}&nbsp;&euro;
              </td>
              {onItemRemove !== undefined && <td className="px-4 py-3" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
