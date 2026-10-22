const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const money = (value) => {
  const num = Math.round((Number(value) || 0) * 100) / 100;
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

/**
 * Normalises bill data from any screen. Pass `invoiceNo` (e.g. sale id or payment reference)
 * so printing and downloading the same bill show the same number.
 */
export function buildInvoice({ shop, items = [], total, method, customerName, invoiceNo, date } = {}) {
  const lines = items.map(item => {
    const qty = Number(item.qty ?? item.quantity) || 0;
    const price = Number(item.price) || 0;
    return { name: String(item.name || item.productName || 'Item'), qty, unit: item.unit || 'pc', price, amount: qty * price };
  });
  const when = date ? new Date(date) : new Date();
  return {
    shop: {
      name: shop?.name || 'ANTARYA KIRANA STORE',
      ownerName: shop?.ownerName || '',
      city: shop?.city || '',
      phone: shop?.phone || ''
    },
    invoiceNo: invoiceNo ? String(invoiceNo) : `INV-${when.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dateStr: when.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    customerName: customerName || 'Walk-in Customer',
    method: String(method || 'CASH'),
    lines,
    total: total !== undefined && total !== null ? Number(total) || 0 : lines.reduce((s, l) => s + l.amount, 0),
    unitCount: lines.reduce((s, l) => s + l.qty, 0)
  };
}

export function invoiceHtml(inv) {
  const rows = inv.lines.map((l, i) => `
    <tr>
      <td class="item">${i + 1}. ${escapeHtml(l.name)}</td>
      <td class="c">${escapeHtml(l.qty)} ${escapeHtml(l.unit)}</td>
      <td class="r">₹${money(l.price)}</td>
      <td class="r b">₹${money(l.amount)}</td>
    </tr>`).join('');
  const contact = [inv.shop.city && `City: ${escapeHtml(inv.shop.city)}`, inv.shop.phone && `Phone: ${escapeHtml(inv.shop.phone)}`].filter(Boolean).join(' | ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill ${escapeHtml(inv.invoiceNo)}</title>
  <style>
    body { font-family: 'Courier New', Courier, monospace; max-width: 380px; margin: 0 auto; padding: 20px 15px; color: #111; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 14px; }
    .shop-name { font-size: 22px; font-weight: 900; margin: 0 0 4px; text-transform: uppercase; }
    .shop-info { font-size: 13px; color: #444; margin: 2px 0; }
    .meta { font-size: 13px; margin-bottom: 14px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; font-size: 13px; border-bottom: 2px solid #000; padding-bottom: 6px; text-transform: uppercase; }
    td { padding: 8px 0; border-bottom: 1px dashed #ddd; font-size: 14px; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .grand-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; border-top: 1px dashed #000; border-bottom: 2px solid #000; padding: 8px 0; margin: 10px 0; }
    .count { display: flex; justify-content: space-between; font-size: 13px; color: #555; }
    .footer { text-align: center; font-size: 13px; margin-top: 20px; color: #333; line-height: 1.4; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="shop-name">${escapeHtml(inv.shop.name)}</h1>
    ${inv.shop.ownerName ? `<div class="shop-info">Owner: ${escapeHtml(inv.shop.ownerName)}</div>` : ''}
    ${contact ? `<div class="shop-info">${contact}</div>` : ''}
  </div>
  <div class="meta">
    <div><strong>Bill No:</strong> ${escapeHtml(inv.invoiceNo)}</div>
    <div><strong>Date:</strong> ${escapeHtml(inv.dateStr)}</div>
    <div><strong>Customer:</strong> ${escapeHtml(inv.customerName)}</div>
    <div><strong>Payment Mode:</strong> <b style="text-transform: uppercase;">${escapeHtml(inv.method)}</b></div>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="grand-total"><span>GRAND TOTAL:</span><span>₹${money(inv.total)}</span></div>
  <div class="count"><span>Items Count:</span><span>${inv.lines.length} (${money(inv.unitCount)} units)</span></div>
  <div class="footer"><strong>Thank you for your visit!</strong><br/>Please visit us again.</div>
</body>
</html>`;
}

/** Opens the browser print dialog for the bill (choose "Save as PDF" to keep a copy). No popup window needed. */
export function generateInvoice(data) {
  const inv = buildInvoice(data);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  let printed = false;
  frame.onload = () => {
    if (printed) return;
    printed = true;
    const win = frame.contentWindow;
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    win.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    win.focus();
    win.print();
  };
  frame.srcdoc = invoiceHtml(inv);
  document.body.appendChild(frame);
  return inv;
}

/** Downloads the bill as a PDF file (receipt-width page). */
export async function downloadInvoice(data) {
  const inv = buildInvoice(data);
  const doc = await createInvoicePdf(inv);
  doc.save(`Bill-${inv.invoiceNo.replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`);
  return inv;
}

export async function createInvoicePdf(inv) {
  const { jsPDF } = await import('jspdf');

  const width = 80;
  const margin = 5;
  const inner = width - margin * 2;
  const measure = new jsPDF({ unit: 'mm', format: [width, 200] });
  measure.setFontSize(9);
  const wrapped = inv.lines.map(l => measure.splitTextToSize(`${l.name}`, inner));
  const height = Math.max(120, 78 + wrapped.reduce((s, w) => s + w.length * 4 + 5, 0));

  const doc = new jsPDF({ unit: 'mm', format: [width, height] });
  const rs = (v) => `Rs. ${money(v)}`;
  let y = 10;

  doc.setFont('courier', 'bold');
  doc.setFontSize(13);
  doc.splitTextToSize(inv.shop.name.toUpperCase(), inner).forEach(line => {
    doc.text(line, width / 2, y, { align: 'center' });
    y += 5;
  });
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  if (inv.shop.ownerName) { doc.text(`Owner: ${inv.shop.ownerName}`, width / 2, y, { align: 'center' }); y += 4; }
  const contact = [inv.shop.city && `City: ${inv.shop.city}`, inv.shop.phone && `Phone: ${inv.shop.phone}`].filter(Boolean).join(' | ');
  if (contact) { doc.text(contact, width / 2, y, { align: 'center' }); y += 4; }
  doc.setLineWidth(0.4);
  doc.line(margin, y, width - margin, y);
  y += 5;

  doc.setFontSize(8.5);
  [`Bill No: ${inv.invoiceNo}`, `Date: ${inv.dateStr}`, `Customer: ${inv.customerName}`, `Payment: ${inv.method.toUpperCase()}`]
    .forEach(text => {
      doc.splitTextToSize(text, inner).forEach(line => { doc.text(line, margin, y); y += 4; });
    });
  y += 1;
  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFont('courier', 'bold');
  doc.text('ITEM', margin, y);
  doc.text('AMOUNT', width - margin, y, { align: 'right' });
  y += 2;
  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFontSize(9);
  inv.lines.forEach((l, i) => {
    doc.setFont('courier', 'normal');
    wrapped[i].forEach(line => { doc.text(line, margin, y); y += 4; });
    doc.setFontSize(8);
    doc.text(`${money(l.qty)} ${l.unit} x ${rs(l.price)}`, margin, y);
    doc.setFont('courier', 'bold');
    doc.text(rs(l.amount), width - margin, y, { align: 'right' });
    doc.setFontSize(9);
    y += 5;
  });

  doc.setLineWidth(0.4);
  doc.line(margin, y, width - margin, y);
  y += 6;
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.text('GRAND TOTAL', margin, y);
  doc.text(rs(inv.total), width - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(`Items: ${inv.lines.length} (${money(inv.unitCount)} units)`, margin, y);
  y += 8;
  doc.text('Thank you for your visit!', width / 2, y, { align: 'center' });
  y += 4;
  doc.text('Please visit us again.', width / 2, y, { align: 'center' });

  return doc;
}
