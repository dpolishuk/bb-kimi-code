// Quota gate off for every test by default: the live suites drive real turns
// through host.js and must not depend on (or spend) the signed-in account's
// usage windows. kimi-live.quota-gate.test.ts re-enables the gate explicitly
// with an injected usage reader.
process.env.BB_KIMI_QUOTA_GATE ||= "0";
