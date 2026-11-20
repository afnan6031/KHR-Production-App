/**
 * v19: Clean, zero-dependency A4 PDF report generator for KHR Production.
 */
import { saveBlobFile } from './files';

function pdfEsc(s: string): string {
  const clean = s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00B7/g, '|')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

class PdfDoc {
  private pages: string[][] = [[]];
  private y = 800;
  private readonly W = 595;
  private readonly H = 842;
  private readonly M = 42;

  private cur(): string[] { return this.pages[this.pages.length - 1]; }
  private ensure(need: number) { if (this.y - need < 48) { this.pages.push([]); this.y = 795; } }

  banner(title: string, subtitle: string, meta: string) {
    const p = this.cur();
    p.push(`0.08 0.11 0.20 rg 0 ${this.H - 96} ${this.W} 96 re f`);
    p.push(`0.90 0.22 0.23 rg 0 ${this.H - 100} ${this.W} 4 re f`);
    p.push(`1 1 1 rg BT /F2 18 Tf ${this.M} ${this.H - 42} Td (${pdfEsc(title)}) Tj ET`);
    p.push(`0.82 0.85 0.92 rg BT /F1 10 Tf ${this.M} ${this.H - 62} Td (${pdfEsc(subtitle)}) Tj ET`);
    p.push(`0.65 0.70 0.80 rg BT /F1 8.5 Tf ${this.M} ${this.H - 80} Td (${pdfEsc(meta)}) Tj ET`);
    this.y = this.H - 122;
  }

  section(title: string) {
    this.ensure(34);
    this.y -= 6;
    const p = this.cur();
    p.push(`0.90 0.22 0.23 rg ${this.M} ${this.y + 2} 3 13 re f`);
    p.push(`0.10 0.13 0.22 rg BT /F2 12 Tf ${this.M + 10} ${this.y + 4} Td (${pdfEsc(title)}) Tj ET`);
    this.y -= 18;
  }

  statBoxes(items: { label: string; value: string; accent?: 'good' | 'warn' | 'bad' | 'accent' }[]) {
    this.ensure(56);
    const gap = 8;
    const usable = this.W - this.M * 2;
    const bw = (usable - gap * (items.length - 1)) / items.length;
    const p = this.cur();
    items.forEach((it, idx) => {
      const x = this.M + idx * (bw + gap);
      const top = this.y;
      p.push(`0.96 0.97 0.99 rg ${x.toFixed(1)} ${(top - 44).toFixed(1)} ${bw.toFixed(1)} 44 re f`);
      p.push(`0.86 0.88 0.92 RG 0.6 w ${x.toFixed(1)} ${(top - 44).toFixed(1)} ${bw.toFixed(1)} 44 re S`);
      const col =
        it.accent === 'good' ? '0.09 0.55 0.30' :
        it.accent === 'warn' ? '0.78 0.45 0.05' :
        it.accent === 'bad' ? '0.82 0.16 0.18' :
        it.accent === 'accent' ? '0.90 0.22 0.23' : '0.10 0.13 0.22';
      p.push(`${col} rg BT /F2 15 Tf ${(x + 8).toFixed(1)} ${(top - 22).toFixed(1)} Td (${pdfEsc(it.value)}) Tj ET`);
      p.push(`0.42 0.46 0.55 rg BT /F1 8 Tf ${(x + 8).toFixed(1)} ${(top - 36).toFixed(1)} Td (${pdfEsc(it.label)}) Tj ET`);
    });
    this.y -= 58;
  }

