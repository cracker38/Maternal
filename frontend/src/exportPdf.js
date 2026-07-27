const GREEN = [11, 61, 46];
const MUTED = [90, 111, 102];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function drawHeader(doc, { title, subtitle, meta }) {
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RMDP', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Rwanda Maternal Digital Platform', 14, 21);
  doc.setFontSize(8);
  doc.text('Ministry of Health · Rwanda', 14, 27);

  doc.setTextColor(...GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 44);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  if (subtitle) doc.text(subtitle, 14, 51);
  doc.setFontSize(8);
  const metaLine = [
    meta?.generated_at && `Generated ${meta.generated_at}`,
    meta?.scope && `Scope: ${meta.scope}`,
    meta?.role && `Role: ${String(meta.role).replace(/_/g, ' ')}`,
    meta?.place && meta.place,
  ].filter(Boolean).join('  ·  ');
  if (metaLine) doc.text(metaLine, 14, 58);
  return 66;
}

function drawFooter(doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(201, 216, 209);
    doc.line(14, 285, 196, 285);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('RMDP — confidential, for official maternal health use only', 14, 291);
    doc.text(`Page ${i} of ${pages}`, 196, 291, { align: 'right' });
  }
}

function sectionTitle(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GREEN);
  doc.setFontSize(11);
  doc.text(text, 14, y);
  return y + 4;
}

/** Lazily imports jsPDF + autotable so they're only bundled when needed. */
async function getPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
}

/**
 * Export the analytics report (any scope) as a branded RMDP PDF.
 */
