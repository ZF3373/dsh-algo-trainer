# ICPC Workbench Sidebar and On-demand Harness Activation

## Goal

Turn the current `dsh-algo-trainer` plugin into an ICPC workbench entry inside
DeepSeek Harness:

- Add one compact button to the conversation header.
- Clicking the button opens a right-sidebar tab named `ICPC Workbench`.
- The sidebar exposes the plugin's existing training capabilities as grouped
  feature entries.
- Existing `icpc_*` tools keep their behavior after activation.
- AI chat is owned by Harness. The plugin does not ship a second chat UI.
- Opening the plugin or its sidebar does not expose ICPC tools or ICPC prompt
  material to the Agent.
- A session receives the plugin tools only after the user explicitly activates
  the workbench from that session.

## Scope

This change covers the client presentation layer and the host-side activation
boundary. It does not port the original Express/SQLite application, add a
second AI provider, or duplicate the original workbench pages as full CRUD
screens.

The sidebar lists capabilities already implemented by this plugin:

- AI assistant entry
- Data overview
- Today training
- Training plans
- Review library
- Template library
- Problem browser
- Submission sync
- Manual import
- Data export
- Calendar check-ins
- Contest center
- Settings

The original workbench's list organizer and mastery map are not added in this
change because this plugin has no corresponding tools or data model yet.

## Architecture

### Client

The client half becomes a real Harness UI extension:

1. Inject `slots`, `sidebarRight`, and `sidebarRightTabs`.
2. Register one action in `conversation.session.header.actions`.
3. The action calls `ctx.sidebarRight.openTab('icpc-workbench')`.
4. Register the `icpc-workbench` page kind through `sidebarRightTabs`.
5. Register the page body through the keyed `sidebar.right.pane.tab` slot.
6. Keep the existing settings section as a secondary entry point.

The right-sidebar body contains a compact navigation surface, grouped into:

- Training: AI assistant, overview, today, plans, reviews, templates
- Records and setup: problems, sync, import, export, check-ins, contests,
  settings

The panel uses Harness theme variables and remains usable in light and dark
themes. It does not add another nested card hierarchy.

### Explicit activation

Opening the header button or the sidebar is navigation only. It must not call
the Host activation route.

Activation happens when the user selects either:

- `AI assistant`: activate the current session, collapse the sidebar, and let
  the user type directly into the existing Harness composer.
- Any concrete feature entry: activate the current session, place that
  feature's prompt into the Harness composer, and submit it.

The feature prompt is generated from a pure client-side table. No ICPC prompt
is added to a session before one of these actions occurs.

### Host

The host half no longer registers `icpc_*` tools globally during plugin load.
Instead it builds one reusable registration function:

```ts
registerIcpcTools(host, targetCtx): () => void
```

The function registers the existing tools into the supplied Cordis context and
returns a combined disposer.

The plugin registers an exact HTTP route:

```text
POST /icpc-workbench/activate
```

Request body:

```json
{
  "sessionId": "..."
}
```

The route:

1. Validates the request method, JSON body, and `sessionId`.
2. Resolves the live Agent through `ctx.agents.get(sessionId)`.
3. Rejects the request when the session has no live Agent.
4. Registers the tool set through `agent.ctx`.
5. Records the session as activated so repeated clicks are idempotent.
6. Returns the activated session id and registered tool names.

Registrations are owned by `agent.ctx`. When the Agent is disposed, its scoped
tools unwind automatically. The activation bookkeeping removes that session id
from its set on `agent/disposed`, allowing a later resume with the same id to
activate a fresh Agent scope.

No global `ctx.tools.restrict()` call is used. The default state is absence:
the tools are never registered globally, so they cannot leak into unrelated
sessions.

### Data flow

```text
user clicks feature
  -> client POSTs sessionId to /icpc-workbench/activate
  -> host resolves current Agent
  -> host registers icpc_* tools in agent.ctx
  -> client writes the feature prompt into the Harness composer
  -> client submits the composer
  -> Harness assembles the next step with the scoped ICPC tools
```

The existing JSON store, adapters, analysis functions, and tool handlers remain
the only implementation of training behavior.

## Error Handling

- If activation fails, the client does not submit the feature prompt and shows
  an inline error in the sidebar.
- If the session has no live Agent, the Host returns a 409 response.
- Invalid JSON or a missing `sessionId` returns a 400 response.
- Unsupported methods return 405.
- Concurrent activation requests for the same session are serialized and
  register each tool at most once.
- Missing `inputActions` disables feature submission rather than silently
  discarding the click.
- The AI assistant entry never overwrites or submits an existing draft; it only
  activates the session and collapses the sidebar.

## Testing

Add focused tests for:

- feature metadata: unique ids, expected groups, valid tool prompt mappings;
- activation: missing Agent, invalid session id, successful registration,
  repeated activation, and cleanup on Agent disposal;
- combined disposer: every registered tool is removed exactly once.

Keep the existing pure-function tests. Verify with:

```bash
npm run typecheck
npm run typecheck:client
npm test
npm run build
```

The client build must still end with the `window.__ModuleLoader__.load(...)`
wrapper and must register:

- `conversation.session.header.actions`
- `sidebarRightTabs`
- `sidebar.right.pane.tab`
- the existing `settings.section`

## Acceptance Criteria

- A fresh Harness session sees no `icpc_*` tools and no ICPC system prompt
  material.
- Opening the ICPC sidebar does not activate the tools.
- Clicking `AI assistant` activates only that session and returns the user to
  the normal Harness composer.
- Clicking a concrete feature activates only that session and submits the
  matching prompt.
- Other sessions remain unaffected.
- Existing tool behavior is unchanged after activation.
- The client typecheck, host typecheck, tests, and build pass.
