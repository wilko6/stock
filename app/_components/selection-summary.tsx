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
}

export default function SelectionSummary({
  items,
  priceOverrides,
  onPriceOverrideChange,
  descriptions,
  onDescriptionChange,
}: SelectionSummaryProps) {
  const total: number = items.reduce(
    (sum: number, item: SummaryItem) =>
      sum + item.quantity * item.unitPriceCents,
    0
  );

  return (
    <div className="rounded-lg border border-foreground/10">
      {/* Mobile: stacked cards */}
      <div className="sm:hidden">
        {items.map((item: SummaryItem) => (
          <div
            key={item.productId}
            className="border-b border-foreground/5 px-3 py-3 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">{item.productName}</span>
              <span className="ml-2 shrink-0 font-mono text-sm text-foreground/70">
                &times;{item.quantity}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`${centsToDisplay(item.autoPrice)} \u20ac`}
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
              {centsToDisplay(item.quantity * item.unitPriceCents)}&nbsp;&euro;
            </div>
          </div>
        ))}
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
            </tr>
          </thead>
          <tbody>
            {items.map((item: SummaryItem) => (
              <tr
                key={item.productId}
                className="border-b border-foreground/5 last:border-b-0"
              >
                <td className="px-4 py-3">{item.productName}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {item.quantity}
                </td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3">
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
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-foreground/10 font-medium">
              <td className="px-4 py-3" colSpan={4}>
                Total
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {centsToDisplay(total)}&nbsp;&euro;
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
