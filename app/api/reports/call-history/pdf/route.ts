import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/server-auth";
import { safeServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR", { timeZone: "America/Recife" }) : "";
}
function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const actor = await requireUser(req);
    const appointmentId = String(req.nextUrl.searchParams.get("appointmentId") || "").trim();
    if (!appointmentId) return Response.json({ error: "Agendamento inválido." }, { status: 400 });

    const appointmentSnap = await adminDb().collection("appointments").doc(appointmentId).get();
    if (!appointmentSnap.exists) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
    const appointment = appointmentSnap.data() as any;

    const attemptsSnap = await adminDb().collection("callAttempts").where("appointmentId", "==", appointmentId).get();
    const attempts = attemptsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)).sort((a, b) => {
      const da = toDate(a.requestedAt)?.getTime() || 0;
      const db = toDate(b.requestedAt)?.getTime() || 0;
      return da - db;
    });

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
      const words = safeText(text).split(/\s+/).filter(Boolean);
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
        if (y < margin + 25) { page = pdf.addPage(pageSize); y = pageSize[1] - margin; }
        page.drawText(line, { x, y, size, font, color: options.color || rgb(0.12, 0.12, 0.12) });
        y -= Math.max(lineHeight, size + 4);
      }
    };
    const separator = () => {
      if (y < margin + 25) { page = pdf.addPage(pageSize); y = pageSize[1] - margin; }
      page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.6, color: rgb(0.75, 0.75, 0.75) });
      y -= 14;
    };

    write("PORTAL COLETA DE RELATOS", { bold: true, size: 17 });
    write("Histórico de tentativas de ligação", { bold: true, size: 13 });
    y -= 4;
    separator();
    write(`Placa: ${safeText(appointment.plate)}`, { bold: true });
    write(`Associado: ${safeText(appointment.fullName)}`);
    write(`Telefone: ${safeText(appointment.phone)}`);
    write(`E-mail: ${safeText(appointment.email)}`);
    write(`Agendamento: ${safeText(appointment.date)} ${safeText(appointment.time)}`);
    write(`Responsável pela coleta: ${safeText(appointment.assignedToName || appointment.createdByName || "")}`);
    write(`Status: ${safeText(appointment.status)}`);
    if (appointment.notes) write(`Observações: ${safeText(appointment.notes)}`);
    y -= 4;
    separator();
    write(`Tentativas registradas: ${attempts.length}`, { bold: true });
    y -= 4;

    if (attempts.length === 0) {
      write("Nenhuma tentativa de ligação registrada para esta coleta.");
    } else {
      attempts.forEach((attempt, index) => {
        write(`${index + 1}. ${formatDate(attempt.requestedAt) || "Data não registrada"}`, { bold: true });
        write(`Status: ${attempt.status === "requested" ? "Solicitada" : safeText(attempt.status)}`, { indent: 10 });
        write(`Ramal: ${safeText(attempt.extension)} | Telefone: ${safeText(attempt.phone)}`, { indent: 10 });
        write(`Operador: ${safeText(attempt.userName)}`, { indent: 10 });
        if (attempt.providerResponse) write(`Retorno VTCall: ${safeText(attempt.providerResponse)}`, { indent: 10 });
        y -= 3;
      });
    }

    separator();
    write(`Documento gerado pelo Portal Coleta de Relatos por ${safeText(actor.name || actor.email || "usuário")}.`, { size: 8, color: rgb(0.38, 0.38, 0.38) });
    write(`Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" })}`, { size: 8, color: rgb(0.38, 0.38, 0.38) });

    const bytes = await pdf.save();
    const plate = safeText(appointment.plate).replace(/[^A-Z0-9]/gi, "") || appointmentId;
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Coleta_Relato_${plate}_${safeText(appointment.date)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const status = e?.message === "UNAUTHORIZED" ? 401 : e?.message === "FORBIDDEN" ? 403 : 500;
    const technical = safeServerError(e);
    return Response.json({ error: "Não foi possível gerar o PDF do histórico.", technical: status === 500 ? technical.message : undefined }, { status });
  }
}
