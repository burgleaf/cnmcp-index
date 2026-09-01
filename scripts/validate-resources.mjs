import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const IMAGE_EXTENSION = /\.(?:avif|jpe?g|png|webp|svg)$/i;
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const REQUIRED_MVP_PLATFORMS = new Set(["codex", "claude-code"]);

export class CatalogValidationError extends Error {
  constructor(messages) {
    super(`资源内容校验失败（${messages.length} 项）`);
    this.name = "CatalogValidationError";
    this.messages = messages;
  }
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function displayPath(filePath, projectRoot) {
  const relative = path.relative(projectRoot, filePath);
  return relative && !relative.startsWith("..") ? relative.split(path.sep).join("/") : filePath;
}

function validationMessage(resourceId, filePath, fieldPath, message, projectRoot) {
  return `[${resourceId}] ${displayPath(filePath, projectRoot)} ${fieldPath}: ${message}`;
}

async function readJson(filePath, resourceId, errors, projectRoot) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    errors.push(validationMessage(resourceId, filePath, "$", `JSON 无法解析：${error.message}`, projectRoot));
    return null;
  }
}

function ajvFieldPath(error) {
  let fieldPath = error.instancePath ? `$${error.instancePath.replaceAll("/", ".")}` : "$";
  if (error.keyword === "required" && error.params.missingProperty) {
    fieldPath += `.${error.params.missingProperty}`;
  }
  if (error.keyword === "additionalProperties" && error.params.additionalProperty) {
    fieldPath += `.${error.params.additionalProperty}`;
  }
  return fieldPath;
}

function appendSchemaErrors(validate, value, resourceId, filePath, errors, projectRoot) {
  if (validate(value)) return true;
  for (const error of validate.errors ?? []) {
    errors.push(
      validationMessage(resourceId, filePath, ajvFieldPath(error), error.message ?? "不符合 Schema", projectRoot),
    );
  }
  return false;
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function appendDateError(value, resourceId, filePath, fieldPath, errors, projectRoot) {
  if (typeof value === "string" && DATE_PATTERN.test(value) && !isRealDate(value)) {
    errors.push(validationMessage(resourceId, filePath, fieldPath, "必须是真实存在的 YYYY-MM-DD 日期", projectRoot));
  }
}

function appendHttpsUrlError(value, resourceId, filePath, fieldPath, errors, projectRoot) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error("URL 必须使用 HTTPS，且不得包含用户凭据");
    }
  } catch (error) {
    errors.push(validationMessage(resourceId, filePath, fieldPath, error.message, projectRoot));
  }
}

export function normalizeSourceUrl(value) {
  const url = new URL(value);
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase();
  url.port = url.port === "443" ? "" : url.port;
  url.hash = "";
  url.search = "";
  let pathname = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  if (["github.com", "gitlab.com", "bitbucket.org"].includes(url.hostname)) pathname = pathname.toLowerCase();
  url.pathname = pathname || "/";
  return url.toString().replace(/\/$/, "");
}

function markdownWithoutCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function dangerousDestination(destination) {
  const value = destination.trim().replace(/^<|>$/g, "").replace(/[\u0000-\u001f\u007f\s]/g, "");
  const lower = value.toLowerCase();
  if (!value || value.startsWith("#")) return null;
  if (/^(?:javascript|vbscript|data|file):/.test(lower)) return "链接使用了危险协议";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !lower.startsWith("https://")) return "外部链接必须使用 HTTPS";
  if (value.startsWith("//")) return "不得使用省略协议的外部链接";
  if (value.split(/[?#]/, 1)[0].split(/[\\/]/).includes("..")) return "相对链接不得越出资源目录";
  return null;
}

function validateMarkdown(markdown, resourceId, filePath, errors, projectRoot) {
  const inspectable = markdownWithoutCode(markdown);
  if (/<!--[\s\S]*?-->|<\/?[a-z][^>]*>/i.test(inspectable)) {
    errors.push(validationMessage(resourceId, filePath, "$", "README 禁止原始 HTML", projectRoot));
  }
  const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of inspectable.matchAll(markdownLink)) {
    const destination = match[1].trim().split(/\s+["']/)[0];
    const message = dangerousDestination(destination);
    if (message) errors.push(validationMessage(resourceId, filePath, "$", message, projectRoot));
  }
}

function validateSvg(svg, resourceId, filePath, fieldPath, errors, projectRoot) {
  const unsafePattern = /<\s*(?:script|foreignObject|iframe|object|embed)\b|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)/i;
  if (unsafePattern.test(svg)) {
    errors.push(validationMessage(resourceId, filePath, fieldPath, "SVG 含脚本、事件属性、嵌入对象或外部资源", projectRoot));
  }
}

function installationText(installation) {
  return [installation.command, installation.content, installation.target, installation.url].filter(Boolean).join("\n");
}

function validatePlaceholders(installation, resourceId, filePath, fieldPath, errors, projectRoot) {
  const used = new Set([...installationText(installation).matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]));
  const declared = new Set();
  for (const [index, placeholder] of (installation.placeholders ?? []).entries()) {
    if (declared.has(placeholder.name)) {
      errors.push(validationMessage(resourceId, filePath, `${fieldPath}.placeholders.${index}.name`, "占位符声明重复", projectRoot));
    }
    declared.add(placeholder.name);
  }
  for (const name of used) {
    if (!declared.has(name)) {
      errors.push(validationMessage(resourceId, filePath, `${fieldPath}.placeholders`, `占位符 {{${name}}} 必须声明替换说明和 secret 属性`, projectRoot));
    }
  }
  for (const name of declared) {
    if (!used.has(name)) {
      errors.push(validationMessage(resourceId, filePath, `${fieldPath}.placeholders`, `已声明的占位符 ${name} 未出现在安装内容中`, projectRoot));
    }
  }
}

async function validateResourceAssets(resource, resourceDirectory, filePath, errors, projectRoot) {
  const entries = await readdir(resourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXTENSION.test(entry.name)) continue;
    if (entry.name.toLowerCase().endsWith(".svg")) {
      const svgPath = path.join(resourceDirectory, entry.name);
      validateSvg(await readFile(svgPath, "utf8"), resource.id, svgPath, "$", errors, projectRoot);
    }
  }

  for (const field of ["logo", "preview"]) {
    if (!resource[field]) continue;
    const assetPath = path.join(resourceDirectory, resource[field]);
    try {
      const assetStat = await stat(assetPath);
      if (!assetStat.isFile()) throw new Error("不是普通文件");
    } catch (error) {
      errors.push(validationMessage(resource.id, filePath, `$.${field}`, `本地图片不存在或不可读取：${error.message}`, projectRoot));
    }
  }
}

async function validatePlatformIcons(platforms, registryPath, errors, projectRoot) {
  for (const [index, platform] of platforms.entries()) {
    if (typeof platform.icon !== "string" || !platform.icon.startsWith("/")) continue;
    const iconPath = path.join(projectRoot, "public", platform.icon.slice(1));
    try {
      const iconStat = await stat(iconPath);
      if (!iconStat.isFile()) throw new Error("不是普通文件");
      if (iconPath.toLowerCase().endsWith(".svg")) {
        validateSvg(await readFile(iconPath, "utf8"), platform.id, iconPath, "$", errors, projectRoot);
      }
    } catch (error) {
      errors.push(validationMessage(platform.id, registryPath, `$.platforms.${index}.icon`, `平台图标不存在或不可读取：${error.message}`, projectRoot));
    }
  }
}

