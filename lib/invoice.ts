import { type Delivery, type Payment } from "@/lib/types";

export function generateInvoiceHtml(record: Delivery | Payment): string {
  const date: Date = new Date(record.createdAt);
  const formattedDate: string = [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear()),
  ].join("/");

  const itemRows: string = record.items
    .map((item, index) => {
      const unitPrice: string = (item.unitPriceCents / 100).toFixed(2);
      const subtotal: string = (
        (item.quantity * item.unitPriceCents) /
        100
      ).toFixed(2);
      const rowClass: string = index % 2 === 0 ? "row-even" : "row-odd";

      return `
        <tr class="${rowClass}">
          <td>${item.productName}</td>
          <td class="center">${String(item.quantity)}</td>
          <td class="right">${unitPrice} &euro;</td>
          <td class="right">${subtotal} &euro;</td>
        </tr>`;
    })
    .join("");

  const totalDisplay: string = (record.totalCents / 100).toFixed(2);

  const destination: string | undefined = "destination" in record ? record.destination : undefined;
  const locationLine: string = destination !== undefined
    ? `<div class="meta-row"><span class="meta-label">De</span><span class="meta-value">${record.source}</span></div>
    <div class="meta-row"><span class="meta-label">&Agrave;</span><span class="meta-value">${destination}</span></div>`
    : `<div class="meta-row"><span class="meta-label">De</span><span class="meta-value">${record.source}</span></div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&display=swap">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      background: #faf4e8;
      color: #2a2520;
    }

    body {
      font-family: 'Fraunces', Georgia, serif;
      font-variation-settings: "opsz" 12;
      font-weight: 400;
      font-size: 14.5px;
      line-height: 1.55;
      padding: 32px 20px;
      min-height: 100vh;
    }

    .page {
      position: relative;
      max-width: 800px;
      margin: 0 auto;
      padding: 64px 68px 72px;
      background: #faf4e8;
      border: 1px solid rgba(197, 165, 90, 0.22);
      box-shadow:
        0 1px 2px rgba(42, 37, 32, 0.04),
        0 10px 28px rgba(42, 37, 32, 0.06);
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Botanical decorations — top right */
    .botanical-top {
      position: absolute;
      top: 18px;
      right: 22px;
      width: 110px;
      height: 110px;
      opacity: 0.4;
      pointer-events: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Botanical decorations — bottom left */
    .botanical-bottom {
      position: absolute;
      bottom: 24px;
      left: 28px;
      width: 120px;
      height: 100px;
      opacity: 0.3;
      pointer-events: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Header */
    h1 {
      font-family: 'Fraunces', Georgia, serif;
      font-variation-settings: "opsz" 48;
      font-weight: 500;
      font-size: 38px;
      letter-spacing: 0.04em;
      color: #2a2520;
      margin-bottom: 14px;
      text-transform: uppercase;
    }

    .title-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .title-divider-line {
      flex: 0 0 72px;
      height: 1px;
      background: linear-gradient(to right, #6bb5a0, rgba(107, 181, 160, 0.15));
    }

    .title-divider-dot {
      width: 6px;
      height: 6px;
      background: #c5a55a;
      border-radius: 50%;
      transform: rotate(45deg);
      border-radius: 1px;
    }

    .title-divider-line-short {
      flex: 0 0 32px;
      height: 1px;
      background: linear-gradient(to right, rgba(197, 165, 90, 0.55), rgba(197, 165, 90, 0.1));
    }

    /* Meta block */
    .meta {
      margin-bottom: 36px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .meta-row {
      display: flex;
      align-items: baseline;
      gap: 14px;
    }

    .meta-label {
      display: inline-block;
      min-width: 64px;
      font-style: italic;
      font-weight: 500;
      color: #4a9e8a;
      border-bottom: 1px solid rgba(197, 165, 90, 0.45);
      padding-bottom: 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .meta-value {
      color: #2a2520;
      font-weight: 400;
    }

    /* Items table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    thead th {
      background: rgba(107, 181, 160, 0.22);
      color: #2a2520;
      font-weight: 600;
      font-style: italic;
      font-size: 13.5px;
      letter-spacing: 0.02em;
      padding: 12px 14px;
      text-align: left;
      border-top: 1px solid rgba(74, 158, 138, 0.35);
      border-bottom: 1px solid rgba(74, 158, 138, 0.35);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    thead th.center { text-align: center; }
    thead th.right { text-align: right; }

    thead th:last-child {
      border-right: 2px solid rgba(197, 165, 90, 0.55);
    }

    tbody td {
      padding: 11px 14px;
      border-bottom: 1px solid rgba(197, 165, 90, 0.15);
      font-size: 14.5px;
      color: #2a2520;
    }

    tbody td:last-child {
      border-right: 2px solid rgba(197, 165, 90, 0.55);
    }

    tbody tr.row-odd td {
      background: #f5f1ea;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tbody tr.row-even td {
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .center { text-align: center; }
    .right { text-align: right; }

    /* Total row */
    tr.total td {
      background: transparent;
      border-bottom: none;
      border-top: 2px solid #c5a55a;
      padding-top: 16px;
      padding-bottom: 16px;
      font-weight: 700;
      font-size: 16px;
      color: #2a2520;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tr.total td.total-label {
      font-style: italic;
      font-weight: 600;
      color: #a88b3e;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    tr.total td:last-child {
      border-right: 2px solid #c5a55a;
    }

    /* Footer flourish */
    .footer-flourish {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
      margin-top: 44px;
      opacity: 0.7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .footer-flourish-line {
      width: 50px;
      height: 1px;
      background: linear-gradient(to right, transparent, rgba(197, 165, 90, 0.5), transparent);
    }

    .footer-flourish-dot {
      width: 5px;
      height: 5px;
      background: #6bb5a0;
      transform: rotate(45deg);
    }

    /* Print */
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }

      .page {
        border: none;
        box-shadow: none;
        padding: 36px 44px 48px;
        max-width: 100%;
        background: #ffffff;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <svg class="botanical-top" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Main stem -->
      <path d="M 95 10 Q 70 45 40 95" stroke="#4a9e8a" stroke-width="1.2" fill="none" opacity="0.8" />
      <!-- Side stem -->
      <path d="M 78 35 Q 60 40 50 55" stroke="#4a9e8a" stroke-width="0.9" fill="none" opacity="0.6" />
      <!-- Leaves along main stem -->
      <path d="M 88 20 Q 78 14 72 22 Q 80 26 88 20 Z" fill="#6bb5a0" opacity="0.85" />
      <path d="M 82 32 Q 94 30 96 40 Q 88 42 82 32 Z" fill="#6bb5a0" opacity="0.7" />
      <path d="M 70 45 Q 58 43 56 53 Q 66 56 70 45 Z" fill="#6bb5a0" opacity="0.8" />
      <path d="M 64 58 Q 76 58 80 68 Q 70 70 64 58 Z" fill="#4a9e8a" opacity="0.65" />
      <path d="M 52 72 Q 40 72 38 82 Q 48 84 52 72 Z" fill="#6bb5a0" opacity="0.75" />
      <path d="M 46 86 Q 58 88 60 98 Q 50 98 46 86 Z" fill="#4a9e8a" opacity="0.6" />
      <!-- Side-stem leaves -->
      <path d="M 70 38 Q 62 34 58 42 Q 66 46 70 38 Z" fill="#6bb5a0" opacity="0.55" />
      <path d="M 56 50 Q 46 50 46 58 Q 54 60 56 50 Z" fill="#6bb5a0" opacity="0.55" />
      <!-- Gold berry accents -->
      <circle cx="93" cy="16" r="1.8" fill="#c5a55a" opacity="0.75" />
      <circle cx="45" cy="90" r="1.6" fill="#c5a55a" opacity="0.65" />
    </svg>

    <svg class="botanical-bottom" viewBox="0 0 140 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Curled vine -->
      <path d="M 10 95 Q 30 80 48 82 Q 68 84 78 70 Q 88 56 80 44 Q 72 34 82 28" stroke="#4a9e8a" stroke-width="1.1" fill="none" opacity="0.75" />
      <!-- Trio of leaves clustered -->
      <path d="M 20 92 Q 10 84 14 76 Q 24 80 20 92 Z" fill="#6bb5a0" opacity="0.75" />
      <path d="M 34 88 Q 28 76 36 70 Q 44 78 34 88 Z" fill="#6bb5a0" opacity="0.65" />
      <path d="M 50 82 Q 48 70 58 68 Q 62 78 50 82 Z" fill="#4a9e8a" opacity="0.7" />
      <!-- Mid vine leaves -->
      <path d="M 72 72 Q 64 64 72 58 Q 80 64 72 72 Z" fill="#6bb5a0" opacity="0.6" />
      <path d="M 82 50 Q 74 44 80 36 Q 88 42 82 50 Z" fill="#6bb5a0" opacity="0.55" />
      <!-- Curl tip leaf -->
      <path d="M 84 26 Q 76 20 82 14 Q 90 20 84 26 Z" fill="#4a9e8a" opacity="0.6" />
      <!-- Gold accent dots -->
      <circle cx="15" cy="90" r="1.5" fill="#c5a55a" opacity="0.7" />
      <circle cx="82" cy="12" r="1.4" fill="#c5a55a" opacity="0.7" />
    </svg>

    <h1>Facture</h1>
    <div class="title-divider">
      <span class="title-divider-line"></span>
      <span class="title-divider-dot"></span>
      <span class="title-divider-line-short"></span>
    </div>

    <div class="meta">
      <div class="meta-row"><span class="meta-label">Date</span><span class="meta-value">${formattedDate}</span></div>
      ${locationLine}
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
          <td colspan="3" class="right total-label">Total</td>
          <td class="right">${totalDisplay} &euro;</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-flourish">
      <span class="footer-flourish-line"></span>
      <span class="footer-flourish-dot"></span>
      <span class="footer-flourish-line"></span>
    </div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}
