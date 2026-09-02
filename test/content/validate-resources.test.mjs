import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CatalogValidationError,
  normalizeSourceUrl,
  validateCatalog,
} from "../../scripts/validate-resources.mjs";

const execFileAsync = promisify(execFile);
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, "../..");
const FIXTURE_ROOT = path.join(PROJECT_ROOT, "test", "fixtures", "content-valid");

async function withFixture(callback) {
  const temporaryParent = await mkdtemp(path.join(os.tmpdir(), "cnmcp-content-"));
  const projectRoot = path.join(temporaryParent, "project");
  await cp(FIXTURE_ROOT, projectRoot, { recursive: true });
  try {
    return await callback(projectRoot);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
}

async function readResource(projectRoot, id) {
  const filePath = path.join(projectRoot, "resources", id, "resource.json");
  return { filePath, value: JSON.parse(await readFile(filePath, "utf8")) };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function expectInvalid(mutate, expectedFragments) {
  await withFixture(async (projectRoot) => {
    await mutate(projectRoot);
    await assert.rejects(
      () => validateCatalog({ projectRoot }),
      (error) => {
        assert.ok(error instanceof CatalogValidationError);
        const output = error.messages.join("\n");
        for (const fragment of expectedFragments) assert.match(output, fragment);
        return true;
      },
    );
  });
}

test("合法 MCP、Skill、Plugin 及五种兼容状态均通过", async () => {
  await withFixture(async (projectRoot) => {
    const result = await validateCatalog({ projectRoot });
    assert.deepEqual(
      result.resources.map(({ kind }) => kind).sort(),
      ["mcp", "plugin", "skill"],
    );
    assert.deepEqual(
      [...new Set(result.resources.flatMap((resource) => resource.compatibility.map(({ status }) => status)))].sort(),
      ["native", "partial", "supported", "unknown", "unsupported"],
    );
    assert.deepEqual(result.platforms.map(({ id }) => id), ["codex", "claude-code"]);
  });
});

test("每个资源都必须提供 README.md", () =>
  expectInvalid(async (root) => {
    await rm(path.join(root, "resources", "beta-skill", "README.md"));
  }, [/\[beta-skill\].*README\.md \$:/, /每个资源都必须提供 README\.md/]));

test("平台兼容性和收录日期可以省略", async () => {
  await withFixture(async (root) => {
    const resource = await readResource(root, "beta-skill");
    delete resource.value.compatibility;
    delete resource.value.createdAt;
    await writeJson(resource.filePath, resource.value);
    await validateCatalog({ projectRoot: root });
  });
});

test("规范化源码地址移除大小写、.git、查询、片段和尾斜杠差异", () => {
  assert.equal(
    normalizeSourceUrl("https://GitHub.com/CNMCP-Fixtures/Alpha-MCP.git/?ref=main#readme"),
    "https://github.com/cnmcp-fixtures/alpha-mcp",
  );
});

test("目录名、必填字段、日期、HTTPS、许可证与标签错误均精确定位", async (t) => {
  await t.test("目录名与 ID 不一致", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "alpha-mcp");
      resource.value.id = "renamed-mcp";
      await writeJson(resource.filePath, resource.value);
    }, [/\[renamed-mcp\].*resource\.json \$\.id:/, /必须与目录名 alpha-mcp 一致/]));

  await t.test("必填字段缺失", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      delete resource.value.author;
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.author:/]));

  await t.test("不存在的日历日期", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.createdAt = "2025-02-30";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.createdAt:/, /真实存在/]));

  await t.test("非 HTTPS 和危险协议 URL", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.repository = "javascript:alert(1)";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.repository:/, /HTTPS/]));

  await t.test("非法许可证表达式", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.license = "unknown license";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.license:/]));

  await t.test("未注册标签", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.tags.push("not-registered");
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.tags\.1:/, /未注册/]));
});

test("未知类型、平台与错误 Schema 版本被拒绝", async (t) => {
  await t.test("未知资源类型", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.kind = "browser-extension";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.kind:/]));

  await t.test("未知平台", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.compatibility[0].platform = "unknown-platform";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.compatibility\.0\.platform:/, /未注册/]));

  await t.test("资源 Schema 版本错误", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.schemaVersion = 2;
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*resource\.json \$\.schemaVersion:/]));

  await t.test("平台 Schema 版本错误", () =>
    expectInvalid(async (root) => {
      const filePath = path.join(root, "catalog", "platforms.json");
      const registry = JSON.parse(await readFile(filePath, "utf8"));
      registry.schemaVersion = 2;
      await writeJson(filePath, registry);
    }, [/\[catalog\].*platforms\.json \$\.schemaVersion:/]));
});

