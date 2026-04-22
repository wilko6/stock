import { type Delivery } from "@/lib/types";

export function generateInvoiceHtml(delivery: Delivery): string {
  const date: Date = new Date(delivery.createdAt);
  const formattedDate: string = [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("/");

  const itemRows: string = delivery.items
    .map((item) => {
      const unitPrice: string = (item.unitPriceCents / 100).toFixed(2);
      const subtotal: string = (
        (item.quantity * item.unitPriceCents) /
        100
      ).toFixed(2);

      return `
        <tr>
          <td>${item.productName}</td>
          <td class="center">${String(item.quantity)}</td>
          <td class="right">${unitPrice} &euro;</td>
          <td class="right">${subtotal} &euro;</td>
        </tr>`;
    })
    .join("");

  const totalDisplay: string = (delivery.totalCents / 100).toFixed(2);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #000; background: #fff; padding: 40px; }
    h1 { font-size: 28px; margin-bottom: 24px; }
    .meta { margin-bottom: 24px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border: 1px solid #000; padding: 8px 12px; text-align: left; }
    th { background: #f0f0f0; }
    .center { text-align: center; }
    .right { text-align: right; }
    .total td { font-weight: bold; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>FACTURE</h1>
  <div class="meta">
    <div>Date : ${formattedDate}</div>
    <div>De : ${delivery.source}</div>
    <div>&Agrave; : ${delivery.destination}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Produit</th>
        <th class="center">Quantit&eacute;</th>
        <th class="right">Prix unitaire</th>
        <th class="right">Sous-total</th>
      </tr>
    </thead>
    <tbody>${itemRows}
      <tr class="total">
        <td colspan="3" class="right">Total</td>
        <td class="right">${totalDisplay} &euro;</td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}
