# mcp-iso

ISO Standards MCP — hosted.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Iso data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
