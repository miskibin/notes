import { expect, it, vi } from "vitest";
import { createSaveQueue } from "./save-queue";

it("an older autosave completes before a newer save starts", async () => {
  const enqueue = createSaveQueue();
  let finish!: () => void;
  const order: string[] = [];
  const old = enqueue(() => new Promise<void>((resolve) => {
    order.push("old started");
    finish = () => { order.push("old finished"); resolve(); };
  }));
  const latest = enqueue(async () => { order.push("latest"); });
  expect(enqueue.isPending()).toBe(true);
  await vi.waitFor(() => expect(order).toEqual(["old started"]));
  finish();
  await Promise.all([old, latest]);
  expect(order).toEqual(["old started", "old finished", "latest"]);
  expect(enqueue.isPending()).toBe(false);
});

it("a failed save is reported and does not prevent a retry", async () => {
  const enqueue = createSaveQueue();
  await expect(enqueue(async () => { throw new Error("disk full"); })).rejects.toThrow("disk full");
  const write = vi.fn().mockResolvedValue(undefined);
  await enqueue(write);
  expect(write).toHaveBeenCalledOnce();
});
