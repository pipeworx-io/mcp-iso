# mcp-iso

ISO Standards MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_standards` | Search the full ISO catalogue (~all deliverables) by keyword across reference, title and abstract, with optional filters. Returns reference, title, status, abstract snippet, committee and the iso.org link. Use to find standards on a topic ("supply chain security", "medical device risk"). |
| `get_standard` | Full record for one ISO standard by number ("27001") or reference ("ISO/IEC 27001:2022"): title, abstract, status, edition, publication date, ICS, committee, the supersession chain, the correct iso.org page, and a best-effort live price. The reliable lookup (resolves any standard via its catalogue id). |
| `compliance_catalog` | Curated catalogue of the compliance-relevant ISO standards (ISMS/27000, privacy, AI/42000, quality, continuity, risk) → ISO number, family and summary. Static name→number resolver; pass a number to get_standard for the live record. |
| `open_data_files` | URLs for the ISO Open Data bulk files (deliverables metadata, ICS classification, technical committees), ODC-By 1.0. The deliverables file is what backs this pack. Use to ingest the full dataset yourself. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "iso": {
      "url": "https://gateway.pipeworx.io/iso/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/iso/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Iso data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
