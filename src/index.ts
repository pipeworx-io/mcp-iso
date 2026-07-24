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
 * ISO Standards MCP — hosted.
 *
 * Backed by iso_standards, our mirror of the ISO Open Data deliverables
 * dataset (ODC-By 1.0), ingested by workers/data-pipeline. Gives reliable
 * search + lookup over every ISO deliverable: reference, title, abstract
 * (scope), publication status, edition, ICS, owner committee and the
 * supersession chain — plus the correct iso.org page via the catalogue id.
 *
 * What it does NOT have: the normative clause text. ISO sells that; it is not
 * in the open data and stays paywalled (price is best-effort live). For free
 * full-text law use the eur-lex pack.
 *
 * Tools needing the DB (search_standards, get_standard) receive operator
 * Supabase credentials injected by the gateway (_supabaseUrl/_supabaseKey).
 * compliance_catalog and open_data_files are static and need no DB.
 */


const SITE = 'https://www.iso.org';
const UA = 'pipeworx-mcp-iso/2.0 (+https://pipeworx.io)';

interface SupabaseConfig { url: string; key: string; }

interface IsoRow {
  id: number;
  reference: string;
  ref_number: string | null;
  title_en: string | null;
  deliverable_type: string | null;
  supplement_type: string | null;
  edition: number | null;
  publication_date: string | null;
  ics_code: string | null;
  owner_committee: string | null;
  stage_code: number | null;
  status: string | null;
  replaces: string | null;
  replaced_by: string | null;
  scope_en: string | null;
}

/** Curated map of the compliance corpus → ISO number (static, no DB). */
const CATALOG: Array<{ number: string; family: string; name: string; summary: string }> = [
  { number: '27001', family: 'ISMS (27000)', name: 'ISO/IEC 27001 — Information security management systems — Requirements', summary: 'The certifiable ISMS standard; Annex A controls. Reference for ISMS/SOC audits.' },
  { number: '27002', family: 'ISMS (27000)', name: 'ISO/IEC 27002 — Information security controls', summary: 'Implementation guidance / control set referenced by 27001 Annex A.' },
  { number: '27005', family: 'ISMS (27000)', name: 'ISO/IEC 27005 — Managing information security risks', summary: 'Risk management process for an ISMS.' },
  { number: '27017', family: 'ISMS (27000)', name: 'ISO/IEC 27017 — Cloud security controls', summary: 'Cloud-specific control guidance extending 27002.' },
  { number: '27018', family: 'ISMS (27000)', name: 'ISO/IEC 27018 — Protection of PII in public clouds', summary: 'PII-processor controls for public cloud providers.' },
  { number: '27701', family: 'Privacy (27700)', name: 'ISO/IEC 27701 — Privacy information management (PIMS)', summary: 'Privacy extension to 27001/27002; maps to GDPR controller/processor duties.' },
  { number: '29100', family: 'Privacy (29100)', name: 'ISO/IEC 29100 — Privacy framework', summary: 'Foundational privacy terminology and principles.' },
  { number: '42001', family: 'AI (42000)', name: 'ISO/IEC 42001 — AI management system (AIMS)', summary: 'The certifiable AI management system standard; the ISO analogue to EU AI Act governance.' },
  { number: '23894', family: 'AI (42000)', name: 'ISO/IEC 23894 — AI risk management guidance', summary: 'Risk management guidance for AI, aligned to 31000.' },
  { number: '9001', family: 'Management systems', name: 'ISO 9001 — Quality management systems — Requirements', summary: 'The certifiable quality management system standard.' },
  { number: '14001', family: 'Management systems', name: 'ISO 14001 — Environmental management systems', summary: 'The certifiable environmental management system standard.' },
  { number: '22301', family: 'Management systems', name: 'ISO 22301 — Business continuity management systems', summary: 'The certifiable business continuity standard.' },
  { number: '31000', family: 'Management systems', name: 'ISO 31000 — Risk management — Guidelines', summary: 'Principles and framework for enterprise risk management (guidance).' },
  { number: '20000-1', family: 'Management systems', name: 'ISO/IEC 20000-1 — IT service management', summary: 'The certifiable ITSM standard.' },
  { number: '45001', family: 'Management systems', name: 'ISO 45001 — Occupational health and safety management', summary: 'The certifiable OH&S management standard.' },
  { number: '13485', family: 'Management systems', name: 'ISO 13485 — Medical devices QMS', summary: 'QMS for medical device regulatory purposes.' },
];

