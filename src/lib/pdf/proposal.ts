import type { PDFFont } from "pdf-lib";
import type { Lead } from "@/lib/db/queries";
import type { SellerProfile } from "@/lib/settings/sellerProfile";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 56;

function wrapText(text: string, maxWidth: number, size: number, font: PDFFont): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** A simple one-page proposal PDF combining the Seller Profile with what the AI
 * found on this lead — generated entirely client-side, no external API involved. */
export async function generateProposalPdf(
  lead: Lead,
  profile: SellerProfile,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2;

  let y = PAGE_HEIGHT - 64;

  function ensureSpace(needed: number) {
    if (y - needed < 56) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 64;
    }
  }

  function heading(text: string) {
    ensureSpace(28);
    y -= 6;
    page.drawText(text, { x: MARGIN_X, y, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
  }

  function paragraph(text: string, size = 11) {
    for (const line of wrapText(text, maxWidth, size, font)) {
      ensureSpace(size + 6);
      page.drawText(line, { x: MARGIN_X, y, size, font, color: rgb(0.2, 0.2, 0.2) });
      y -= size + 6;
    }
  }

  // Header
  page.drawText(profile.company || profile.name || "Proposal", {
    x: MARGIN_X,
    y,
    size: 20,
    font: bold,
    color: rgb(0.06, 0.06, 0.06),
  });
  y -= 26;
  if (profile.name) {
    page.drawText(profile.name, { x: MARGIN_X, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 24;
  } else {
    y -= 10;
  }

  heading(`Proposal for ${lead.business || lead.website || "your business"}`);

  if (lead.summary) {
    heading("About your business");
    paragraph(lead.summary);
  }

  const painPoints = (lead.pain_points ?? "").split("\n").map((p) => p.trim()).filter(Boolean);
  if (painPoints.length > 0) {
    heading("Opportunities we identified");
    for (const point of painPoints) paragraph(`•  ${point}`);
  }

  heading("What we offer");
  paragraph(profile.offer || "Our services");

  if (profile.proofPoints) {
    heading("Why work with us");
    paragraph(profile.proofPoints);
  }

  if (profile.cta || profile.bookingLink) {
    heading("Next step");
    if (profile.cta) paragraph(profile.cta);
    if (profile.bookingLink) paragraph(profile.bookingLink);
  }

  if (profile.signature) {
    ensureSpace(60);
    y -= 16;
    for (const line of profile.signature.split("\n")) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN_X, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
      y -= 14;
    }
  }

  return doc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
