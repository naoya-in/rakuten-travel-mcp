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
- Initial credentials were stored in ignored .env. The follow-up configuration change also puts them in ignored mcp-config.local.json so the client can pass them through env. At that handoff, no remote was configured and no push was authorized.
- Registered website confirmed by the user: https://util.uwd.jp. Sending Referer alone failed in the live gateway; Origin derived from the same URL succeeded. Both are now sent when RAKUTEN_REFERER is set.
- At handoff on 2026-10-25, the user supplied replacement common rules (source SHA-256 32764f310fe5d64f7b228017fab5111faf2304eb6d9f4f73742de88d83e1e332) clarifying that workplace restrictions apply only when the machine's role is confirmed. Those instructions supersede the earlier user-provided rules. No machine-role inference or push was performed; the local-only delivery is unchanged.

## MCP configuration follow-up, 2026-10-25

- User requested the Rakuten values as MCP registration inputs. The existing environment-variable interface is now the default documented configuration, with four explicit env fields in the example and local client settings. Normal server startup no longer reads a project .env implicitly. File loading requires --env-file or RAKUTEN_ENV_FILE; explicitly supplied environment values take precedence.
- Same project/backend configuration scope and previously selected skills: no additional skills enabled or installed. Small change reviewed locally without additional subagents.
- Read the common-rule origin again: GitHub still served blob 568c3c8453b3394701edbbb84d054bc844c8b1c7 with the older workplace wording; the local and latest user-provided rules have newer explicit wording. Preserved the user's/local rules instead of overwriting them with the older remote content.
- Validation: stdio integration checks confirm all four MCP env inputs reach the outbound request and omitting affiliateId does not inherit it from a project .env. The development live-smoke script explicitly loads its local credentials and passes them via MCP env.

## Public GitHub repository, 2026-10-25

- User requested publication as a public GitHub repository. Destination: https://github.com/naoya-in/rakuten-travel-mcp, main branch.
- Reviewed both existing commits for the supplied application ID, access key, affiliate ID and credential patterns; no matches found. Neither .env nor mcp-config.local.json is tracked in either commit.
- No deployment workflows or hosting configuration found. The created repository is public and GitHub Pages is disabled. Publication is a source-code push, with no deployment configured.
- README now includes clone instructions. Local credential files remain ignored.

## Private-host deployment and Secure MCP Tunnel, 2026-10-25

- User requested SSH deployment with the previously supplied Rakuten credentials and official tunnel-client. OpenAI's current Secure MCP Tunnel documentation confirms that a stdio child can be used directly from ChatGPT through a tunnel; no HTTP transport was added to the MCP.
- Used OpenAI Docs for current vendor guidance. No additional skills installed, no security-audit or frontend-design enabled. An independent subagent checked the released tunnel-client's stdio environment inheritance and service configuration. The remote common-rule source still contained older wording, so the latest user-provided rules were retained without editing rule files.
- Kept the existing host runtime intact and installed a separate Node.js 24 runtime for this project. Installed the official tunnel-client release after checksum verification, created a named stdio profile, and prepared a systemd unit using an explicit profile path.
- Per user preference, credentials are passed through service Environment settings rather than a separate access-restricted credential file. Real service settings and host details are local-only ignored artifacts; public templates contain placeholders.
- On the target host, all 21 automated tests, the build, all eight live MCP tool calls and two resource reads passed. The systemd unit passed verification. The tunnel is not enabled or running until the separate OpenAI runtime key is supplied; readiness and end-to-end ChatGPT execution have not yet been verified.

## Tunnel activation, 2026-10-25

- User supplied the OpenAI runtime key. Stored it only in the ignored local service settings and the requested host's service startup settings; no key was added to Git or command arguments.
- Doctor passed. Enabled and started the systemd service. Health and readiness both returned HTTP 200; the CLI health check requiring a successful control-plane poll returned result=ok. The service is active with zero restarts.
- Runtime-key metadata lookup confirmed the configured tunnel exists and includes both a Platform organization and a ChatGPT workspace association. MCP tools were previously verified directly on the host; a request through the ChatGPT connector remains unverified because the available browser session is not signed in to ChatGPT. Server-side tunnel activation is complete; ChatGPT connector registration/testing is the remaining product-side step.
