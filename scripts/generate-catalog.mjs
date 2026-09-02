import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./validate-resources.mjs";
import { computeResourceQualityCore } from "../lib/resource-quality-core.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RESOURCE_KINDS = ["mcp", "skill", "plugin"];

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSearchText(parts) {
  return parts
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resourceCompare(left, right) {
  return (
    right.quality.score - left.quality.score ||
    lexicalCompare(right.quality.pushedAt ?? "", left.quality.pushedAt ?? "") ||
    lexicalCompare(normalizeSearchText([left.name]), normalizeSearchText([right.name])) ||
    lexicalCompare(left.id, right.id)
  );
}

function completenessScore(resource, readme) {
  return Math.min(15,
    (resource.documentation ? 4 : 0) +
    (readme ? 4 : 0) +
    (resource.license && resource.license !== "NOASSERTION" ? 2 : 0) +
    (resource.logo || resource.preview ? 2 : 0) +
    ((resource.compatibility ?? []).some((entry) => entry.note) ? 3 : 0)
  );
}

function orderedObject(entries) {
  return Object.fromEntries(entries.sort(([left], [right]) => lexicalCompare(left, right)));
}

function createIndexes(resources, platforms, tags) {
  const kindEntries = RESOURCE_KINDS.map((kind) => [kind, []]);
  const platformEntries = platforms.map((platform) => [platform.id, []]);
  const tagEntries = tags.map((tag) => [tag.id, []]);
  const kinds = Object.fromEntries(kindEntries);
  const platformIndex = Object.fromEntries(platformEntries);
  const tagIndex = Object.fromEntries(tagEntries);

  for (const resource of resources) {
    kinds[resource.kind].push(resource.id);
    for (const compatibility of resource.compatibility ?? []) platformIndex[compatibility.platform]?.push(resource.id);
    for (const tag of resource.tags) tagIndex[tag]?.push(resource.id);
  }

  return {
    kinds: orderedObject(Object.entries(kinds)),
    platforms: orderedObject(Object.entries(platformIndex)),
    tags: orderedObject(Object.entries(tagIndex)),
  };
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizeCompatibility(compatibility, platformOrder) {
  return compatibility
    .map((entry) => ({
      ...entry,
      ...(entry.installations
        ? {
            installations: entry.installations.map((installation) => ({
              ...installation,
              ...(installation.placeholders
                ? { placeholders: installation.placeholders.slice().sort((left, right) => lexicalCompare(left.name, right.name)) }
                : {}),
            })),
          }
        : {}),
    }))
    .sort(
      (left, right) =>
        (platformOrder.get(left.platform) ?? Number.MAX_SAFE_INTEGER) -
          (platformOrder.get(right.platform) ?? Number.MAX_SAFE_INTEGER) || lexicalCompare(left.platform, right.platform),
    );
}

async function normalizeResource(source, platformOrder, tagOrder, publicAssetsDirectory) {
  const resource = { ...source };
  const { directory, readmePath } = resource;
  delete resource.directory;
  delete resource.resourceFile;
  delete resource.readmePath;
  const readme = await readOptional(readmePath);
  const tags = resource.tags.slice().sort((left, right) => (tagOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (tagOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || lexicalCompare(left, right));
  const normalized = {
    ...resource,
    nameEn: resource.nameEn ?? resource.name,
    summaryEn: resource.summaryEn ?? resource.summary,
    tags,
    compatibility: normalizeCompatibility(resource.compatibility ?? [], platformOrder),
    visibility: resource.visibility ?? "public",
    featured: resource.featured ?? false,
    quality: computeResourceQualityCore({
      stars: resource.sourceStats?.stars ?? 0,
      forks: resource.sourceStats?.forks ?? 0,
      pushedAt: resource.sourceStats?.pushedAt ?? null,
      fetchedAt: resource.sourceStats?.fetchedAt ?? resource.updatedAt ?? resource.createdAt,
      dataUpdatedAt: resource.sourceStats?.fetchedAt ?? null,
      archived: resource.sourceStats?.archived ?? false,
      completeness: completenessScore(resource, readme),
      featured: resource.featured ?? false,
    }),
    ...(readme === undefined ? {} : { readme }),
  };

  for (const field of ["logo", "preview"]) {
    if (!resource[field]) continue;
    const outputDirectory = path.join(publicAssetsDirectory, resource.id);
    await mkdir(outputDirectory, { recursive: true });
    await copyFile(path.join(directory, resource[field]), path.join(outputDirectory, resource[field]));
    normalized[field] = `/resource-assets/${resource.id}/${resource[field]}`;
  }
  return normalized;
}

function createClientResource(resource, tagLookup) {
  return {
    id: resource.id,
    kind: resource.kind,
    name: resource.name,
    nameEn: resource.nameEn,
    summary: resource.summary,
    summaryEn: resource.summaryEn,
    authorName: resource.author.name,
    repository: resource.repository,
    tags: resource.tags,
    platforms: (resource.compatibility ?? []).map(({ platform, status }) => ({ id: platform, status })),
    ...(resource.logo ? { logo: resource.logo } : {}),
    createdAt: resource.createdAt,
    ...(resource.updatedAt ? { updatedAt: resource.updatedAt } : {}),
    featured: resource.featured,
    quality: resource.quality,
    normalizedSearchText: normalizeSearchText([
      resource.name,
      resource.nameEn,
      resource.summary,
      resource.summaryEn,
      resource.author.name,
      ...resource.tags,
      ...resource.tags.flatMap((tagId) => {
        const tag = tagLookup.get(tagId);
        return tag ? [tag.name, tag.nameEn, ...tag.aliases] : [];
      }),
    ]),
  };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

export async function generateCatalog(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const generatedCatalogPath = path.resolve(
    options.generatedCatalogPath ?? path.join(projectRoot, ".generated", "resources.generated.json"),
  );
  const publicCatalogPath = path.resolve(options.publicCatalogPath ?? path.join(projectRoot, "public", "catalog.json"));
  const publicAssetsDirectory = path.resolve(
    options.publicAssetsDirectory ?? path.join(projectRoot, "public", "resource-assets"),
  );
  const validation = await validateCatalog({ ...options, projectRoot });
  const platformOrder = new Map(validation.platforms.map((platform, index) => [platform.id, index]));
  const tagOrder = new Map(validation.tags.map((tag) => [tag.id, tag.sortOrder]));
  const tagLookup = new Map(validation.tags.map((tag) => [tag.id, tag]));

  await rm(publicAssetsDirectory, { recursive: true, force: true });
  const normalizedResources = await Promise.all(
    validation.resources.map((resource) => normalizeResource(resource, platformOrder, tagOrder, publicAssetsDirectory)),
  );
  const resources = normalizedResources
    .filter((resource) => resource.visibility === "public")
    .sort(resourceCompare);
  const indexes = createIndexes(resources, validation.platforms, validation.tags);
  const fullCatalog = {
    schemaVersion: 1,
    resources,
    indexes,
    platforms: validation.platforms,
    tags: validation.tags,
  };
  const clientCatalog = {
    schemaVersion: 1,
    resources: resources.map((resource) => createClientResource(resource, tagLookup)),
    indexes,
    tags: validation.tags,
  };
  const generatedBytes = serialize(fullCatalog);
  const publicBytes = serialize(clientCatalog);
  await Promise.all([
    writeAtomic(generatedCatalogPath, generatedBytes),
    writeAtomic(publicCatalogPath, publicBytes),
  ]);

  return {
    fullCatalog,
    clientCatalog,
    generatedCatalogPath,
    publicCatalogPath,
    generatedBytes,
    publicBytes,
  };
}

async function runCli() {
  try {
    const result = await generateCatalog();
    console.log(
      `Catalog 已生成：${result.fullCatalog.resources.length} 个公开资源，${result.generatedCatalogPath}，${result.publicCatalogPath}。`,
    );
  } catch (error) {
    if (Array.isArray(error.messages)) for (const message of error.messages) console.error(message);
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
