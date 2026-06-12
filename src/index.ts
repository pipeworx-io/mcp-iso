interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * ISO Standards MCP — keyless.
 *
 * ISO sells the normative text, so it is NOT freely available. What IS public:
 *  - Each standard's landing page (iso.org/standard/<n>) — reference, full
 *    title, publication status, edition, price and a buy link. Parsed live.
 *  - A curated catalogue of the compliance-relevant standards (ISMS, privacy,
 *    AI, quality, continuity, risk) so an agent can resolve "ISO 27001" → number.
 *  - ISO Open Data — bulk metadata (all ~25k deliverables) under ODC-By 1.0;
 *    this pack surfaces the file URLs rather than proxying the 78 MB dumps.
 *
 * For free, full-text regulatory law (GDPR/NIS2/DORA/EU AI Act) use the eur-lex
 * pack — ISO text itself stays behind the ISO store paywall.
 */


const SITE = 'https://www.iso.org';
const UA = 'pipeworx-mcp-iso/1.0 (+https://pipeworx.io)';

/** Curated map of the compliance/security/AI/quality corpus → ISO number.
 *  family groups series so an agent can pull "the 27000 family" at once. */
const CATALOG: Array<{ number: string; family: string; name: string; summary: string }> = [
  // Information security management (ISMS) — 27000 family
  { number: '27001', family: 'ISMS (27000)', name: 'ISO/IEC 27001 — Information security management systems — Requirements', summary: 'The certifiable ISMS standard; Annex A controls. The reference for SOC/ISMS audits.' },
  { number: '27002', family: 'ISMS (27000)', name: 'ISO/IEC 27002 — Information security controls', summary: 'Implementation guidance and control set referenced by 27001 Annex A.' },
  { number: '27005', family: 'ISMS (27000)', name: 'ISO/IEC 27005 — Guidance on managing information security risks', summary: 'Risk management process for an ISMS.' },
  { number: '27017', family: 'ISMS (27000)', name: 'ISO/IEC 27017 — Information security controls for cloud services', summary: 'Cloud-specific control guidance extending 27002.' },
  { number: '27018', family: 'ISMS (27000)', name: 'ISO/IEC 27018 — Protection of PII in public clouds', summary: 'PII processor controls for public cloud providers.' },
  { number: '27031', family: 'ISMS (27000)', name: 'ISO/IEC 27031 — ICT readiness for business continuity', summary: 'ICT continuity guidance bridging 27001 and 22301.' },
  { number: '27036', family: 'ISMS (27000)', name: 'ISO/IEC 27036 — Information security for supplier relationships', summary: 'Third-party / supply-chain security.' },
  { number: '27040', family: 'ISMS (27000)', name: 'ISO/IEC 27040 — Storage security', summary: 'Security controls for data storage systems.' },
  { number: '27701', family: 'Privacy (27700)', name: 'ISO/IEC 27701 — Privacy information management (PIMS)', summary: 'Privacy extension to 27001/27002; maps to GDPR controller/processor duties.' },
  { number: '29100', family: 'Privacy (29100)', name: 'ISO/IEC 29100 — Privacy framework', summary: 'Foundational privacy terminology and principles.' },
  // AI
  { number: '42001', family: 'AI (42000)', name: 'ISO/IEC 42001 — Artificial intelligence management system (AIMS)', summary: 'The certifiable AI management system standard; the ISO analogue to the EU AI Act governance ask.' },
  { number: '23894', family: 'AI (42000)', name: 'ISO/IEC 23894 — AI — Guidance on risk management', summary: 'Risk management guidance for AI, aligned to 31000.' },
  { number: '42005', family: 'AI (42000)', name: 'ISO/IEC 42005 — AI system impact assessment', summary: 'Process for assessing impacts of AI systems on individuals and society.' },
  // Quality, environment, continuity, risk, service, safety, medical
  { number: '9001', family: 'Management systems', name: 'ISO 9001 — Quality management systems — Requirements', summary: 'The certifiable quality management system standard.' },
  { number: '14001', family: 'Management systems', name: 'ISO 14001 — Environmental management systems', summary: 'The certifiable environmental management system standard.' },
  { number: '22301', family: 'Management systems', name: 'ISO 22301 — Business continuity management systems', summary: 'The certifiable business continuity standard.' },
  { number: '31000', family: 'Management systems', name: 'ISO 31000 — Risk management — Guidelines', summary: 'Principles and framework for enterprise risk management (guidance, not certifiable).' },
  { number: '20000-1', family: 'Management systems', name: 'ISO/IEC 20000-1 — IT service management', summary: 'The certifiable ITSM standard.' },
  { number: '45001', family: 'Management systems', name: 'ISO 45001 — Occupational health and safety management', summary: 'The certifiable OH&S management standard.' },
  { number: '13485', family: 'Management systems', name: 'ISO 13485 — Medical devices — Quality management systems', summary: 'QMS for medical device regulatory purposes.' },
];