function validateTagRegistry(tagRegistry, tagRegistryPath, errors, projectRoot) {
  if (!tagRegistry || tagRegistry.schemaVersion !== 1 || !Array.isArray(tagRegistry.tags)) {
    errors.push(validationMessage("catalog", tagRegistryPath, "$", "标签注册表必须包含 schemaVersion: 1 和 tags 数组", projectRoot));
    return new Set();
  }
  const ids = new Set();
  for (const [index, tag] of tagRegistry.tags.entries()) {
    if (!tag || typeof tag.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag.id)) {
      errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.id`, "标签 ID 必须是 kebab-case", projectRoot));
      continue;
    }
    if (ids.has(tag.id)) errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.id`, `标签 ID ${tag.id} 重复`, projectRoot));
    ids.add(tag.id);
    if (typeof tag.name !== "string" || !tag.name.trim()) {
      errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.name`, "标签名称不能为空", projectRoot));
    }
    for (const key of ["nameEn", "description", "group"]) {
      if (typeof tag[key] !== "string" || !tag[key].trim()) {
        errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.${key}`, `${key} 不能为空`, projectRoot));
      }
    }
    if (!["profession", "industry", "task", "capability"].includes(tag.group)) {
      errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.group`, "标签分组无效", projectRoot));
    }
    if (!Array.isArray(tag.aliases) || tag.aliases.some((alias) => typeof alias !== "string" || !alias.trim())) {
      errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.aliases`, "aliases 必须是非空字符串数组", projectRoot));
    }
    if (!Number.isInteger(tag.sortOrder) || tag.sortOrder < 0) {
      errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.sortOrder`, "sortOrder 必须是非负整数", projectRoot));
    }
    const extraKeys = Object.keys(tag).filter((key) => !["id", "name", "nameEn", "description", "aliases", "group", "sortOrder"].includes(key));
    if (extraKeys.length) errors.push(validationMessage("catalog", tagRegistryPath, `$.tags.${index}.${extraKeys[0]}`, "标签包含未定义字段", projectRoot));
  }
  return ids;
}

export async function validateCatalog(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const resourcesDirectory = path.resolve(options.resourcesDirectory ?? path.join(projectRoot, "resources"));
  const platformRegistryPath = path.resolve(options.platformRegistryPath ?? path.join(projectRoot, "catalog", "platforms.json"));
  const tagRegistryPath = path.resolve(options.tagRegistryPath ?? path.join(projectRoot, "catalog", "tags.json"));
  const resourceSchemaPath = path.resolve(options.resourceSchemaPath ?? path.join(PROJECT_ROOT, "schemas", "resource.schema.json"));
  const platformsSchemaPath = path.resolve(options.platformsSchemaPath ?? path.join(PROJECT_ROOT, "schemas", "platforms.schema.json"));
  const errors = [];
  const warnings = [];

  const [resourceSchema, platformsSchema, platformRegistry, tagRegistry] = await Promise.all([
    readJson(resourceSchemaPath, "schema", errors, projectRoot),
    readJson(platformsSchemaPath, "schema", errors, projectRoot),
    readJson(platformRegistryPath, "catalog", errors, projectRoot),
    readJson(tagRegistryPath, "catalog", errors, projectRoot),
  ]);
  if (!resourceSchema || !platformsSchema || !platformRegistry || !tagRegistry) throw new CatalogValidationError(errors);

  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  const validateResourceSchema = ajv.compile(resourceSchema);
  const validatePlatformsSchema = ajv.compile(platformsSchema);
  appendSchemaErrors(validatePlatformsSchema, platformRegistry, "catalog", platformRegistryPath, errors, projectRoot);

  const platforms = Array.isArray(platformRegistry.platforms) ? platformRegistry.platforms : [];
  const platformIds = new Set();
  for (const [index, platform] of platforms.entries()) {
    if (!platform || typeof platform.id !== "string") continue;
    if (platformIds.has(platform.id)) errors.push(validationMessage("catalog", platformRegistryPath, `$.platforms.${index}.id`, `平台 ID ${platform.id} 重复`, projectRoot));
    platformIds.add(platform.id);
    appendHttpsUrlError(platform.homepage, "catalog", platformRegistryPath, `$.platforms.${index}.homepage`, errors, projectRoot);
  }
  const enabledPlatforms = new Set(platforms.filter((platform) => platform.enabled).map((platform) => platform.id));
  for (const id of REQUIRED_MVP_PLATFORMS) {
    if (!enabledPlatforms.has(id)) errors.push(validationMessage("catalog", platformRegistryPath, "$.platforms", `MVP 必须启用平台 ${id}`, projectRoot));
  }
  for (const id of enabledPlatforms) {
    if (!REQUIRED_MVP_PLATFORMS.has(id)) errors.push(validationMessage("catalog", platformRegistryPath, "$.platforms", `MVP 不得启用额外平台 ${id}`, projectRoot));
  }
  await validatePlatformIcons(platforms, platformRegistryPath, errors, projectRoot);
  const tagIds = validateTagRegistry(tagRegistry, tagRegistryPath, errors, projectRoot);

  let directoryEntries = [];
  try {
    directoryEntries = (await readdir(resourcesDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => lexicalCompare(left.name, right.name));
  } catch (error) {
    errors.push(validationMessage("catalog", resourcesDirectory, "$", `资源目录无法读取：${error.message}`, projectRoot));
  }

  const resources = [];
  const ids = new Map();
  const repositories = new Map();
  for (const entry of directoryEntries) {
    const resourceDirectory = path.join(resourcesDirectory, entry.name);
    const resourceFile = path.join(resourceDirectory, "resource.json");
    const resource = await readJson(resourceFile, entry.name, errors, projectRoot);
    if (!resource) continue;
    const resourceId = typeof resource.id === "string" ? resource.id : entry.name;
    appendSchemaErrors(validateResourceSchema, resource, resourceId, resourceFile, errors, projectRoot);

    if (resource.id !== entry.name) errors.push(validationMessage(resourceId, resourceFile, "$.id", `必须与目录名 ${entry.name} 一致`, projectRoot));
    if (typeof resource.id === "string") {
      if (ids.has(resource.id)) {
        const previous = ids.get(resource.id);
        errors.push(validationMessage(resourceId, resourceFile, "$.id", `资源 ID 与 ${displayPath(previous, projectRoot)} 冲突`, projectRoot));
      } else ids.set(resource.id, resourceFile);
    }

    for (const field of ["repository", "homepage", "documentation"]) {
      if (resource[field] !== undefined) appendHttpsUrlError(resource[field], resourceId, resourceFile, `$.${field}`, errors, projectRoot);
    }
    if (resource.author?.url !== undefined) appendHttpsUrlError(resource.author.url, resourceId, resourceFile, "$.author.url", errors, projectRoot);
    if (typeof resource.repository === "string") {
      try {
        const normalized = normalizeSourceUrl(resource.repository);
        if (repositories.has(normalized)) {
          const previous = repositories.get(normalized);
          errors.push(validationMessage(resourceId, resourceFile, "$.repository", `规范化源码地址与 ${previous.resourceId}（${displayPath(previous.filePath, projectRoot)}）冲突`, projectRoot));
        } else repositories.set(normalized, { resourceId, filePath: resourceFile });
      } catch {
        // URL 结构错误已由 Schema 和 URL 校验报告。
      }
    }

    appendDateError(resource.createdAt, resourceId, resourceFile, "$.createdAt", errors, projectRoot);
    appendDateError(resource.updatedAt, resourceId, resourceFile, "$.updatedAt", errors, projectRoot);
    appendDateError(resource.sourceStats?.fetchedAt, resourceId, resourceFile, "$.sourceStats.fetchedAt", errors, projectRoot);
    if (isRealDate(resource.createdAt) && isRealDate(resource.updatedAt) && resource.updatedAt < resource.createdAt) {
      errors.push(validationMessage(resourceId, resourceFile, "$.updatedAt", "不得早于 createdAt", projectRoot));
    }

    for (const [tagIndex, tag] of (resource.tags ?? []).entries()) {
      if (!tagIds.has(tag)) errors.push(validationMessage(resourceId, resourceFile, `$.tags.${tagIndex}`, `标签 ${tag} 未注册`, projectRoot));
    }

    const compatibilityPlatforms = new Set();
    for (const [compatibilityIndex, compatibility] of (resource.compatibility ?? []).entries()) {
      const basePath = `$.compatibility.${compatibilityIndex}`;
      if (!platformIds.has(compatibility.platform)) {
        errors.push(validationMessage(resourceId, resourceFile, `${basePath}.platform`, `平台 ${compatibility.platform} 未注册；可用平台：${[...platformIds].join(", ")}`, projectRoot));
      }
      if (compatibilityPlatforms.has(compatibility.platform)) {
        errors.push(validationMessage(resourceId, resourceFile, `${basePath}.platform`, `平台 ${compatibility.platform} 在资源内重复`, projectRoot));
      }
      if (compatibility.evidenceUrl !== undefined) appendHttpsUrlError(compatibility.evidenceUrl, resourceId, resourceFile, `${basePath}.evidenceUrl`, errors, projectRoot);
      compatibilityPlatforms.add(compatibility.platform);
      appendDateError(compatibility.verifiedAt, resourceId, resourceFile, `${basePath}.verifiedAt`, errors, projectRoot);
      if (compatibility.status === "partial" && !(typeof compatibility.note === "string" && compatibility.note.trim())) {
        errors.push(validationMessage(resourceId, resourceFile, `${basePath}.note`, "partial 状态必须说明限制", projectRoot));
      }
      if (compatibility.status === "unsupported" && compatibility.installations !== undefined) {
        errors.push(validationMessage(resourceId, resourceFile, `${basePath}.installations`, "unsupported 状态不得提供安装说明", projectRoot));
      }
      for (const [installationIndex, installation] of (compatibility.installations ?? []).entries()) {
        const installationPath = `${basePath}.installations.${installationIndex}`;
        if (installation.url !== undefined) appendHttpsUrlError(installation.url, resourceId, resourceFile, `${installationPath}.url`, errors, projectRoot);
        validatePlaceholders(installation, resourceId, resourceFile, installationPath, errors, projectRoot);
      }
    }

    await validateResourceAssets(resource, resourceDirectory, resourceFile, errors, projectRoot);
    const readmePath = path.join(resourceDirectory, "README.md");
    try {
      validateMarkdown(await readFile(readmePath, "utf8"), resourceId, readmePath, errors, projectRoot);
    } catch (error) {
      if (error.code !== "ENOENT") errors.push(validationMessage(resourceId, readmePath, "$", `README 无法读取：${error.message}`, projectRoot));
    }
    resources.push({ ...resource, directory: resourceDirectory, resourceFile, readmePath });
  }

  if (errors.length) throw new CatalogValidationError(errors);
  return {
    resources,
    platforms: platforms.slice().sort((left, right) => left.sortOrder - right.sortOrder || lexicalCompare(left.id, right.id)),
    tags: tagRegistry.tags.slice().sort((left, right) => left.sortOrder - right.sortOrder || lexicalCompare(left.id, right.id)),
    warnings,
  };
}

function cliOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === "--project-root" && arguments_[index + 1]) {
      options.projectRoot = arguments_[index + 1];
      index += 1;
    }
  }
  return options;
}

async function runCli() {
  try {
    const result = await validateCatalog(cliOptions(process.argv.slice(2)));
    console.log(`资源校验通过：${result.resources.length} 个资源，${result.platforms.length} 个平台，${result.tags.length} 个标签。`);
  } catch (error) {
    if (error instanceof CatalogValidationError) {
      for (const message of error.messages) console.error(message);
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
