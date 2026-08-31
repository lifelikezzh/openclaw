import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendLocalMediaParentRoots,
  getAgentScopedMediaLocalRoots,
  getAgentScopedMediaLocalRootsForSources,
  getDefaultMediaLocalRoots,
} from "./local-roots.js";

function normalizeHostPath(value: string): string {
  return path.normalize(path.resolve(value));
}

describe("local media roots", () => {
  function withStateDir<T>(stateDir: string, run: () => T): T {
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    return run();
  }

  function expectNormalizedRootsContain(
    roots: readonly string[],
    expectedRoots: readonly string[],
  ) {
    const normalizedRoots = roots.map(normalizeHostPath);
    expectedRoots.forEach((expectedRoot) => {
      expect(normalizedRoots).toContain(normalizeHostPath(expectedRoot));
    });
  }

  function expectNormalizedRootsExclude(
    roots: readonly string[],
    excludedRoots: readonly string[],
  ) {
    const normalizedRoots = roots.map(normalizeHostPath);
    excludedRoots.forEach((excludedRoot) => {
      expect(normalizedRoots).not.toContain(normalizeHostPath(excludedRoot));
    });
  }

  function expectPicturesRootPresence(params: {
    roots: readonly string[];
    shouldContainPictures: boolean;
    picturesRoot?: string;
  }) {
    const normalizedRoots = params.roots.map(normalizeHostPath);
    const picturesRoot = normalizeHostPath(params.picturesRoot ?? "/Users/peter/Pictures");
    if (params.shouldContainPictures) {
      expect(normalizedRoots).toContain(picturesRoot);
      return;
    }
    expect(normalizedRoots).not.toContain(picturesRoot);
  }

  function expectAgentMediaRootsCase(params: {
    stateDir: string;
    getRoots: () => readonly string[];
    expectedContained?: readonly string[];
    expectedExcluded?: readonly string[];
    minLength?: number;
  }) {
    const roots = withStateDir(params.stateDir, params.getRoots);
    if (params.expectedContained) {
      expectNormalizedRootsContain(roots, params.expectedContained);
    }
    if (params.expectedExcluded) {
      expectNormalizedRootsExclude(roots, params.expectedExcluded);
    }
    if (params.minLength !== undefined) {
      expect(roots.length).toBeGreaterThanOrEqual(params.minLength);
    }
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      name: "keeps temp, media cache, and workspace roots by default",
      stateDir: path.join("/tmp", "openclaw-media-roots-state"),
      getRoots: () => getDefaultMediaLocalRoots(),
      expectedContained: ["media", "workspace", "sandboxes"],
      expectedExcluded: ["agents"],
      minLength: 3,
    },
    {
      name: "adds the active agent workspace without re-opening broad agent state roots",
      stateDir: path.join("/tmp", "openclaw-agent-media-roots-state"),
      getRoots: () => getAgentScopedMediaLocalRoots({}, "ops"),
      expectedContained: ["workspace-ops", "sandboxes"],
      expectedExcluded: ["agents"],
    },
  ] as const)("$name", ({ stateDir, getRoots, expectedContained, expectedExcluded, minLength }) => {
    expectAgentMediaRootsCase({
      stateDir,
      getRoots,
      expectedContained: expectedContained.map((suffix) => path.join(stateDir, suffix)),
      expectedExcluded: expectedExcluded.map((suffix) => path.join(stateDir, suffix)),
      minLength,
    });
  });

  it("keeps configured roots unchanged for caller-provided media paths", () => {
    const roots = appendLocalMediaParentRoots(
      ["/tmp/base"],
      [
        "/Users/peter/Pictures/photo.png",
        "file:///Users/peter/Movies/clip.mp4",
        "https://example.com/remote.png",
        "/etc/passwd",
      ],
    );

    expect(roots.map(normalizeHostPath)).toEqual([normalizeHostPath("/tmp/base")]);
  });

  it.each([
    {
      name: "does not widen agent media roots for concrete local sources when workspaceOnly is disabled",
      stateDir: path.join("/tmp", "openclaw-flexible-media-roots-state"),
      cfg: {},
      shouldContainPictures: false,
    },
    {
      name: "does not widen agent media roots when workspaceOnly is enabled",
      stateDir: path.join("/tmp", "openclaw-flexible-media-roots-state"),
      cfg: { tools: { fs: { workspaceOnly: true } } },
      shouldContainPictures: false,
    },
    {
      name: "does not widen media roots for messaging-profile agents without filesystem tools",
      stateDir: path.join("/tmp", "openclaw-messaging-media-roots-state"),
      cfg: { tools: { profile: "messaging" } },
      shouldContainPictures: false,
    },
    {
      name: "does not widen media roots for messaging-profile agents with filesystem tools enabled",
      stateDir: path.join("/tmp", "openclaw-messaging-fs-media-roots-state"),
      cfg: {
        tools: {
          profile: "messaging",
          fs: { workspaceOnly: false },
        },
      },
      shouldContainPictures: false,
    },
  ] as const)("$name", ({ stateDir, cfg, shouldContainPictures }) => {
    const roots = withStateDir(stateDir, () =>
      getAgentScopedMediaLocalRootsForSources({
        cfg,
        agentId: "ops",
        mediaSources: ["/Users/peter/Pictures/photo.png"],
      }),
    );
    expectPicturesRootPresence({ roots, shouldContainPictures });
  });
});