  table(headers: { text: string; w: number }[], rows: string[][]) {
    const usable = this.W - this.M * 2;
    const totalW = headers.reduce((a, b) => a + b.w, 0);
    const cols = headers.map((h) => ({ ...h, px: (h.w / totalW) * usable }));
    const drawHeader = () => {
      this.ensure(26);
      const p = this.cur();
      p.push(`0.12 0.16 0.26 rg ${this.M} ${(this.y - 20).toFixed(1)} ${usable} 20 re f`);
      let x = this.M;
      cols.forEach((c) => {
        p.push(`1 1 1 rg BT /F2 8.5 Tf ${(x + 6).toFixed(1)} ${(this.y - 13).toFixed(1)} Td (${pdfEsc(c.text)}) Tj ET`);
        x += c.px;
      });
      this.y -= 22;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      if (this.y - 22 < 48) { this.pages.push([]); this.y = 795; drawHeader(); }
      const p = this.cur();
      if (ri % 2 === 1) p.push(`0.96 0.97 0.99 rg ${this.M} ${(this.y - 19).toFixed(1)} ${usable} 19 re f`);
      p.push(`0.88 0.90 0.94 RG 0.4 w ${this.M} ${(this.y - 19).toFixed(1)} m ${this.M + usable} ${(this.y - 19).toFixed(1)} l S`);
      let x = this.M;
      cols.forEach((c, ci) => {
        const val = row[ci] ?? '';
        const maxCh = Math.max(4, Math.floor((c.px - 10) / 4.8));
        const clipped = val.length > maxCh ? val.slice(0, maxCh - 1) + '.' : val;
        p.push(`0.14 0.17 0.24 rg BT /F1 8.5 Tf ${(x + 6).toFixed(1)} ${(this.y - 12.5).toFixed(1)} Td (${pdfEsc(clipped)}) Tj ET`);
        x += c.px;
      });
      this.y -= 19;
    });
    this.y -= 10;
  }

  note(text: string) {
    const lines = wrap(text, 95);
    this.ensure(lines.length * 12 + 8);
    const p = this.cur();
    lines.forEach((ln) => {
      p.push(`0.42 0.46 0.55 rg BT /F1 8.5 Tf ${this.M} ${this.y} Td (${pdfEsc(ln)}) Tj ET`);
      this.y -= 12;
    });
    this.y -= 4;
  }

  toBlob(): Blob {
    const total = this.pages.length;
    this.pages.forEach((p, idx) => {
      p.push(`0.88 0.90 0.94 RG 0.5 w ${this.M} 36 m ${this.W - this.M} 36 l S`);
      p.push(`0.50 0.54 0.62 rg BT /F1 8 Tf ${this.M} 22 Td (KHR Production - Performance Report) Tj ET`);
      p.push(`0.50 0.54 0.62 rg BT /F1 8 Tf ${this.W - this.M - 48} 22 Td (Page ${idx + 1} of ${total}) Tj ET`);
    });
    const objs: string[] = [];
    const addObj = (body: string) => { objs.push(body); return objs.length; };
    const catalogId = addObj('');
    const pagesId = addObj('');
    const f1 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const f2 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds: number[] = [];
    for (const cmds of this.pages) {
      const stream = cmds.join('\n');
      const contentId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets: number[] = [0];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xrefPos = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  }
}

export interface MemberPdfInput {
  name: string; title?: string; periodLabel: string; rank?: number; score: number | null;
  onTime: number; late: number; missed: number; rejected: number; pending: number; points: number; counted: number; done: number;
  channels: { name: string; score: number | null; roles: { role: string; score: number | null; done: number; counted: number }[] }[];
  tasks: { day: string; channel: string; role: string; status: string }[];
}

