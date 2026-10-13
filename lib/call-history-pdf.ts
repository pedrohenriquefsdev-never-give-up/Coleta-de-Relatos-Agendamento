import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function toDate(value: any): Date | null {
  try {
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
  } catch {}
  return null;
}

function formatDate(value: any) {
  const date = toDate(value);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("pt-BR", { timeZone: "America/Recife" })
    : "";
}

export function safePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
    .trim();
}

export async function buildCallHistoryPdf({
  appointment,
  attempts,
  actorName,
  sgaObservation,
}: {
  appointment: any;
  attempts: any[];
  actorName: string;
  sgaObservation?: string;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const lineHeight = 15;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const write = (text: string, options: { bold?: boolean; size?: number; indent?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const size = options.size || 10;
    const x = margin + (options.indent || 0);
    const maxWidth = pageSize[0] - margin - x;
    const font = options.bold ? bold : regular;
    const words = safePdfText(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current || words.length === 0) lines.push(current || " ");

    for (const line of lines) {
      if (y < margin + 25) {
        page = pdf.addPage(pageSize);
        y = pageSize[1] - margin;
      }
      page.drawText(line, { x, y, size, font, color: options.color || rgb(0.12, 0.12, 0.12) });
      y -= Math.max(lineHeight, size + 4);
    }
  };

  const separator = () => {
    if (y < margin + 25) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 0.6,
      color: rgb(0.75, 0.75, 0.75),
    });
    y -= 14;
  };

  write("PORTAL COLETA DE RELATOS", { bold: true, size: 17 });
  write("Histórico de tentativas de ligação", { bold: true, size: 13 });
  y -= 4;
  separator();
  write(`Placa: ${safePdfText(appointment.plate)}`, { bold: true });
  write(`Associado: ${safePdfText(appointment.fullName)}`);
  write(`Telefone: ${safePdfText(appointment.phone)}`);
  write(`E-mail: ${safePdfText(appointment.email)}`);
  write(`Agendamento: ${safePdfText(appointment.date)} ${safePdfText(appointment.time)}`);
  write(`Responsável pela coleta: ${safePdfText(appointment.assignedToName || appointment.createdByName || "")}`);
  write(`Status: ${safePdfText(appointment.status)}`);
  if (appointment.notes) write(`Observações do agendamento: ${safePdfText(appointment.notes)}`);

  const observation = safePdfText(sgaObservation || appointment.sgaObservation || appointment.sga?.lastUpload?.observation || "");
  if (observation) {
    y -= 4;
    separator();
    write("Observação destinada ao SGA", { bold: true });
    write(observation);
  }

  y -= 4;
  separator();
  write(`Tentativas registradas: ${attempts.length}`, { bold: true });
  y -= 4;

  if (attempts.length === 0) {
    write("Nenhuma tentativa de ligação registrada para esta coleta.");
  } else {
    attempts.forEach((attempt, index) => {
      write(`${index + 1}. ${formatDate(attempt.requestedAt) || "Data não registrada"}`, { bold: true });
      write(`Status: ${attempt.status === "requested" ? "Solicitada" : safePdfText(attempt.status)}`, { indent: 10 });
      write(`Ramal: ${safePdfText(attempt.extension)} | Telefone: ${safePdfText(attempt.phone)}`, { indent: 10 });
      write(`Operador: ${safePdfText(attempt.userName)}`, { indent: 10 });
      if (attempt.providerResponse) write(`Retorno VTCall: ${safePdfText(attempt.providerResponse)}`, { indent: 10 });
      y -= 3;
    });
  }

  separator();
  write(`Documento gerado pelo Portal Coleta de Relatos por ${safePdfText(actorName || "usuário")}.`, {
    size: 8,
    color: rgb(0.38, 0.38, 0.38),
  });
  write(`Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" })}`, {
    size: 8,
    color: rgb(0.38, 0.38, 0.38),
  });

  const bytes = await pdf.save();
  const plate = safePdfText(appointment.plate).replace(/[^A-Z0-9]/gi, "") || "SEM_PLACA";
  const date = safePdfText(appointment.date) || "SEM_DATA";
  const filename = `Coleta_Relato_${plate}_${date}.pdf`;
  return { bytes, filename };
}
