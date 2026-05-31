import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createHarness } from "../harness.ts";

function createUsage(totalTokens: number) {
	return {
		input: totalTokens,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

describe("regression #5236: pre-prompt threshold compaction", () => {
	it("does not continue before appending the new user prompt", async () => {
		const harness = await createHarness({ models: [{ id: "faux-1", contextWindow: 1_010_000 }] });
		try {
			const model = harness.getModel();
			const assistant = {
				...fauxAssistantMessage("large response", { timestamp: Date.now() - 500 }),
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: createUsage(1_000_000),
			};

			const previousUser = {
				role: "user" as const,
				content: [{ type: "text" as const, text: "previous" }],
				timestamp: Date.now() - 1000,
			};
			harness.session.agent.state.messages = [previousUser, assistant];
			harness.sessionManager.appendMessage(previousUser);
			harness.sessionManager.appendMessage(assistant);
			harness.setResponses([fauxAssistantMessage("next response")]);

			const sessionInternals = harness.session as unknown as {
				_runAutoCompaction: (reason: "overflow" | "threshold", willRetry: boolean) => Promise<boolean>;
			};
			const runAutoCompactionSpy = vi.spyOn(sessionInternals, "_runAutoCompaction").mockResolvedValue(true);

			await expect(harness.session.prompt("next message")).resolves.toBeUndefined();

			expect(runAutoCompactionSpy).toHaveBeenCalledWith("threshold", false);
			expect(harness.session.messages.at(-2)?.role).toBe("user");
			expect(harness.session.messages.at(-1)?.role).toBe("assistant");
		} finally {
			harness.cleanup();
		}
	});
});
