// WebMCP registration. Supports the spec's document.modelContext and the earlier
// navigator.modelContext. Tools are unregistered through their AbortController and, where
// the implementation offers it, unregisterTool as well. Registrations in flight are
// tracked so a tool removed before its registration resolves is aborted on arrival.
export function getModelContext() {
  if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
  return null;
}

export function createRegistry(mc) {
  const active = new Map();   // name -> { controller, descriptor }
  const pending = new Map();  // name -> { cancelled: boolean }
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn([...active.keys()]));

  function wrap(descriptor) {
    return {
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema ?? { type: "object", properties: {}, additionalProperties: false },
      annotations: descriptor.annotations ?? {},
      async execute(args) {
        try {
          const result = await descriptor.execute(args ?? {});
          return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
        } catch (e) {
          const err = { status: "indeterminate", error: String(e?.message ?? e), tool: descriptor.name };
          return { content: [{ type: "text", text: JSON.stringify(err) }], structuredContent: err, isError: true };
        }
      },
    };
  }

  function drop(name, controller) {
    controller.abort();
    if (typeof mc?.unregisterTool === "function") {
      try { mc.unregisterTool(name); } catch { /* AbortSignal already did the work */ }
    }
  }

  async function register(descriptor) {
    if (!mc) return false;
    if (active.has(descriptor.name) || pending.has(descriptor.name)) return true;
    const ticket = { cancelled: false };
    pending.set(descriptor.name, ticket);
    const controller = new AbortController();
    const wrapped = wrap(descriptor);
    try {
      await mc.registerTool(wrapped, { signal: controller.signal });
    } catch (e) {
      pending.delete(descriptor.name);
      console.warn("openpivot: registerTool failed", descriptor.name, e);
      return false;
    }
    pending.delete(descriptor.name);
    if (ticket.cancelled) { drop(descriptor.name, controller); return false; }
    active.set(descriptor.name, { controller, descriptor: wrapped });
    notify();
    return true;
  }

  function unregister(name) {
    const ticket = pending.get(name);
    if (ticket) ticket.cancelled = true;
    const entry = active.get(name);
    if (!entry) return;
    drop(name, entry.controller);
    active.delete(name);
    notify();
  }

  return {
    register,
    unregister,
    has: (name) => active.has(name) || (pending.has(name) && !pending.get(name).cancelled),
    names: () => [...active.keys()],
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
