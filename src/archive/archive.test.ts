import { mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectArchive } from "./gc.ts";
import {
  LocalResultArchive,
  MAX_ARCHIVE_ENTRY_BYTES,
  assertWithinArchiveEntryLimit,
} from "./local.ts";
import { contentRef } from "./hash.ts";
import { DEFAULTS } from "../config.ts";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    await rm(root, { recursive: true, force: true });
  }
});

async function tempArchive(): Promise<LocalResultArchive> {
  const root = await mkdtemp(join(tmpdir(), "jev-archive-"));
  roots.push(root);
  return new LocalResultArchive(root);
}

describe("assertWithinArchiveEntryLimit", () => {
  it("rejects sizes above MAX_ARCHIVE_ENTRY_BYTES", () => {
    expect(() =>
      assertWithinArchiveEntryLimit(MAX_ARCHIVE_ENTRY_BYTES + 1),
    ).toThrow(/exceeds the .*byte limit/);
  });

  it("allows sizes at the limit", () => {
    expect(() =>
      assertWithinArchiveEntryLimit(MAX_ARCHIVE_ENTRY_BYTES),
    ).not.toThrow();
  });
});

describe("LocalResultArchive.put", () => {
  it("stores and returns a small entry", async () => {
    const archive = await tempArchive();
    const content = [{ type: "text", text: "hello" }] as const;
    const ref = await archive.put({
      version: 1,
      createdAt: new Date().toISOString(),
      callId: "c1",
      toolName: "bash",
      content,
      contentHash: contentRef(content),
      charCount: 5,
    });
    const got = await archive.get(ref);
    expect(got?.contentHash).toBe(ref);
    expect(got?.charCount).toBe(5);
  });
});

describe("collectArchive", () => {
  it("deletes oldest entries when over maxBytes", async () => {
    const archive = await tempArchive();
    const now = Date.now();
    for (const [i, text] of ["aaa", "bbbb", "ccccc"].entries()) {
      const content = [{ type: "text", text }] as const;
      const ref = contentRef(content);
      const path = join(archive.root, `sha256-${ref.slice("sha256:".length)}.json`);
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          createdAt: new Date(now - (3 - i) * 60_000).toISOString(),
          callId: `c${i}`,
          toolName: "bash",
          content,
          contentHash: ref,
          charCount: text.length,
        }),
        "utf8",
      );
      // Ensure oldest-first ordering via mtime.
      await utimes(path, new Date(now - (3 - i) * 60_000), new Date(now - (3 - i) * 60_000));
    }

    const listed = await archive.list();
    expect(listed.length).toBe(3);
    const total = listed.reduce((sum, e) => sum + e.bytes, 0);
    const report = await collectArchive(archive, {
      ...DEFAULTS,
      archive: {
        ...DEFAULTS.archive,
        retentionDays: 0,
        maxBytes: Math.floor(total * 0.5),
      },
    });
    expect(report.deleted).toBeGreaterThanOrEqual(1);
    expect(report.bytesFreed).toBeGreaterThan(0);
    const remaining = await archive.list();
    expect(remaining.length).toBeLessThan(3);
  });

  it("keeps everything when both limits are zero", async () => {
    const archive = await tempArchive();
    const content = [{ type: "text", text: "keep" }] as const;
    await archive.put({
      version: 1,
      createdAt: new Date().toISOString(),
      callId: "c1",
      toolName: "bash",
      content,
      contentHash: contentRef(content),
      charCount: 4,
    });
    const report = await collectArchive(archive, {
      ...DEFAULTS,
      archive: { ...DEFAULTS.archive, retentionDays: 0, maxBytes: 0 },
    });
    expect(report).toEqual({
      deleted: 0,
      bytesFreed: 0,
      kept: 0,
      errors: 0,
    });
    expect((await archive.list()).length).toBe(1);
  });
});
