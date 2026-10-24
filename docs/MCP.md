# Talking to LifeOS from Gemini (or any MCP client)

LifeOS exposes the same tools its chat uses as a **remote MCP server** at `https://<your-app>/api/mcp`.
Anything you can ask the in-app chat ("what are my top three today?", "add a task call the vendor under
Website", "complete the login task", "how many days behind is Launch MVP?") works from any MCP client.

It is protected by a secret key. Anyone who has the key can read and change your LifeOS data, so treat it
like a password and never paste it into a chat.

## 1. Create the key and deploy

```bash
openssl rand -hex 32
```

Put the output in Vercel as `MCP_API_KEY` (Settings → Environment Variables, Production), then redeploy.
It must be at least 32 characters.

## 2. Gemini CLI

Install Gemini CLI, then add this to `~/.gemini/settings.json` (or `.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "lifeos": {
      "httpUrl": "https://YOUR-APP.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer $LIFEOS_MCP_KEY" },
      "timeout": 30000
    }
  }
}
```

Keep the key out of the file by exporting it in your shell profile:

```bash
export LIFEOS_MCP_KEY="paste-the-key-here"
```

Restart Gemini CLI and run `/mcp`; `lifeos` should show as connected with its tools. Then just ask.

## 3. Other clients

Any client that supports a remote (Streamable HTTP) MCP server with a bearer header works, for example
Claude's custom connectors or the Gemini API's MCP support. The server is stateless and returns JSON.

## What it can and cannot do

- Same tools, undo log and safety rules as the in-app chat. Deleting a goal or project needs `confirm: true`,
  which the assistant should only send after you say yes.
- Every change is recorded in `agent_actions`, so "undo" works from either place.
- It does not edit calendar events directly (use the dashboard calendar).
- 120 requests per minute per server instance.
