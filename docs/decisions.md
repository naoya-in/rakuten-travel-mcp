# Implementation record

- Project: rakuten-travel-mcp.
- Work: a local stdio MCP server covering all seven public Rakuten Travel APIs.
- Confirmed: 2026-10-25 (Asia/Tokyo), user supplied credentials and requested comprehensive implementation after the initial proposal.
- Skills: antislop core inspected; its visual design workflow does not apply to this backend. No additional skills installed or enabled. frontend-design, security-audit and consulting-pptx-skill are not enabled. Japanese documentation is part of implementation, not a separate prose generation request.
- Common rules at implementation start: the authenticated GitHub connector retrieved AgentRules/common.md from naoya-in/obsidian at the default branch and at c1e3aa93ac2b66cdb14546f2a87a0ce75c051511. Both had blob SHA 568c3c8453b3394701edbbb84d054bc844c8b1c7 and version 2026-10-11.5, matching the then-applied rules. No common-rule update was required at that point.
- The official API list has seven Travel APIs. Each uses its documented version. API wrappers expose every service-specific parameter and the applicable shared data/affiliate options. JSON is fixed for MCP; XML/JSONP/callback are deliberately excluded. Authentication comes from server configuration.
- Defaults deliberately differ from the underlying API for formatVersion (2) and datumType (1, WGS84 degrees). Other values follow the API by omission.
- Native fetch, official MCP TypeScript SDK v1, Zod input schemas, Node.js >=22. No website or remote HTTP transport in this initial implementation.
- API responses are preserved as JSON rather than reduced to a subset of hotel fields. Paging is explicit. No automatic retries or persistent caching. Requests are serialized and spaced at least 1000 ms apart by default to avoid bursts; this is an implementation default, not a claimed Rakuten quota.
- Provided credentials are stored only in ignored .env. No remote was configured and no push is authorized.
- Registered website confirmed by the user: https://util.uwd.jp. Sending Referer alone failed in the live gateway; Origin derived from the same URL succeeded. Both are now sent when RAKUTEN_REFERER is set.
- At handoff on 2026-10-25, the user supplied replacement common rules (source SHA-256 32764f310fe5d64f7b228017fab5111faf2304eb6d9f4f73742de88d83e1e332) clarifying that workplace restrictions apply only when the machine's role is confirmed. Those instructions supersede the earlier user-provided rules. No machine-role inference or push was performed; the local-only delivery is unchanged.