const OPEN_DATA = {
  license: 'ODC-By 1.0 (attribution required)',
  hub: `${SITE}/open-data.html`,
  files: {
    deliverables_metadata_jsonl: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/json/iso_deliverables_metadata.jsonl',
    deliverables_metadata_csv: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/csv/iso_deliverables_metadata.csv',
    deliverables_metadata_parquet: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/parquet/iso_deliverables_metadata.parquet',
    ics_csv: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_ics/csv/ICS.csv',
    technical_committees_jsonl: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_technical_committees/json/iso_technical_committees.jsonl',
  },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'lookup_standard',
    description:
      'Live details for an ISO standard by number: reference (e.g. "ISO/IEC 27001:2022"), full title, publication status, price (CHF) and the buy/landing URL. Note: ISO sells the normative text — this returns the public catalogue page, not the standard\'s clauses.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        number: { type: 'string', description: 'ISO number, e.g. "27001", "ISO/IEC 42001" or "9001". Year suffix is ignored.' },
      },
      required: ['number'],
    },
  },
  {
    name: 'compliance_catalog',
    description:
      'Curated catalogue of the compliance-relevant ISO standards (ISMS/27000, privacy, AI/42000, quality, continuity, risk, service management) → ISO number, family and a one-line summary. Use first to resolve a name like "ISO 27001" or to pull a whole family, then call lookup_standard.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Optional filter on number/name/summary/family, e.g. "privacy", "AI", "27000".' },
      },
    },
  },
  {
    name: 'open_data_files',
    description:
      'URLs for ISO Open Data — bulk metadata for all ~25k ISO deliverables (number, title, scope, ICS, committee, status) plus the ICS classification and technical-committee lists. Licensed ODC-By 1.0. For full-catalogue search, ingest these dumps; this pack does not proxy the 78 MB files.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

/* ---------- helpers ---------- */

function normNumber(input: string): string | null {
  const cleaned = String(input ?? '')
    .replace(/iso|\/?iec|\/?ts|\/?tr|\/?pas/gi, ' ')
    .replace(/:\s*\d{4}.*$/, '') // drop ":2022" edition year
    .trim();
  const m = cleaned.match(/(\d{2,5}(?:-\d+)?)/);
  return m ? m[1] : null;
}

function pickAttr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/* ---------- dispatch ---------- */

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'open_data_files':
      return OPEN_DATA;

    case 'compliance_catalog': {
      const q = String(args.query ?? '').trim().toLowerCase();
      const rows = q
        ? CATALOG.filter((e) => (e.number + ' ' + e.name + ' ' + e.summary + ' ' + e.family).toLowerCase().includes(q))
        : CATALOG;
      return {
        count: rows.length,
        standards: rows.map((e) => ({ ...e, iso_url: `${SITE}/search.html?q=${encodeURIComponent('ISO ' + e.number)}` })),
        note: 'Pass a number to lookup_standard for live status/price. ISO normative text is paywalled (see open_data_files for free metadata).',
      };
    }

    case 'lookup_standard': {
      const num = normNumber(String(args.number ?? ''));
      if (!num) throw new Error('Could not parse an ISO number from input. Try e.g. "27001" or "ISO/IEC 42001".');
      const indexed = CATALOG.find((e) => e.number === num);
      const searchUrl = `${SITE}/search.html?q=${encodeURIComponent('ISO ' + num)}`;
      // Curated info is always returned; live page data is best-effort on top.
      const base = {
        number: num,
        reference: indexed?.name?.split(' — ')[0] ?? null,
        title: indexed?.name?.split(' — ').slice(1).join(' — ') || null,
        family: indexed?.family ?? null,
        summary: indexed?.summary ?? null,
        search_url: searchUrl,
        buy_url: `${SITE}/store.html`,
      };
      let html = '';
      let landing = '';
      try {
        const res = await fetch(`${SITE}/standard/${num}`, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
        if (res.ok) { html = await res.text(); landing = res.url; }
      } catch { /* fall through to curated-only */ }

      const reference = html ? pickAttr(html, /<meta property="og:title" content="([^"]+)"/i) : null;
      // CORRECTNESS GUARD: iso.org's number→page map is inconsistent and can serve
      // a different standard (e.g. /standard/42001.html → ISO 12164-4). Only trust
      // the live page when its reference actually carries the requested number.
      const numRe = new RegExp(`(?:^|[^0-9-])${num.replace(/-/g, '\\-')}(?:[:.\\s-]|$)`);
      const live = reference && numRe.test(decode(reference));
      if (!live) {
        return {
          ...base,
          found_live: false,
          note: indexed
            ? `Curated entry returned. ISO's public site has no free number→page index, so live status/price for ${num} isn't resolvable server-side — open search_url, or use open_data_files for the full metadata.`
            : `Not in the curated compliance catalogue and not resolvable on iso.org by number. Open search_url, or ingest open_data_files for the full ~25k-standard metadata.`,
        };
      }
      const titleTag = pickAttr(html, /<title>([^<]+)<\/title>/i);
      const subject = titleTag ? decode(titleTag).split(/\s+[-–]\s+/).slice(1).join(' — ').trim() || null : null;
      const price = pickAttr(html, /itemprop="price"[^>]*>\s*([\d.,]+)/i) || pickAttr(html, /itemprop="price"[^>]*content="([^"]+)"/i);
      const currency = pickAttr(html, /itemprop="priceCurrency"[^>]*content="([^"]+)"/i) || 'CHF';
      // Status from the reference's stage token: drafts read ISO/FDIS|DIS|CD|WD|…,
      // published editions carry a :YYYY year. More reliable than the page's
      // stage-code legend (which lists every stage as static help text).
      const ref = decode(reference!);
      const status = /\/(FDIS|DIS|CD|WD|PRF|NP|AWI|PWI)\b/i.test(ref)
        ? 'Under development (draft)'
        : /:\s*\d{4}/.test(ref)
          ? 'Published'
          : null;
      return {
        ...base,
        found_live: true,
        reference: ref,
        title: subject ?? base.title,
        status,
        price: price ? { amount: price, currency } : null,
        landing_url: landing,
        note: 'ISO sells the normative text — price is for the official PDF/paper. Free metadata for all standards: open_data_files.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
