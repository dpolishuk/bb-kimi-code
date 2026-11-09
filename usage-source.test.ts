import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import { expect, it, vi } from "vitest";

import kimiPlugin from "./server.js";
import {
  usageFetchMethod,
  usageListMethod,
  usageMeasurementSchema,
  usageResourceListSchema,
} from "./src/usage-contract.js";

it("publishes Kimi usage resources and maps bridge quota windows for the panel", async () => {
  const collect = vi.fn(async () => ({
    "kimi-code": {
      status: "ok" as const,
      accountEmail: null,
      planLabel: "Kimi Code",
      windows: [
        {
          label: "5h limit",
          usedPercent: 12.5,
          resetsAt: "2026-11-10T00:00:00.000Z",
        },
        { label: "Weekly limit", usedPercent: 30, resetsAt: null },
        {
          label: "Booster wallet",
          usedPercent: 25,
          resetsAt: null,
          cost: { usedUsdCents: 250, limitUsdCents: 1000 },
        },
      ],
    },
  }));
  let removed = false;
  const { bb, harness } = createFakePluginHost({
    pluginId: "kimi-code",
    sdk: {
      hosts: {
        list: async () => [
          makeHostResponse({ id: "online", name: "Online Mac", status: "connected" }),
          makeHostResponse({ id: "offline", name: "Offline Mac", status: "disconnected" }),
        ],
        get: async ({ hostId }) => {
          if (hostId === "missing") {
            throw Object.assign(new Error("Host not found"), { status: 404 });
          }
          return makeHostResponse({
            id: hostId,
            status: hostId === "offline" ? "disconnected" : "connected",
          });
        },
      },
      providers: {
        list: async () =>
          removed
            ? []
            : [
                { id: "foreign", displayName: "Foreign", pluginId: "unrelated" },
                { id: "kimi-code", displayName: "Kimi Code", pluginId: "kimi-code" },
              ],
      },
      system: { usageLimits: collect },
    },
  });
  try {
    kimiPlugin(bb);
    const list = async () =>
      usageResourceListSchema.parse(
        await harness.behavior.callRpc(usageListMethod, {}),
      );
    const read = async (host: string, provider = "kimi-code", refresh = false) =>
      usageMeasurementSchema.parse(
        await harness.behavior.callRpc(usageFetchMethod, {
          resourceId: JSON.stringify([host, provider]),
          refresh,
        }),
      );

    expect((await list()).resources).toEqual([
      {
        accountKey: null,
        id: JSON.stringify(["online", "kimi-code"]),
        providerId: "kimi-code",
        label: "Kimi Code",
        scope: { kind: "host", hostId: "online", hostName: "Online Mac" },
      },
      {
        accountKey: null,
        id: JSON.stringify(["offline", "kimi-code"]),
        providerId: "kimi-code",
        label: "Kimi Code",
        scope: { kind: "host", hostId: "offline", hostName: "Offline Mac" },
      },
    ]);
    expect(harness.registrations.experimental_publishedRpcMethods.map((entry) => entry.method)).toEqual(
      expect.arrayContaining([usageListMethod, usageFetchMethod]),
    );
    expect(collect).not.toHaveBeenCalled();

    const first = await read("online");
    expect(first).toMatchObject({
      accountKey: null,
      usage: {
        status: "ok",
        plan: null,
        planLabel: "Kimi Code",
        windows: [
          { kind: "five-hour", id: "0:5h limit", model: null, cost: null },
          { kind: "weekly", id: "1:Weekly limit", model: null, cost: null },
          {
            kind: "custom",
            id: "2:Booster wallet",
            cost: { usedUsdCents: 250, limitUsdCents: 1000 },
          },
        ],
      },
    });
    expect(first.observedAt).not.toBeNull();
    expect(collect).toHaveBeenCalledWith({
      hostId: "online",
      providerId: "kimi-code",
      refresh: false,
    });

    await read("online");
    expect(collect).toHaveBeenCalledTimes(1);
    await read("online", "kimi-code", true);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ refresh: true }),
    );

    collect.mockImplementation(async () => ({
      "kimi-code": {
        status: "ok" as const,
        accountEmail: null,
        planLabel: "Kimi Code",
        windows: [
          { label: "5h limit", usedPercent: 10, resetsAt: null },
          {
            label: "Booster wallet",
            usedPercent: 0,
            resetsAt: null,
            cost: { usedUsdCents: 0, limitUsdCents: 0 },
          },
        ],
      },
    }));
    expect(await read("online", "kimi-code", true)).toMatchObject({
      usage: {
        status: "ok",
        windows: [
          { label: "5h limit", kind: "five-hour" },
          { label: "Booster wallet", cost: null },
        ],
      },
    });

    expect(await read("offline")).toMatchObject({
      observedAt: null,
      usage: { status: "error", message: "Machine is disconnected." },
    });
    expect(collect).toHaveBeenCalledTimes(3);
    await expect(read("missing")).rejects.toThrow("Usage resource no longer exists.");
    await expect(read("online", "foreign")).rejects.toThrow("no longer exists");
    await expect(
      harness.behavior.callRpc(usageFetchMethod, {
        resourceId: "not-json",
        refresh: false,
      }),
    ).rejects.toThrow();

    removed = true;
    expect((await list()).resources).toEqual([]);
    await expect(read("online")).rejects.toThrow("no longer exists");
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("passes through authentication states and hides collection failures", async () => {
  const collect = vi.fn(async () => ({
    "kimi-code": { status: "unauthenticated" as const },
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "kimi-code",
    sdk: {
      hosts: {
        list: async () => [makeHostResponse({ id: "host", status: "connected" })],
        get: async ({ hostId }) => makeHostResponse({ id: hostId, status: "connected" }),
      },
      providers: {
        list: async () => [
          { id: "kimi-code", displayName: "Kimi Code", pluginId: "kimi-code" },
        ],
      },
      system: { usageLimits: collect },
    },
  });
  try {
    kimiPlugin(bb);
    const input = {
      resourceId: JSON.stringify(["host", "kimi-code"]),
      refresh: false,
    };
    const unauthenticated = usageMeasurementSchema.parse(
      await harness.behavior.callRpc(usageFetchMethod, input),
    );
    expect(unauthenticated).toEqual({
      accountKey: null,
      observedAt: null,
      usage: {
        status: "unauthenticated",
        accountEmail: null,
        plan: null,
        planLabel: null,
      },
    });

    collect.mockImplementation(async () => {
      throw new Error("private-network-canary");
    });
    const failed = await harness.behavior.callRpc(usageFetchMethod, {
      ...input,
      refresh: true,
    });
    expect(failed).toMatchObject({
      usage: {
        status: "error",
        message: "Usage could not be collected from this machine.",
      },
    });
    expect(JSON.stringify(failed)).not.toContain("private-network-canary");
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("coalesces concurrent reads and makes a forced refresh collect again", async () => {
  let finish: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const collect = vi.fn(async () => {
    await gate;
    return {
      "kimi-code": {
        status: "ok" as const,
        accountEmail: null,
        planLabel: null,
        windows: [],
      },
    };
  });
  const { bb, harness } = createFakePluginHost({
    pluginId: "kimi-code",
    sdk: {
      hosts: {
        list: async () => [makeHostResponse({ id: "host", status: "connected" })],
        get: async ({ hostId }) => makeHostResponse({ id: hostId, status: "connected" }),
      },
      providers: {
        list: async () => [
          { id: "kimi-code", displayName: "Kimi Code", pluginId: "kimi-code" },
        ],
      },
      system: { usageLimits: collect },
    },
  });
  try {
    kimiPlugin(bb);
    const read = (refresh: boolean) =>
      harness.behavior.callRpc(usageFetchMethod, {
        resourceId: JSON.stringify(["host", "kimi-code"]),
        refresh,
      });
    const first = read(false);
    const second = read(false);
    const forced = read(true);
    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    finish!();
    await Promise.all([first, second, forced]);
    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ refresh: true }),
    );
  } finally {
    finish?.();
    await harness.lifecycle.dispose();
  }
});
