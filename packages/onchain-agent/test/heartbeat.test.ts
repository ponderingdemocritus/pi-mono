import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeartbeatLoop, cronMatchesDate, parseHeartbeatConfig } from "../src/heartbeat.js";

describe("heartbeat", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "onchain-heartbeat-"));
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-07T10:00:05.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("parses heartbeat config from a markdown yaml block", () => {
		const content = `# HEARTBEAT

\`\`\`yaml
version: 1
jobs:
  - id: market-check
    enabled: true
    schedule: "*/10 * * * *"
    mode: observe
    prompt: "Check market health"
\`\`\`
`;
		const parsed = parseHeartbeatConfig(content);
		expect(parsed.version).toBe(1);
		expect(parsed.jobs).toHaveLength(1);
		expect(parsed.jobs[0].id).toBe("market-check");
		expect(parsed.jobs[0].schedule).toBe("*/10 * * * *");
		expect(parsed.jobs[0].prompt).toContain("Check market");
		expect(parsed.jobs[0].mode).toBe("observe");
	});

	it("supports basic cron matching for */10 schedules", () => {
		const dateA = new Date("2026-02-07T10:20:00.000Z");
		const dateB = new Date("2026-02-07T10:23:00.000Z");
		expect(cronMatchesDate("*/10 * * * *", dateA)).toBe(true);
		expect(cronMatchesDate("*/10 * * * *", dateB)).toBe(false);
	});

	it("runs each due job at most once per minute and reloads file edits", async () => {
		const heartbeatPath = join(tempDir, "HEARTBEAT.md");
		writeFileSync(
			heartbeatPath,
			`# HEARTBEAT

\`\`\`yaml
jobs:
  - id: market-check
    enabled: true
    schedule: "* * * * *"
    prompt: "Market pulse"
\`\`\`
`,
		);

		const onRun = vi.fn(async () => {});
		const loop = createHeartbeatLoop({
			getHeartbeatPath: () => heartbeatPath,
			pollIntervalMs: 1_000,
			onRun,
		});

		loop.start();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(onRun).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(10_000);
		expect(onRun).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date("2026-02-07T10:01:05.000Z"));
		await vi.advanceTimersByTimeAsync(1_000);
		expect(onRun).toHaveBeenCalledTimes(2);

		writeFileSync(
			heartbeatPath,
			`# HEARTBEAT

\`\`\`yaml
jobs:
  - id: market-check
    enabled: false
    schedule: "* * * * *"
    prompt: "disabled"
\`\`\`
`,
		);
		vi.setSystemTime(new Date("2026-02-07T10:02:05.000Z"));
		await vi.advanceTimersByTimeAsync(1_000);
		expect(onRun).toHaveBeenCalledTimes(2);

		loop.stop();
	});
});
