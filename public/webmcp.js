// WebMCP registration. Supports the spec's document.modelContext and the earlier
// navigator.modelContext. Tools are unregistered through their AbortController, so
// dynamic tools can come and go and the browser fires toolchange.
export function getModelContext() {
  if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
  return null;
}

export function createRegistry(mc) {
  const active = new Map(); // name -> { controller, descriptor }
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn([...active.keys()]));

  async function register(descriptor) {
    if (!mc) return false;
    if (active.has(descriptor.name)) return true;
    const controller = new AbortController();
    const wrapped = {
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
    try {
      await mc.registerTool(wrapped, { signal: controller.signal });
    } catch (e) {
      console.warn("openpivot: registerTool failed", descriptor.name, e);
      return false;
    }
    active.set(descriptor.name, { controller, descriptor: wrapped });
    notify();
    return true;
  }

  function unregister(name) {
    const entry = active.get(name);
    if (!entry) return;
    entry.controller.abort();
    active.delete(name);
    notify();
  }

  return {
    register,
    unregister,
    has: (name) => active.has(name),
    names: () => [...active.keys()],
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
