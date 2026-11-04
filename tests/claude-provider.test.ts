import { describe, it, expect, vi, afterEach } from "vitest";
import { ClaudeProvider } from "@/server/ai/providers/claude";

// No API key in tests: fake the HTTP layer and check the SDK still sends a Messages request and the provider parses the reply.
describe("ClaudeProvider with the installed Anthropic SDK", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to the Messages API and maps the JSON answer to categories", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: '[{"index":0,"categoryName":"Food","confidence":6}]' }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const out = await new ClaudeProvider("sk-ant-test").categorize(
      [{ description: "Wolt", amount: -50, currency: "ILS" }],
      [{ name: "Food", description: null }]
    );

    expect(out).toEqual([{ index: 0, categoryName: "Food", isNew: false, confidence: 6 }]);
    const [url, init] = fetchSpy.mock.calls[0] as [string | URL | Request, RequestInit | undefined];
    expect(String(url instanceof Request ? url.url : url)).toContain("/v1/messages");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "claude-haiku-4-5-20251001", max_tokens: 4096 });
  });
});