const OPEN_DATA = {
  license: 'ODC-By 1.0 (attribution required)',
  hub: `${SITE}/open-data.html`,
  files: {
    deliverables_metadata_csv: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/csv/iso_deliverables_metadata.csv',
    deliverables_metadata_jsonl: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_deliverables_metadata/json/iso_deliverables_metadata.jsonl',
    ics_csv: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_ics/csv/ICS.csv',
    technical_committees_jsonl: 'https://isopublicstorageprod.blob.core.windows.net/opendata/_latest/iso_technical_committees/json/iso_technical_committees.jsonl',
  },
  note: 'Pipeworx mirrors deliverables_metadata into the iso_standards table that search_standards / get_standard query. Normative clause text is NOT in the open data (paywalled).',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'search_standards',
    description:
      'Search the full ISO catalogue (~all deliverables) by keyword across reference, title and abstract, with optional filters. Returns reference, title, status, abstract snippet, committee and the iso.org link. Use to find standards on a topic ("supply chain security", "medical device risk").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keywords matched against title + abstract + reference (full-text).' },
        committee: { type: 'string', description: 'Filter by owner committee, e.g. "JTC 1/SC 27" (substring).' },
        ics: { type: 'string', description: 'Filter by ICS classification code prefix, e.g. "35.030" (IT security).' },
        type: { type: 'string', description: 'Filter by deliverable type: IS, TR, TS, PAS, Guide, …' },
        status: { type: 'string', enum: ['Published', 'Withdrawn', 'Under development'], description: 'Filter by publication status (prefix match).' },
        limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_standard',
    description:
      'Full record for one ISO standard by number ("27001") or reference ("ISO/IEC 27001:2022"): title, abstract, status, edition, publication date, ICS, committee, the supersession chain, the correct iso.org page, and a best-effort live price. The reliable lookup (resolves any standard via its catalogue id).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        number: { type: 'string', description: 'ISO number or reference, any form: "27001", "ISO 9001", "ISO-9001", "ISO9001", "ISO/IEC 42001", "ISO 9001:2015". (The `reference` arg is also accepted.)' },
      },
      required: [],
    },
  },
  {
    name: 'compliance_catalog',
    description:
      'Curated catalogue of the compliance-relevant ISO standards (ISMS/27000, privacy, AI/42000, quality, continuity, risk) → ISO number, family and summary. Static name→number resolver; pass a number to get_standard for the live record.',
    inputSchema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Optional filter on number/name/summary/family.' } },
    },
  },
  {
    name: 'open_data_files',
    description:
      'URLs for the ISO Open Data bulk files (deliverables metadata, ICS classification, technical committees), ODC-By 1.0. The deliverables file is what backs this pack. Use to ingest the full dataset yourself.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

/* ---------- helpers ---------- */

const SELECT = 'id,reference,ref_number,title_en,deliverable_type,supplement_type,edition,publication_date,ics_code,owner_committee,stage_code,status,replaces,replaced_by,scope_en';

async function pg(cfg: SupabaseConfig, query: string): Promise<IsoRow[]> {
  const res = await fetch(`${cfg.url}/rest/v1/iso_standards?${query}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`ISO DB: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json() as Promise<IsoRow[]>;
}

function normNumber(input: string): string | null {
  const cleaned = String(input ?? '')
    .replace(/iso|\/?iec|\/?ts|\/?tr|\/?pas/gi, ' ')
    .replace(/:\s*\d{4}.*$/, '')
    .trim();
  const m = cleaned.match(/(\d{2,5}(?:-\d+)?)/);
  return m ? m[1] : null;
}

function pageUrl(id: number): string {
  return `${SITE}/standard/${id}.html`;
}

function snippet(s: string | null, n = 300): string | null {
  if (!s) return null;
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

function shape(r: IsoRow) {
  return {
    reference: r.reference,
    title: r.title_en,
    status: r.status,
    edition: r.edition,
    published: r.publication_date,
    deliverable_type: r.deliverable_type,
    ics_code: r.ics_code,
    committee: r.owner_committee,
    landing_url: pageUrl(r.id),
  };
}

/** Best-effort live price from the (now correct) iso.org page. Never throws. */
async function fetchPrice(id: number): Promise<{ amount: string; currency: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(pageUrl(id), { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    const price = html.match(/itemprop="price"[^>]*>\s*([\d.,]+)/i)?.[1] || html.match(/itemprop="price"[^>]*content="([^"]+)"/i)?.[1];
    const currency = html.match(/itemprop="priceCurrency"[^>]*content="([^"]+)"/i)?.[1] || 'CHF';
    return price ? { amount: price, currency } : null;
  } catch {
    return null;
  }
}

/* ---------- dispatch ---------- */

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Static tools — no DB needed.
  if (name === 'open_data_files') return OPEN_DATA;
  if (name === 'compliance_catalog') {
    const q = String(args.query ?? '').trim().toLowerCase();
    const rows = q ? CATALOG.filter((e) => (e.number + ' ' + e.name + ' ' + e.summary + ' ' + e.family).toLowerCase().includes(q)) : CATALOG;
    return {
      count: rows.length,
      standards: rows.map((e) => ({ ...e })),
      note: 'Pass a number to get_standard for the live record (status, abstract, price, iso.org link).',
    };
  }

  // DB-backed tools.
  const cfg: SupabaseConfig = { url: String(args._supabaseUrl ?? '').trim(), key: String(args._supabaseKey ?? '').trim() };
  if (!cfg.url || !cfg.key) throw new Error('ISO pack requires platform Supabase credentials (operator-configured).');

  switch (name) {
    case 'search_standards': {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('query is required.');
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const parts = [`search_tsv=plfts.${encodeURIComponent(query.split(/\s+/).join(' & '))}`];
      if (args.committee) parts.push(`owner_committee=ilike.*${encodeURIComponent(String(args.committee).trim())}*`);
      if (args.ics) parts.push(`ics_code=ilike.${encodeURIComponent(String(args.ics).trim())}*`);
      if (args.type) parts.push(`deliverable_type=eq.${encodeURIComponent(String(args.type).trim())}`);
      if (args.status) parts.push(`status=ilike.${encodeURIComponent(String(args.status).trim())}*`);
      parts.push(`select=${SELECT}`, 'order=status.asc,edition.desc', `limit=${limit}`);
      const rows = await pg(cfg, parts.join('&'));
      return {
        query,
        count: rows.length,
        results: rows.map((r) => ({ ...shape(r), abstract: snippet(r.scope_en) })),
        note: rows.length === 0 ? 'No matches (or the iso_standards mirror is not yet populated).' : undefined,
      };
    }

    case 'get_standard': {
      // The tool's own description says "by number or reference", and search
      // results / agents naturally pass `reference` — accept it (and other
      // obvious aliases) so the reliable lookup doesn't silently miss.
      const raw = String(
        args.number ?? args.reference ?? args.ref ?? args.standard ?? args.id ?? args.query ?? '',
      ).trim();
      const num = normNumber(raw);
      // Try exact reference first, then by normalized number (prefer Published, latest edition).
      let rows = await pg(cfg, `reference=eq.${encodeURIComponent(raw)}&select=${SELECT}&limit=5`);
      if (rows.length === 0 && num) rows = await pg(cfg, `ref_number=eq.${encodeURIComponent(num)}&select=${SELECT}&order=edition.desc&limit=20`);
      if (rows.length === 0) {
        return { number: num ?? raw, found: false, note: 'No such ISO standard in the catalogue mirror. Try search_standards, or compliance_catalog for common names.' };
      }
      // Prefer the base standard (no Amd/Cor supplement), Published, newest edition.
      const score = (r: IsoRow) => (r.supplement_type ? 0 : 4) + (r.status === 'Published' ? 2 : 0) + (r.edition ?? 0) / 100;
      const best = [...rows].sort((a, b) => score(b) - score(a))[0];
      // Resolve supersession references (each field is a comma list of ids) + price.
      const supIds = [...new Set((best.replaces ?? '').split(',').concat((best.replaced_by ?? '').split(',')).map((s) => s.trim()).filter(Boolean))];
      const [supRows, price] = await Promise.all([
        supIds.length ? pg(cfg, `id=in.(${supIds.join(',')})&select=id,reference`) : Promise.resolve([] as IsoRow[]),
        fetchPrice(best.id),
      ]);
      const refsOf = (csv: string | null) =>
        !csv ? null : csv.split(',').map((s) => s.trim()).filter(Boolean).map((id) => supRows.find((s) => String(s.id) === id)?.reference ?? `id:${id}`);
      const others = rows.filter((r) => r.id !== best.id).map((r) => ({ reference: r.reference, status: r.status, landing_url: pageUrl(r.id) }));
      return {
        ...shape(best),
        abstract: best.scope_en,
        replaces: refsOf(best.replaces),
        replaced_by: refsOf(best.replaced_by),
        price,
        buy_url: `${SITE}/store.html`,
        other_editions: others.length ? others : undefined,
        note: 'Metadata + abstract from ISO Open Data (ODC-By 1.0). Normative clause text is paywalled — price is for the official PDF/paper.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
