export type ChangeAction = "create" | "update" | "delete" | "replace" | "noop" | "read";

export interface ResourceChangeJson {
  address: string;
  type: string;
  provider_name?: string;
  change: {
    actions: string[];
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  };
}

export interface PlanJson {
  resource_changes?: ResourceChangeJson[];
}

/** Map a `terraform plan -json` planned_change action to the show-json actions array. */
function actionToList(action: string): string[] {
  switch (action) {
    case "create":
      return ["create"];
    case "update":
      return ["update"];
    case "delete":
      return ["delete"];
    case "read":
      return ["read"];
    case "noop":
    case "no-op":
      return ["no-op"];
    case "replace":
    case "create-then-delete":
    case "delete-then-create":
      return ["delete", "create"];
    default:
      return [action];
  }
}

/**
 * Accept either `terraform show -json` (a single JSON object with
 * `resource_changes`) or `terraform plan -json` (an NDJSON log stream).
 */
export function loadPlan(raw: string): PlanJson {
  const text = raw.trim();
  if (!text) throw new Error("plan input is empty");

  // terraform show -json: one JSON object with resource_changes.
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      if (Array.isArray(obj.resource_changes)) return obj as PlanJson;
      if ("format_version" in obj || "terraform_version" in obj) return obj as PlanJson;
    }
  } catch {
    // Not a single JSON document; try NDJSON below.
  }

  // terraform plan -json: NDJSON, one message per line.
  const changes: ResourceChangeJson[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    // A full plan object embedded in the stream wins outright.
    if (Array.isArray(msg.resource_changes)) return msg as PlanJson;
    if (msg.type === "planned_change" && msg.change && typeof msg.change === "object") {
      const change = msg.change as Record<string, unknown>;
      const resource = (change.resource as Record<string, unknown> | undefined) ?? {};
      changes.push({
        address: String(resource.addr ?? ""),
        type: String(resource.resource_type ?? ""),
        change: { actions: actionToList(String(change.action ?? "noop")) },
      });
    }
  }
  if (changes.length > 0) return { resource_changes: changes };

  throw new Error(
    "Could not parse input as `terraform show -json` or `terraform plan -json` output.",
  );
}

export interface Counts {
  create: number;
  update: number;
  delete: number;
  replace: number;
  noop: number;
  read: number;
}

export interface ResourceSummary {
  address: string;
  type: string;
  provider: string;
  action: ChangeAction;
  stateful: boolean;
  securityFlags: string[];
}

export interface PlanSummary {
  counts: Counts;
  hasDestructiveChanges: boolean;
  resources: ResourceSummary[];
  truncated: boolean;
  totalChanges: number;
}

// Resources that hold data; destroying or replacing them can cause data loss.
const STATEFUL_TYPES = new Set<string>([
  "aws_db_instance",
  "aws_rds_cluster",
  "aws_rds_cluster_instance",
  "aws_dynamodb_table",
  "aws_s3_bucket",
  "aws_ebs_volume",
  "aws_efs_file_system",
  "aws_elasticache_cluster",
  "aws_elasticache_replication_group",
  "aws_redshift_cluster",
  "aws_docdb_cluster",
  "aws_fsx_lustre_file_system",
  "google_sql_database_instance",
  "google_bigquery_dataset",
  "google_storage_bucket",
  "google_redis_instance",
  "azurerm_storage_account",
  "azurerm_sql_database",
  "azurerm_postgresql_server",
  "azurerm_cosmosdb_account",
  "azurerm_managed_disk",
]);

export function classifyActions(actions: string[]): ChangeAction {
  const set = new Set(actions);
  if (set.has("delete") && (set.has("create"))) return "replace";
  if (set.has("delete")) return "delete";
  if (set.has("create")) return "create";
  if (set.has("update")) return "update";
  if (set.has("read")) return "read";
  return "noop";
}

function detectSecurityFlags(rc: ResourceChangeJson): string[] {
  const flags: string[] = [];
  const type = rc.type ?? "";
  const after = (rc.change.after ?? {}) as Record<string, unknown>;

  if (/(^|_)iam($|_)|_policy$|_role$/.test(type)) flags.push("iam");

  const asJson = JSON.stringify(after ?? {});
  if (asJson.includes("0.0.0.0/0") || asJson.includes("::/0")) flags.push("public-network");
  if (after["publicly_accessible"] === true) flags.push("publicly-accessible");

  for (const key of Object.keys(after)) {
    if (/encrypt/i.test(key) && after[key] === false) flags.push("encryption-disabled");
  }
  if (/secret|kms_key|_key$/.test(type)) flags.push("secret-material");

  return [...new Set(flags)];
}

export interface SummarizeOptions {
  maxResources: number; // 0 = unlimited
}

export function summarizePlan(plan: PlanJson, opts: SummarizeOptions): PlanSummary {
  const counts: Counts = { create: 0, update: 0, delete: 0, replace: 0, noop: 0, read: 0 };
  const resources: ResourceSummary[] = [];

  const changes = plan.resource_changes ?? [];
  for (const rc of changes) {
    const action = classifyActions(rc.change?.actions ?? []);
    counts[action]++;
    if (action === "noop" || action === "read") continue;

    resources.push({
      address: rc.address,
      type: rc.type,
      provider: rc.provider_name ?? "",
      action,
      stateful: STATEFUL_TYPES.has(rc.type),
      securityFlags: detectSecurityFlags(rc),
    });
  }

  // Most-risky first, so truncation drops the least interesting changes.
  const risk: Record<ChangeAction, number> = {
    delete: 4, replace: 3, update: 1, create: 1, read: 0, noop: 0,
  };
  resources.sort((a, b) => {
    const r = risk[b.action] - risk[a.action];
    if (r !== 0) return r;
    return (b.stateful ? 1 : 0) - (a.stateful ? 1 : 0);
  });

  let truncated = false;
  let kept = resources;
  if (opts.maxResources > 0 && resources.length > opts.maxResources) {
    kept = resources.slice(0, opts.maxResources);
    truncated = true;
  }

  return {
    counts,
    hasDestructiveChanges: counts.delete > 0 || counts.replace > 0,
    resources: kept,
    truncated,
    totalChanges: counts.create + counts.update + counts.delete + counts.replace,
  };
}
