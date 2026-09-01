import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseRepositoryPage(html) {
  const read = (pattern, label) => {
    const match = html.match(pattern);
    if (!match) throw new Error(`GitHub 页面缺少 ${label}`);
    return match[1];
  };
  return {
    stars: Number(read(/"stargazerCount":(\d+)/, "Stars")),
    forks: Number(read(/"forksCount":(\d+)/, "Forks")),
    archived: read(/"isArchived":(true|false)/, "归档状态") === "true",
    defaultBranch: read(/"defaultBranch":"([^"]+)"/, "默认分支"),
  };
}

export function parseAtomUpdated(atom) {
  return atom.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? null;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "cnmcp-index-metadata-sync" } });
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
  return response.text();
}

export async function syncGitHubMetadata({ projectRoot = PROJECT_ROOT, apply = false } = {}) {
  const resourcesRoot = path.join(projectRoot, "resources");
  const directories = (await readdir(resourcesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const results = [];
  const pendingWrites = [];

  for (const directory of directories) {
    const resourcePath = path.join(resourcesRoot, directory.name, "resource.json");
    const resource = JSON.parse(await readFile(resourcePath, "utf8"));
    const repository = new URL(resource.repository);
    if (repository.hostname !== "github.com") continue;
    const baseUrl = `https://github.com${repository.pathname.replace(/\/$/, "")}`;
    const page = parseRepositoryPage(await fetchText(baseUrl));
    const atomUrl = `${baseUrl}/commits/${encodeURIComponent(page.defaultBranch)}.atom`;
    const pushedAt = parseAtomUpdated(await fetchText(atomUrl));
    const next = {
      ...resource,
      sourceStats: { stars: page.stars, forks: page.forks, pushedAt, archived: page.archived, fetchedAt },
    };
    pendingWrites.push([resourcePath, `${JSON.stringify(next, null, 2)}\n`]);
    results.push({ id: resource.id, ...next.sourceStats });
  }
  if (apply) await Promise.all(pendingWrites.map(([filePath, content]) => writeFile(filePath, content, "utf8")));
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await syncGitHubMetadata({ apply: process.argv.includes("--apply") });
  console.log(`${process.argv.includes("--apply") ? "已更新" : "已读取"} ${results.length} 个 GitHub 仓库元数据。`);
}
