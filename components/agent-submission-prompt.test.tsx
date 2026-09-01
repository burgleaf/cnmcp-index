/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AgentSubmissionPrompt } from "./agent-submission-prompt";

const catalogRepositoryUrl = "https://github.com/burgleaf/cnmcp-index";

function setClipboard(writeText?: jest.Mock) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : {},
  });
}

describe("AgentSubmissionPrompt", () => {
  it("合法仓库地址生成提示词并复制到剪贴板", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<AgentSubmissionPrompt catalogRepositoryUrl={catalogRepositoryUrl} />);

    fireEvent.change(screen.getByLabelText("源码 GitHub 仓库地址"), {
      target: { value: "https://github.com/example/cool-mcp.git" },
    });

    const prompt = screen.getByLabelText("可复制的投稿提示词") as HTMLTextAreaElement;
    expect(prompt.value).toContain("https://github.com/example/cool-mcp");
    expect(prompt.value).toContain(catalogRepositoryUrl);
    expect(prompt.value).toContain("submit-cnmcp-resource");

    fireEvent.click(screen.getByRole("button", { name: "复制提示词" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("https://github.com/example/cool-mcp");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("已复制到剪贴板"));
  });

  it("非法地址禁用复制并提示格式", () => {
    setClipboard(jest.fn());
    render(<AgentSubmissionPrompt catalogRepositoryUrl={catalogRepositoryUrl} />);

    fireEvent.change(screen.getByLabelText("源码 GitHub 仓库地址"), {
      target: { value: "https://gitlab.com/example/cool-mcp" },
    });

    expect(screen.getByRole("alert").textContent).toContain("https://github.com/owner/repository");
    expect((screen.getByRole("button", { name: "复制提示词" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("可复制的投稿提示词")).toBeNull();
  });

  it("剪贴板不可用时提供手动选择", async () => {
    setClipboard();
    render(<AgentSubmissionPrompt catalogRepositoryUrl={catalogRepositoryUrl} />);

    fireEvent.change(screen.getByLabelText("源码 GitHub 仓库地址"), {
      target: { value: "https://github.com/example/cool-mcp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "复制提示词" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("剪贴板不可用"));
    expect(screen.getByRole("button", { name: "选择文本" })).toBeTruthy();
  });
});