export async function downloadMemberProgressPdf(data: MemberPdfInput): Promise<string> {
  const doc = new PdfDoc();
  const gen = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  doc.banner('KHR Production - Member Performance Report', `${data.name}${data.title ? ' | ' + data.title : ''}`, `Period: ${data.periodLabel} | Rank: ${data.rank ? '#' + data.rank : 'N/A'} | Generated: ${gen}`);
  doc.section('Overall Summary');
  doc.statBoxes([
    { label: 'Overall Score', value: data.score == null ? '-' : `${data.score}%`, accent: data.score == null ? undefined : data.score >= 85 ? 'good' : data.score >= 65 ? 'warn' : 'bad' },
    { label: 'On Time', value: String(data.onTime), accent: 'good' },
    { label: 'Late (Extra 24h)', value: String(data.late), accent: 'warn' },
    { label: 'Ended / Missed', value: String(data.missed), accent: 'bad' },
    { label: 'Rejected', value: String(data.rejected), accent: 'bad' },
    { label: 'Total Points', value: String(data.points), accent: 'accent' }
  ]);
  if (data.channels.length) {
    doc.section('Channel & Role Breakdown');
    const rows: string[][] = [];
    data.channels.forEach((c) => c.roles.forEach((r) => rows.push([c.name, r.role, `${r.done}/${r.counted}`, r.score == null ? '-' : `${r.score}%`, c.score == null ? '-' : `${c.score}%`])));
    doc.table([{ text: 'Channel', w: 32 }, { text: 'Role', w: 26 }, { text: 'Completed', w: 14 }, { text: 'Role Score', w: 14 }, { text: 'Channel Avg', w: 14 }], rows);
  }
  if (data.tasks.length) {
    doc.section(`Task History (${data.tasks.length} tasks)`);
    doc.table([{ text: 'Date', w: 16 }, { text: 'Channel', w: 34 }, { text: 'Role', w: 28 }, { text: 'Status', w: 22 }], data.tasks.slice(0, 80).map((t) => [t.day, t.channel, t.role, t.status]));
  }
  doc.note('Scoring: On-time = 10 pts | Extra 24h = 5 pts | Ended = 0 pts | Rejected = -10% penalty.');
  return saveBlobFile(doc.toBlob(), `KHR-Progress-${data.name.replace(/[^\w-]+/g, '_').slice(0, 30)}-${data.periodLabel.replace(/[^\w-]+/g, '_').slice(0, 24)}.pdf`);
}

export interface TeamStandingPdfInput {
  periodLabel: string;
  rows: { rank: number; name: string; title?: string; score: number | null; points: number; onTime: number; late: number; missed: number; rejected: number; done: number; counted: number }[];
}

export async function downloadTeamRankingPdf(data: TeamStandingPdfInput): Promise<string> {
  const doc = new PdfDoc();
  const gen = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  doc.banner('KHR Production - Team Performance Standings', `Official Team Ranking - ${data.periodLabel}`, `Total Ranked Members: ${data.rows.length} | Generated: ${gen}`);
  const scored = data.rows.filter((r) => r.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length) : 0;
  const top = data.rows[0];
  doc.section('Team Highlights');
  doc.statBoxes([
    { label: 'Top Performer', value: top ? top.name.slice(0, 14) : '-', accent: 'accent' },
    { label: 'Top Score', value: top && top.score != null ? `${top.score}%` : '-', accent: 'good' },
    { label: 'Team Average', value: `${avg}%`, accent: avg >= 85 ? 'good' : avg >= 65 ? 'warn' : 'bad' },
    { label: 'Total Members', value: String(data.rows.length) }
  ]);
  doc.section('Complete Team Standings');
  doc.table(
    [{ text: '#', w: 6 }, { text: 'Member Name', w: 28 }, { text: 'Score', w: 10 }, { text: 'Points', w: 10 }, { text: 'Done', w: 12 }, { text: 'On Time', w: 10 }, { text: 'Late', w: 8 }, { text: 'Ended', w: 8 }, { text: 'Rej', w: 8 }],
    data.rows.map((r) => [`#${r.rank}`, r.name, r.score == null ? '-' : `${r.score}%`, String(r.points), `${r.done}/${r.counted}`, String(r.onTime), String(r.late), String(r.missed), String(r.rejected)])
  );
  doc.note('Official KHR Production standings report. Individual detailed reports can be downloaded from any member profile or ranking row.');
  return saveBlobFile(doc.toBlob(), `KHR-Team-Standings-${data.periodLabel.replace(/[^\w-]+/g, '_').slice(0, 28)}.pdf`);
}