export async function exportAnalyticsPdf({ title, subtitle, scope, user, data }) {
  const { jsPDF, autoTable } = await getPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const i = data?.indicators || {};
  const place = user?.facility_name || user?.district || 'Rwanda';

  let y = drawHeader(doc, {
    title: title || 'Maternal health report',
    subtitle: subtitle || '',
    meta: {
      generated_at: new Date().toLocaleString(),
      scope,
      role: user?.role,
      place,
    },
  });

  y = sectionTitle(doc, '1 · Key maternal indicators', y);
  autoTable(doc, {
    startY: y,
    head: [['Indicator', 'Value']],
    body: [
      ['Maternal deaths', String(i.maternal_deaths ?? 0)],
      ['Near misses / emergencies', String(i.near_misses ?? 0)],
      ['PPH rate', `${i.pph_rate ?? 0}%`],
      ['C-section rate', `${i.csection_rate ?? 0}%`],
      ['ANC4 coverage', `${i.anc_coverage ?? 0}%`],
      ['PNC coverage', `${i.pnc_coverage ?? 0}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: GREEN, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  y = sectionTitle(doc, '2 · Service volume', y);
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Deliveries', String(i.deliveries ?? 0)],
      ['Emergencies', String(i.emergencies ?? 0)],
      ['Active emergencies', String(i.active_emergencies ?? 0)],
      ['Pending referrals', String(i.pending_referrals ?? 0)],
      ['High-risk pregnancies', String(i.high_risk ?? 0)],
    ],
    theme: 'grid',
    headStyles: { fillColor: GREEN, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  const risk = data?.risk_distribution || {};
  y = sectionTitle(doc, '3 · Risk distribution', y);
  autoTable(doc, {
    startY: y,
    head: [['Risk band', 'Count']],
    body: [
      ['Low', String(risk.low_n ?? 0)],
      ['Medium', String(risk.medium_n ?? 0)],
      ['High', String(risk.high_n ?? 0)],
      ['Critical', String(risk.critical_n ?? 0)],
    ],
    theme: 'grid',
    headStyles: { fillColor: GREEN, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  const facilities = data?.by_facility || [];
  if (facilities.length && (scope === 'district' || scope === 'national')) {
    if (y > 220) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, '4 · Facilities monitored', y);
    autoTable(doc, {
      startY: y,
      head: [['Facility', 'District', 'Pregnancies', 'In labor', 'High risk']],
      body: facilities.map((f) => [f.name || '—', f.district || '—', String(f.pregnancies ?? 0), String(f.in_labor ?? 0), String(f.high_risk ?? 0)]),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const monthly = data?.monthly_deliveries || [];
  if (monthly.length) {
    if (y > 230) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, '5 · Monthly deliveries', y);
    autoTable(doc, {
      startY: y,
      head: [['Month', 'Deliveries', 'C-sections']],
      body: monthly.map((m) => [String(m.month || '—'), String(m.deliveries ?? 0), String(m.csections ?? 0)]),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });
  }

  drawFooter(doc);
  doc.save(`rmdp-${scope || 'facility'}-report-${stamp()}.pdf`);
}

/**
 * Export a management dashboard (MoH / DHO / Admin) summary as PDF.
 */
export async function exportDashboardPdf({ kind = 'report', title, user, dashboard, analytics }) {
  const { jsPDF, autoTable } = await getPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const ov = dashboard?.national_overview
    || dashboard?.district_overview
    || dashboard?.facility_overview || {};
  const risk = dashboard?.national_risk || {};
  const ranking = dashboard?.district_ranking || [];
  const aiReports = dashboard?.ai_support?.report_generation?.reports
    || dashboard?.ai_support?.dashboard_insights?.reports || [];
  const ind = analytics?.indicators || {};
  const pred = dashboard?.predictions || {};
  const facilities = dashboard?.by_facility || [];

  let y = drawHeader(doc, {
    title: title || kind.replace(/_/g, ' '),
    subtitle: 'Official maternal health summary',
    meta: {
      generated_at: new Date().toLocaleString(),
      scope: dashboard?.context?.scope || kind,
      role: user?.role,
      place: user?.facility_name || user?.district || 'Rwanda',
    },
  });

  y = sectionTitle(doc, 'Overview indicators', y);
  autoTable(doc, {
    startY: y,
    head: [['Indicator', 'Value']],
    body: [
      ['Pregnancies registered', String(ov.registered_mothers ?? 0)],
      ['ANC visits / completion', String(ov.anc_visits ?? ind.anc_coverage ?? 0)],
      ['Skilled birth attendance / deliveries', String(ov.skilled_birth_attendance ?? ov.deliveries ?? 0)],
      ['Emergencies', String(ov.emergencies ?? risk.emergencies ?? 0)],
      ['High-risk pregnancies', String(risk.high_risk ?? ind.high_risk ?? 0)],
      ['Critical risk cases', String(risk.critical ?? 0)],
      ['ANC4 coverage', `${ind.anc_coverage ?? 0}%`],
      ['PNC coverage', `${ind.pnc_coverage ?? 0}%`],
      ['PPH rate', `${ind.pph_rate ?? 0}%`],
      ['C-section rate', `${ind.csection_rate ?? 0}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: GREEN, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  if (ranking.length) {
    if (y > 200) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, 'District performance ranking', y);
    autoTable(doc, {
      startY: y,
      head: [['District', 'Facilities', 'Pregnancies', 'Deliveries', 'High risk', 'Emergencies']],
      body: ranking.map((d) => [d.district || '—', String(d.facilities ?? '—'), String(d.pregnancies ?? 0), String(d.deliveries ?? 0), String(d.high_risk ?? 0), String(d.emergencies ?? 0)]),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (facilities.length && !ranking.length) {
    if (y > 200) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, 'Facilities', y);
    autoTable(doc, {
      startY: y,
      head: [['Facility', 'District', 'Pregnancies', 'Deliveries', 'High risk', 'Emergencies']],
      body: facilities.map((f) => [f.name || '—', f.district || '—', String(f.pregnancies ?? 0), String(f.deliveries ?? 0), String(f.high_risk ?? 0), String(f.emergencies ?? 0)]),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const signals = [
    pred.mortality_signal && `Mortality vigilance: ${pred.mortality_signal}`,
    pred.resource_signal && `Resource requirement: ${pred.resource_signal}`,
    pred.hotspot && `Risk hotspot: ${pred.hotspot}`,
  ].filter(Boolean);

  if (signals.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, 'Prediction signals', y);
    y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    signals.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 5 + 2;
    });
    y += 4;
  }

  if (aiReports.length) {
    if (y > 230) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, 'AI-generated report summaries', y);
    autoTable(doc, {
      startY: y,
      head: [['Report', 'Summary']],
      body: aiReports.map((r) => [r.title || r.id || '—', r.summary || '—']),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 115 } },
    });
  }

  drawFooter(doc);
  doc.save(`rmdp-${kind}-${stamp()}.pdf`);
}
