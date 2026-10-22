import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/index";
import { DatabaseInUseError, lockDataDir, pgliteDataDir, resolveLocalPath } from "../src/local";

const created: string[] = [];

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDataDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rwt-local-"));
  created.push(root);
  return path.join(root, "db");
}

/** PID of a process that has already ended. */
function endedPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", ""]);
    child.on("error", reject);
    child.on("exit", () => resolve(child.pid ?? 0));
  });
}

describe("resolveLocalPath", () => {
  it("puts ~/ paths into the home folder", () => {
    expect(resolveLocalPath("~/.read-watch-tracker/db")).toBe(path.join(homedir(), ".read-watch-tracker", "db"));
  });

  it("resolves other paths against the working directory", () => {
    expect(resolveLocalPath("./.data/dev")).toBe(path.resolve(".data", "dev"));
  });
});

describe("pgliteDataDir", () => {
  it("is null for an in-memory database", () => {
    expect(pgliteDataDir("pglite:memory")).toBeNull();
    expect(pgliteDataDir("pglite:")).toBeNull();
  });

  it("is the absolute data directory otherwise", () => {
    expect(pgliteDataDir("pglite:~/tracker/db")).toBe(path.join(homedir(), "tracker", "db"));
  });
});

describe("lockDataDir", () => {
  it("lets only one handle open a data directory at a time", async () => {
    const dataDir = await tempDataDir();
    const first = await createDb(`pglite:${dataDir}`);
    await expect(createDb(`pglite:${dataDir}`)).rejects.toThrow(DatabaseInUseError);
    await first.close();

    const second = await createDb(`pglite:${dataDir}`);
    await second.close();
    expect(existsSync(`${dataDir}.lock`)).toBe(false);
  });

  it("names the process that holds the lock", async () => {
    const dataDir = await tempDataDir();
    const release = await lockDataDir(dataDir);
    await expect(lockDataDir(dataDir)).rejects.toThrow(`Prozess ${process.pid}`);
    await release();
  });

  it("takes over a lock whose process has ended", async () => {
    const dataDir = await tempDataDir();
    await writeFile(`${dataDir}.lock`, String(await endedPid()));

    const release = await lockDataDir(dataDir);
    expect(await readFile(`${dataDir}.lock`, "utf8")).toBe(String(process.pid));
    await release();
  });

  it("takes over an empty lock file", async () => {
    const dataDir = await tempDataDir();
    await writeFile(`${dataDir}.lock`, "");

    const release = await lockDataDir(dataDir);
    await release();
    expect(existsSync(`${dataDir}.lock`)).toBe(false);
  });
});