test("重复资源 ID、规范化源码和资源内平台声明被拒绝", async (t) => {
  await t.test("重复 ID", () =>
    expectInvalid(async (root) => {
      await cp(
        path.join(root, "resources", "alpha-mcp"),
        path.join(root, "resources", "duplicate-alpha"),
        { recursive: true },
      );
    }, [/\[alpha-mcp\].*\$\.id:/, /资源 ID 与 .*alpha-mcp.*resource\.json 冲突/]));

  await t.test("规范化源码重复", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      resource.value.repository = "https://github.com/CNMCP-Fixtures/Alpha-MCP.git/";
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.repository:/, /规范化源码地址与 alpha-mcp/]));

  await t.test("同一资源重复平台", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "gamma-plugin");
      resource.value.compatibility.push({ ...resource.value.compatibility[0] });
      await writeJson(resource.filePath, resource.value);
    }, [/\[gamma-plugin\].*\$\.compatibility\.1\.platform:/, /在资源内重复/]));
});

test("Plugin 可以面向非编程 AI 工具，且不接受已废弃的范围字段", async (t) => {
  await t.test("非编程 AI 工具 Plugin", async () => {
    await withFixture(async (root) => {
      const resource = await readResource(root, "gamma-plugin");
      resource.value.name = "伽马绘图插件";
      resource.value.summary = "为 AI 绘图工具提供提示词模板、图层工作流和素材管理能力。";
      await writeJson(resource.filePath, resource.value);
      await validateCatalog({ projectRoot: root });
    });
  });

  await t.test("废弃范围字段", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "gamma-plugin");
      resource.value.pluginScope = "ai-coding-tool";
      await writeJson(resource.filePath, resource.value);
    }, [/\[gamma-plugin\].*\$\.pluginScope:/]));
});

test("partial、unsupported 与安装占位符约束被执行", async (t) => {
  await t.test("partial 缺少限制说明", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "beta-skill");
      delete resource.value.compatibility[1].note;
      await writeJson(resource.filePath, resource.value);
    }, [/\[beta-skill\].*\$\.compatibility\.1\.note:/, /partial 状态必须说明限制/]));

  await t.test("unsupported 携带安装说明", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "alpha-mcp");
      resource.value.compatibility[0].installations = [{ type: "manual", content: "不应展示" }];
      await writeJson(resource.filePath, resource.value);
    }, [/\[alpha-mcp\].*\$\.compatibility\.0\.installations:/, /不得提供安装说明/]));

  await t.test("未声明的占位符", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "alpha-mcp");
      delete resource.value.compatibility[1].installations[0].placeholders;
      await writeJson(resource.filePath, resource.value);
    }, [/\[alpha-mcp\].*placeholders:/, /API_TOKEN.*必须声明/]));
});

test("MVP 只能启用 Codex 与 Claude Code", () =>
  expectInvalid(async (root) => {
    const filePath = path.join(root, "catalog", "platforms.json");
    const registry = JSON.parse(await readFile(filePath, "utf8"));
    registry.platforms.push({
      id: "future-tool",
      name: "Future Tool",
      homepage: "https://example.com/future-tool",
      icon: "/platforms/codex.svg",
      enabled: true,
      sortOrder: 30,
    });
    await writeJson(filePath, registry);
  }, [/\[catalog\].*\$\.platforms:/, /MVP 不得启用额外平台 future-tool/]));

test("危险 Markdown、SVG 和缺失本地图片被拒绝", async (t) => {
  await t.test("原始 HTML 与危险 Markdown URL", () =>
    expectInvalid(async (root) => {
      await writeFile(
        path.join(root, "resources", "alpha-mcp", "README.md"),
        "# Bad\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n",
        "utf8",
      );
    }, [/\[alpha-mcp\].*README\.md \$:/, /禁止原始 HTML/, /危险协议/]));

  await t.test("含脚本或外链的 SVG", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "alpha-mcp");
      resource.value.logo = "evil.svg";
      await writeJson(resource.filePath, resource.value);
      await writeFile(
        path.join(root, "resources", "alpha-mcp", "evil.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        "utf8",
      );
    }, [/\[alpha-mcp\].*evil\.svg \$:/, /SVG 含脚本/]));

  await t.test("资源声明的本地图片缺失", () =>
    expectInvalid(async (root) => {
      const resource = await readResource(root, "alpha-mcp");
      resource.value.logo = "missing.webp";
      await writeJson(resource.filePath, resource.value);
    }, [/\[alpha-mcp\].*resource\.json \$\.logo:/, /本地图片不存在/]));
});

test("CLI 在内容错误时输出可定位错误并非零退出", async () => {
  await withFixture(async (projectRoot) => {
    const resource = await readResource(projectRoot, "beta-skill");
    resource.value.schemaVersion = 9;
    await writeJson(resource.filePath, resource.value);
    await assert.rejects(
      () =>
        execFileAsync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "validate-resources.mjs"), "--project-root", projectRoot]),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(error.stderr, /\[beta-skill\].*resource\.json \$\.schemaVersion:/);
        return true;
      },
    );
  });
});
