// VN-DAT-007: tests never touch the network. Any test that reaches the global fetch fails loudly; code under test
// takes an injected fetch instead (tools/ephem/client.ts).
globalThis.fetch = (() => {
  throw new Error("network access in tests is forbidden (VN-DAT-007): inject a fetch instead");
}) as typeof fetch;
