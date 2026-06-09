/**
 * GitHub workflow_dispatch helper.
 * Fires a workflow run on the configured repo with the given inputs.
 * Uses GH_DISPATCH_TOKEN — a fine-grained PAT with workflow scope.
 */

const REPO_OWNER = "ryan8298";
const REPO_NAME = "echelix-engine";
const BRANCH = "main";

export type WorkflowName = "enrich.yml" | "select.yml" | "gate.yml" | "apollo-refresh.yml";

export async function dispatchWorkflow(
  workflow: WorkflowName,
  inputs: Record<string, string | boolean>,
): Promise<{ ok?: true; error?: string; runUrl?: string }> {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return { error: "GH_DISPATCH_TOKEN not set on the server." };

  // Normalize: GH API expects all input values as strings.
  const stringInputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) stringInputs[k] = typeof v === "boolean" ? String(v) : v;

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: BRANCH, inputs: stringInputs }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
  }
  // GitHub returns 204 with no body; the actual run id isn't immediately known.
  // Caller can link to the Actions page generally.
  return {
    ok: true,
    runUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow}`,
  };
}
