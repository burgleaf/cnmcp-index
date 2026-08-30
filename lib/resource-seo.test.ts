import { detailFixturePlatforms, detailFixtureResource } from "@/test/fixtures/resource-detail";

import {
  createResourceJsonLd,
  createResourceMetadata,
  DEFAULT_SOCIAL_IMAGE_PATH,
  getResourceSocialImage,
  serializeJsonLd,
} from "./resource-seo";

describe("资源 SEO", () => {
  it("生成唯一 title/description、生产 canonical、Open Graph 与 Twitter Card", () => {
    const metadata = createResourceMetadata(detailFixtureResource);

    expect(metadata.title).toBe("隔离详情 Fixture（MCP · fixture-mcp）");
    expect(metadata.description).toContain("fixture-mcp");
    expect(metadata.alternates?.canonical).toBe("https://www.cnmcp.com/resources/fixture-mcp/");
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      url: "https://www.cnmcp.com/resources/fixture-mcp/",
      title: "隔离详情 Fixture（MCP · fixture-mcp）",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "隔离详情 Fixture（MCP · fixture-mcp）",
    });
  });

  it("预览图优先于 logo；非法、外部或跨资源图片统一回退默认图", () => {
    expect(getResourceSocialImage({
      ...detailFixtureResource,
      preview: "/resource-assets/fixture-mcp/preview.webp",
      logo: "/resource-assets/fixture-mcp/logo.png",
    })).toBe("https://www.cnmcp.com/resource-assets/fixture-mcp/preview.webp");

    for (const preview of [
      "https://example.com/preview.png",
      "/resource-assets/other-resource/preview.png",
      "/resource-assets/fixture-mcp/../secret.png",
      "/resource-assets/fixture-mcp/preview.txt",
    ]) {
      expect(getResourceSocialImage({ ...detailFixtureResource, preview, logo: undefined })).toBe(
        `https://www.cnmcp.com${DEFAULT_SOCIAL_IMAGE_PATH}`,
      );
    }
  });

  it("输出含类型、作者、许可证和兼容平台的软件结构化数据", () => {
    const jsonLd = createResourceJsonLd(detailFixtureResource, detailFixturePlatforms);

    expect(jsonLd["@type"]).toEqual(["CreativeWork", "SoftwareSourceCode"]);
    expect(jsonLd.author).toMatchObject({ name: "Fixture 作者" });
    expect(jsonLd.license).toBe("MIT");
    expect(jsonLd.runtimePlatform).toEqual(["Codex", "Claude Code", "注册平台"]);
    expect(jsonLd.additionalProperty).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "资源类型", value: "mcp" }),
      expect.objectContaining({ name: "Codex", value: "native" }),
    ]));
    expect(serializeJsonLd({ value: "</script>" })).not.toContain("</script>");
  });

  it("Skill 仅使用 CreativeWork；所有非公开状态都拒绝 Metadata 和 JSON-LD", () => {
    expect(createResourceJsonLd(
      { ...detailFixtureResource, id: "fixture-skill", kind: "skill" },
      detailFixturePlatforms,
    )["@type"]).toBe("CreativeWork");

    for (const visibility of ["unlisted", "removed"] as const) {
      const hidden = { ...detailFixtureResource, visibility };
      expect(() => createResourceMetadata(hidden)).toThrow("不得生成 SEO 输出");
      expect(() => createResourceJsonLd(hidden, detailFixturePlatforms)).toThrow("不得生成 SEO 输出");
    }
  });
});
