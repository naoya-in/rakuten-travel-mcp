# Secure MCP Tunnel deployment

The MCP remains a stdio server. OpenAI's tunnel-client launches it as a child process and forwards requests over an outbound connection; no public HTTP endpoint is required.

Use the current official setup guide and latest public release:

- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://github.com/openai/tunnel-client/releases/latest

## Host preparation

Install Node.js >=22 and the official tunnel-client on the host, then clone this repository to `/opt/rakuten-travel-mcp` and run `npm ci` and `npm run check` with that Node.js version. When other applications depend on an older Node.js, install the new runtime separately and use its absolute executable path.

Check the actual CLI before configuring:

```sh
tunnel-client help quickstart
tunnel-client init --help
```

Create a tunnel in OpenAI Platform and associate it with the target ChatGPT workspace. The runtime API key requires Tunnels Read + Use. An admin key is not a substitute for the runtime key.

Configure the stdio profile, replacing the tunnel ID and Node.js executable path:

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile rakuten-travel \
  --tunnel-id tunnel_REPLACE_WITH_YOUR_ID \
  --mcp-command "/absolute/path/to/node /opt/rakuten-travel-mcp/dist/index.js" \
  --health-listen-addr 127.0.0.1:8778
```

## Start on systemd

Use `rakuten-travel-tunnel.service.example` as a template. Set the four Rakuten environment values and the OpenAI runtime key in the service's `Environment` settings. Do not commit a service file containing real keys; `*.local.service` is ignored. The example runs under the system service's default root account and explicitly selects `/root/.config/tunnel-client/rakuten-travel.yaml`. Adjust the account and configuration path together if using another account. This setup uses the service startup settings rather than a separate credential file.

After installing the configured service at `/etc/systemd/system/rakuten-travel-tunnel.service`:

```sh
systemd-analyze verify /etc/systemd/system/rakuten-travel-tunnel.service
systemctl daemon-reload
systemctl enable --now rakuten-travel-tunnel.service
systemctl is-active rakuten-travel-tunnel.service
curl -fsS http://127.0.0.1:8778/healthz
curl -fsS http://127.0.0.1:8778/readyz
```

Keep the service running for ChatGPT discovery and tool calls. In ChatGPT's custom MCP server connection settings, choose Tunnel and select the same tunnel ID. Confirm at least one real tool call before calling the ChatGPT setup complete.

The health/admin UI is on the host's loopback interface. It can be reached through a normal SSH local port forward when needed. Never paste full service settings or environment dumps into issue reports because they contain credentials.
