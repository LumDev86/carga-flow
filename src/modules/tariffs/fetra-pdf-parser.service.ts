import { Injectable, Logger, BadRequestException } from '@nestjs/common';

const { PDFParse } = require('pdf-parse');

export interface FetraParsedEntry {
  km: number;
  pricePerTon: number;
}

export interface FetraParsedResult {
  entries: FetraParsedEntry[];
  metadata: {
    pageCount: number;
    rawTextPreview: string;
  };
}

@Injectable()
export class FetraPdfParserService {
  private readonly logger = new Logger(FetraPdfParserService.name);

  async parsePdf(buffer: Buffer): Promise<FetraParsedResult> {
    let textData: any;
    try {
      const uint8 = new Uint8Array(buffer);
      const parser = new PDFParse(uint8);
      textData = await parser.getText();
    } catch (error: any) {
      throw new BadRequestException(
        `Error leyendo PDF: ${error.message}. Verifique que el archivo sea un PDF válido y no una imagen escaneada.`,
      );
    }

    // getText() returns { pages: [{ text: string }] }
    const pages = textData?.pages || [];
    const fullText = pages.map((p: any) => p.text || '').join('\n');

    if (!fullText || fullText.trim().length < 50) {
      throw new BadRequestException(
        'El PDF no contiene texto extraíble. Puede ser una imagen escaneada — se requiere un PDF con texto seleccionable.',
      );
    }

    const entries = this.extractEntries(fullText);

    if (entries.length < 10) {
      throw new BadRequestException(
        `Solo se encontraron ${entries.length} entradas de tarifa. Se requieren al menos 10. Verifique que el PDF sea una tabla de tarifas Fe.Tr.A.`,
      );
    }

    // Validate monotonically increasing km
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].km <= entries[i - 1].km) {
        throw new BadRequestException(
          `Error de consistencia: km ${entries[i].km} no es mayor que ${entries[i - 1].km} (fila ${i + 1})`,
        );
      }
    }

    // Validate all prices are positive
    const negativePrice = entries.find((e) => e.pricePerTon <= 0);
    if (negativePrice) {
      throw new BadRequestException(
        `Precio inválido (${negativePrice.pricePerTon}) para km ${negativePrice.km}`,
      );
    }

    this.logger.log(
      `PDF parseado: ${entries.length} entradas, km ${entries[0].km}-${entries[entries.length - 1].km}`,
    );

    return {
      entries,
      metadata: {
        pageCount: pages.length,
        rawTextPreview: fullText.substring(0, 500),
      },
    };
  }

  private extractEntries(text: string): FetraParsedEntry[] {
    const lines = text.split('\n');
    const entries: FetraParsedEntry[] = [];
    const seen = new Set<number>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (this.isHeaderOrFooter(trimmed)) continue;

      // Fe.Tr.A PDFs have multi-column format on each line:
      // "1 8453,24 51 16119,29 101 23965,13 151 29929,56 201 36464,11 251 43057,86"
      // Each pair is: km(int) price(decimal with comma)
      this.extractPairsFromLine(trimmed, entries, seen);
    }

    entries.sort((a, b) => a.km - b.km);
    return entries;
  }

  private extractPairsFromLine(
    line: string,
    entries: FetraParsedEntry[],
    seen: Set<number>,
  ): void {
    // Match all km-price pairs in the line
    // Real Fe.Tr.A format: "1 8453,24 51 16119,29 101 23965,13"
    // Also supports: "1 8.453,24" (with thousands separator) or "$16.119,29"
    const pattern = /(\d{1,4})\s+\$?\s*([\d.]+,\d{2})/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const km = parseInt(match[1], 10);
      const price = this.parseArgentineNumber(match[2]);

      if (km > 0 && km <= 9999 && price > 0 && !seen.has(km)) {
        entries.push({ km, pricePerTon: Math.round(price * 100) / 100 });
        seen.add(km);
      }
    }
  }

  private isHeaderOrFooter(line: string): boolean {
    const lower = line.toLowerCase();
    return (
      lower.includes('fe.tr.a') ||
      lower.includes('federación') ||
      (lower.includes('tarifa') && lower.includes('referencia')) ||
      (lower.includes('tarifa') && lower.includes('cereales')) ||
      lower.includes('provincia de') ||
      lower.includes('página') ||
      lower.includes('page') ||
      lower.includes('estadía') ||
      /^\s*km\s+\$\/tn/i.test(line) ||
      /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)
    );
  }

  /**
   * Parses Argentine number format:
   * "8453,24"   → 8453.24   (no thousands separator)
   * "8.453,24"  → 8453.24   (with thousands separator)
   * "16119,29"  → 16119.29
   * "1234.56"   → 1234.56   (fallback international)
   */
  private parseArgentineNumber(str: string): number {
    if (str.includes(',')) {
      // Argentine format: dots are thousands separators, comma is decimal
      const cleaned = str.replace(/\./g, '').replace(',', '.');
      return parseFloat(cleaned);
    }
    return parseFloat(str);
  }
}
