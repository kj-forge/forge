// ============================================================================
// Signup side-effects: athlete + public profile + audit log, in one atomic
// Postgres transaction. Called from auth.ts's databaseHooks.user.create.after.
//
// Extracted here (not inline in auth.ts) so the transaction body is testable
// without spinning up Better Auth's signup flow — tests can call
// `runSignupTransaction()` directly against a real Postgres connection.
// ============================================================================

import { sql } from "drizzle-orm";

import { createPool } from "../../../../db/pool";
import { athletePublicProfiles, athletes, auditLog } from "../../../../db/schema";

// Word lists for random usernames (e.g., "brave-otter-471"). Kept short and
// PG-safe (lowercase, no surprises). 900 × 900 × 900 ≈ 729M combinations.
const ADJECTIVES = [
  "brave",
  "swift",
  "kind",
  "calm",
  "bold",
  "sharp",
  "smart",
  "wild",
  "wise",
  "noble",
  "fierce",
  "agile",
  "steady",
  "lucky",
  "humble",
  "loyal",
  "bright",
  "fluent",
  "honest",
  "fearless",
  "patient",
  "vivid",
  "gentle",
  "stoic",
  "iron",
  "stellar",
  "quiet",
  "fearsome",
  "merry",
  "rapid",
] as const;

const ANIMALS = [
  "otter",
  "fox",
  "falcon",
  "wolf",
  "deer",
  "hawk",
  "lion",
  "owl",
  "lynx",
  "tiger",
  "eagle",
  "bear",
  "panther",
  "heron",
  "raven",
  "stag",
  "puma",
  "jaguar",
  "kestrel",
  "marlin",
  "viper",
  "rhino",
  "moose",
  "cobra",
  "shark",
  "orca",
  "swan",
  "hare",
  "boar",
  "crane",
] as const;

function secureRandomInt(max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

export function generateRandomUsername(): string {
  const adj = ADJECTIVES[secureRandomInt(ADJECTIVES.length)];
  const animal = ANIMALS[secureRandomInt(ANIMALS.length)];
  const num = secureRandomInt(900) + 100;
  return `${adj}-${animal}-${num}`;
}

const MAX_USERNAME_RETRIES = 5;

interface AuditMetadata {
  ip?: string;
  userAgent?: string;
}

// Test-only hook to deterministically force a failure mid-transaction so we
// can verify rollback works. NOT used outside tests; in production we never
// pass this.
type FailurePoint = "athlete" | "profile" | "audit";

export interface RunSignupTransactionArgs {
  userId: string;
  audit?: AuditMetadata;
  /** Test-only: inject a synthetic failure after the named insert. */
  forceFailureAt?: FailurePoint;
  /** Test-only: override the random username generator (for deterministic collision tests). */
  usernameGenerator?: () => string;
}

export interface SignupTransactionResult {
  athleteId: string;
  username: string;
}

// Atomic: athlete + public profile + audit log all succeed, or none do.
// Username collisions retry up to MAX_USERNAME_RETRIES — Postgres raises a
// unique-violation (SQLSTATE 23505) which we catch and regenerate.
//
// A fresh WebSocket pool is acquired per call — Workers terminates idle
// sockets between requests, so module-scope reuse is unsafe — and disposed
// in the finally block.
export async function runSignupTransaction(args: RunSignupTransactionArgs): Promise<SignupTransactionResult> {
  const genUsername = args.usernameGenerator ?? generateRandomUsername;
  const { db: tx_db, end } = await createPool();

  try {
    return await tx_db.transaction(async (tx) => {
      let athleteId: string | undefined;
      let username: string | undefined;

      // 1. Athlete row with username retry on UNIQUE collision.
      for (let attempt = 0; attempt < MAX_USERNAME_RETRIES; attempt++) {
        const candidate = genUsername();
        try {
          const [row] = await tx
            .insert(athletes)
            .values({ userId: args.userId, username: candidate })
            .returning({ id: athletes.id });
          athleteId = row.id;
          username = candidate;
          break;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          // Username collided; try again.
        }
      }
      if (!athleteId || !username) {
        throw new Error(`Failed to allocate a unique username after ${MAX_USERNAME_RETRIES} attempts`);
      }

      if (args.forceFailureAt === "athlete") {
        throw new Error("forceFailureAt: athlete (test-only)");
      }

      // 2. Public profile (private by default; users opt-in later).
      await tx.insert(athletePublicProfiles).values({
        athleteId,
        publicSlug: username,
        isPublic: false,
      });

      if (args.forceFailureAt === "profile") {
        throw new Error("forceFailureAt: profile (test-only)");
      }

      // 3. Audit log entry for the signup.
      await tx.insert(auditLog).values({
        athleteId,
        actorUserId: args.userId,
        action: "USER_SIGNUP",
        entityType: "users",
        entityId: args.userId,
        ip: args.audit?.ip,
        userAgent: args.audit?.userAgent,
      });

      if (args.forceFailureAt === "audit") {
        throw new Error("forceFailureAt: audit (test-only)");
      }

      // 4. Provision the starter exercise catalogue (ADR-0020): copy every
      // global template (athlete_id IS NULL) into rows owned by the new
      // athlete, keeping the template lineage in source_exercise_id.
      await tx.execute(sql`
        INSERT INTO exercises (
          athlete_id, source_exercise_id, slug, name_pl, name_en, aliases, category,
          muscle_groups, is_unilateral, is_main_lift, is_loaded_bodyweight,
          default_unit, progression_rule_id
        )
        SELECT
          ${athleteId}, e.id, e.slug, e.name_pl, e.name_en, e.aliases, e.category,
          e.muscle_groups, e.is_unilateral, e.is_main_lift, e.is_loaded_bodyweight,
          e.default_unit, e.progression_rule_id
        FROM exercises e
        WHERE e.athlete_id IS NULL
      `);

      return { athleteId, username };
    });
  } finally {
    await end();
  }
}

// Postgres unique-violation error code per SQLSTATE.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}
