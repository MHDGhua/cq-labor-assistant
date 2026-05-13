#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const adminToken = (process.env.SMOKE_ADMIN_TOKEN ?? "dev-admin-token").trim();
const session = `cq-law-manage-smoke-${process.pid}-${Date.now()}`;
const isWindows = process.platform === "win32";
const importedTitle = `管理页烟雾测试案例-${Date.now()}`;
const importedCaseCsv = [
  "title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags",
  `${importedTitle},wage_arrears,重庆市,2024,用于验证管理页浏览器烟雾测试的案例,先核对工资流水和考勤,https://example.com/smoke,烟雾测试来源,欠薪|证据`
].join("\n");

if (!adminToken) {
  throw new Error("SMOKE_ADMIN_TOKEN cannot be empty.");
}

function runPlaywright(args) {
  const result = spawnSync(
    isWindows ? "cmd.exe" : "npx",
    isWindows
      ? ["/c", "npx", "--yes", "--package", "@playwright/cli", "playwright-cli", "--session", session, ...args]
      : ["--yes", "--package", "@playwright/cli", "playwright-cli", "--session", session, ...args],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      windowsHide: true
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const installHint =
      output.includes("Executable doesn't exist") || output.includes("install-browser")
        ? "\nHint: run `npx --yes --package @playwright/cli playwright-cli install-browser chromium` once."
        : "";
    throw new Error(
      `playwright-cli ${args.join(" ")} failed with exit code ${result.status}.\n${output}${installHint}`
    );
  }

  return result.stdout;
}

async function fetchJson(pathname) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      headers: { "x-admin-token": adminToken }
    });
  } catch (error) {
    throw new Error(
      `Cannot reach ${baseUrl}. Start the frontend first, for example: ` +
        `$env:ADMIN_TOKEN="${adminToken}"; $env:BACKEND_URL="http://127.0.0.1:8999"; npm run dev`
    );
  }

  if (response.status === 503) {
    throw new Error("The frontend server is missing ADMIN_TOKEN. Restart it with ADMIN_TOKEN set.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("SMOKE_ADMIN_TOKEN does not match the frontend server ADMIN_TOKEN.");
  }

  if (!response.ok) {
    throw new Error(`Preflight ${pathname} failed with HTTP ${response.status}.`);
  }

  return response.json();
}

async function preflight() {
  const [casePayload, docPayload, historyPayload] = await Promise.all([
    fetchJson("/api/cases"),
    fetchJson("/api/knowledge-docs"),
    fetchJson("/api/history?limit=5")
  ]);

  if (casePayload.source !== "local" || docPayload.source !== "local") {
    throw new Error(
      "This smoke test expects local-cache fallback. Restart the frontend with BACKEND_URL pointing to an unused port, " +
        'for example `$env:BACKEND_URL="http://127.0.0.1:8999"`.'
    );
  }

  if (historyPayload.source !== "unavailable") {
    throw new Error("This smoke test expects history to expose an explicit unavailable source when backend is down.");
  }
}

function browserScript() {
  return `
const baseUrl = ${JSON.stringify(baseUrl)};
const adminToken = ${JSON.stringify(adminToken)};
const importedTitle = ${JSON.stringify(importedTitle)};
const importedCaseCsv = ${JSON.stringify(importedCaseCsv)};

async function getBodyText() {
  return page.locator("body").innerText();
}

async function expectBodyIncludes(expected, timeout = 15000) {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    expected,
    { timeout }
  );
}

async function expectBodyExcludes(unexpected, timeout = 15000) {
  await page.waitForFunction(
    (value) => !document.body.innerText.includes(value),
    unexpected,
    { timeout }
  );
}

await page.goto(baseUrl + "/manage", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#admin-token", { timeout: 15000 });

await page.locator("#admin-token").fill("wrong-token");
await page.getByRole("button", { name: "解锁管理页" }).click();
await expectBodyIncludes("ADMIN_TOKEN 无效或已过期，请重新输入。");
let text = await getBodyText();
if (!text.includes("等待 ADMIN_TOKEN")) {
  throw new Error("Manage page unlocked with an invalid token.");
}

await page.locator("#admin-token").fill(adminToken);
await page.getByRole("button", { name: "解锁管理页" }).click();
await expectBodyIncludes("后端暂不可用，已切换到本地素材缓存。");
await expectBodyIncludes("历史服务暂不可用");
text = await getBodyText();
if (!text.includes("已解锁 · 本地回退")) {
  throw new Error("Manage page did not expose the local fallback state.");
}

await page.getByRole("button", { name: "案例素材" }).click();
await page.locator("#draft").fill(importedCaseCsv);
await page.getByRole("button", { name: "导入案例" }).click();
await expectBodyIncludes("已从 文本 导入 1 条案例到本地缓存。").catch(async () => {
  await expectBodyIncludes("已从文本导入 1 条案例到本地缓存。");
});
await expectBodyIncludes(importedTitle);

await page.locator("#query").fill(importedTitle);
await expectBodyIncludes(importedTitle);
await page.getByRole("button", { name: "删除" }).click();
await expectBodyExcludes(importedTitle);
`;
}

async function main() {
  await preflight();

  let opened = false;
  try {
    runPlaywright(["open", `${baseUrl}/manage`]);
    opened = true;
    runPlaywright(["run-code", browserScript()]);
    console.log("manage smoke passed");
  } finally {
    if (opened) {
      try {
        runPlaywright(["close"]);
      } catch {
        // The smoke test has already finished; a close failure should not mask the real result.
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
