import "server-only";

import { getDb } from "../index";
import type { Workspace } from "@/lib/types";

interface WorkspaceRow {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorkspaces(): Workspace[] {
  const rows = getDb()
    .prepare(
      "SELECT id, name, slug, created_at, updated_at FROM workspaces ORDER BY id"
    )
    .all() as WorkspaceRow[];
  return rows.map(mapRow);
}

export function getWorkspace(id: number): Workspace | null {
  const row = getDb()
    .prepare(
      "SELECT id, name, slug, created_at, updated_at FROM workspaces WHERE id = ?"
    )
    .get(id) as WorkspaceRow | undefined;
  return row ? mapRow(row) : null;
}

export function countWorkspaces(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM workspaces")
    .get() as { count: number };
  return row.count;
}

// Cumulative seed list reflecting migrations 001 + 006 (removed "Other")
// + 008 (added "Salary", kind column) + 010 (brighter colors)
// + 011 (added 7 more) + 014 (Sports & Hobbies + descriptions). Keep in sync.
interface SeedCategory {
  name: string;
  color: string;
  icon: string;
  kind: "expense" | "income";
  description: string;
}

const SEED_CATEGORIES: SeedCategory[] = [
  { name: "Groceries", color: "#81B482", icon: "shopping-basket", kind: "expense", description: "Supermarkets, grocery stores, food markets (Shufersal, Rami Levy, Yochananof, Victory, Tiv Taam, Mahane Yehuda vendors). NOT restaurants or prepared meals." },
  { name: "Restaurants", color: "#E89B80", icon: "utensils-crossed", kind: "expense", description: "Sit-down restaurants, takeout, food delivery (Wolt, 10bis when itemized as restaurants), bars and pubs. NOT cafes for daily coffee (Coffee & Cafes) and NOT groceries." },
  { name: "Transport", color: "#65AFD2", icon: "tram-front", kind: "expense", description: "Public transport (Rav-Kav, Israel Railways), taxis (Gett, Yango), ride-share, fuel stations, parking, car washes, tolls. NOT car insurance (Insurance) and NOT travel airfare (Travel)." },
  { name: "Shopping", color: "#DCB87A", icon: "shopping-bag", kind: "expense", description: "General retail, clothing, electronics, household goods (Zara, H&M, IKEA, KSP, Castro). NOT groceries and NOT hobby-specific shops (Sports & Hobbies)." },
  { name: "Entertainment", color: "#E499A4", icon: "ticket", kind: "expense", description: "Cinemas, concerts, theater, museums, streaming events, gaming purchases, amusement parks. NOT subscription services (Subscriptions) and NOT sports/hobby activities (Sports & Hobbies)." },
  { name: "Health", color: "#75BCA3", icon: "heart-pulse", kind: "expense", description: "Pharmacies, doctors, dentists, clinics, lab tests, medical equipment, optical (Super-Pharm, Be Pharm, Clalit, Maccabi private clinics). NOT health insurance premiums (Insurance) and NOT gym memberships (Sports & Hobbies)." },
  { name: "Education", color: "#94A0DD", icon: "graduation-cap", kind: "expense", description: "Schools, universities, tuition, online courses (Coursera, Udemy, MasterClass), textbooks, school supplies, exam fees. NOT shooting ranges, gun training, or martial-arts classes (Sports & Hobbies) and NOT music lessons for fun (Sports & Hobbies)." },
  { name: "Bills & Utilities", color: "#B8A98F", icon: "receipt", kind: "expense", description: "Electricity, water, gas, internet, phone bills, municipal arnona, building vaad bayit. NOT streaming or software subscriptions (Subscriptions)." },
  { name: "Subscriptions", color: "#AB9DDB", icon: "refresh-cw", kind: "expense", description: "Recurring digital services: Netflix, Spotify, YouTube Premium, iCloud, Google One, SaaS tools, news subscriptions. NOT physical utility bills (Bills & Utilities)." },
  { name: "Travel", color: "#64B8D2", icon: "plane", kind: "expense", description: "Flights, hotels, Airbnb, vacation rentals, travel agencies, foreign-currency lodging, car rentals abroad. NOT daily transport (Transport)." },
  { name: "Cash & ATM", color: "#DBC27F", icon: "banknote", kind: "expense", description: "ATM withdrawals, cash advances, currency exchange. Often labeled bankomat / כספומט." },
  { name: "Transfers", color: "#A2AAC2", icon: "arrow-left-right", kind: "expense", description: "Bank-to-bank transfers, Bit/PayBox to people, internal moves." },
  { name: "Insurance", color: "#E59A99", icon: "shield", kind: "expense", description: "Car, home, health, life insurance premiums, leumit/menora/clal/migdal insurance lines. NOT medical visit copays (Health)." },
  { name: "Home", color: "#D3A96F", icon: "home", kind: "expense", description: "Furniture, appliances, repairs, hardware, gardening, home services (cleaners, handymen). NOT rent and NOT utilities." },
  { name: "Personal Care", color: "#D5A4D7", icon: "sparkles", kind: "expense", description: "Hair salons, barbershops, beauty, nails, spa, cosmetics (Sephora). NOT gyms (Sports & Hobbies)." },
  { name: "Coffee & Cafes", color: "#A57B5B", icon: "coffee", kind: "expense", description: "Coffee shops, cafes, bakeries, daily coffee runs (Aroma, Cafelix, Greg, Cofix). NOT restaurants." },
  { name: "Pet Care", color: "#6EBFB5", icon: "paw-print", kind: "expense", description: "Vet, pet food, pet supplies, pet grooming, pet boarding. NOT general food shopping." },
  { name: "Gifts & Donations", color: "#D67BAA", icon: "gift", kind: "expense", description: "Charitable donations, gift purchases for others, tithing, fundraising contributions." },
  { name: "Kids & Childcare", color: "#E5D080", icon: "baby", kind: "expense", description: "Daycare, babysitters, after-school programs, kids' clothing/toys when clearly child-specific." },
  { name: "Sports & Hobbies", color: "#7BB36B", icon: "dumbbell", kind: "expense", description: "Gyms, sports clubs, fitness studios, shooting ranges (מטווח/מטווחי), martial arts, climbing walls, hobby shops, craft supplies, musical instrument lessons, sports gear. NOT general entertainment." },
  { name: "Salary", color: "#85B59A", icon: "briefcase", kind: "income", description: "Regular wage payments from employer (משכורת, שכר)." },
  { name: "Freelance & Side Income", color: "#C0D582", icon: "briefcase", kind: "income", description: "Invoices paid by clients, side-gig deposits, consulting fees." },
  { name: "Investment Income", color: "#7B85C9", icon: "trending-up", kind: "income", description: "Dividends, interest, stock sale proceeds, crypto sale proceeds." },
  { name: "Refunds & Reimbursements", color: "#7DC8B3", icon: "rotate-ccw", kind: "income", description: "Returns, expense reimbursements, insurance payouts, refunds from cancellations." },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  let n = 2;
  while (
    (db
      .prepare("SELECT 1 FROM workspaces WHERE slug = ?")
      .get(candidate) as { 1: number } | undefined)
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function createWorkspace(name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  if (trimmed.length > 60) throw new Error("Workspace name too long");

  const db = getDb();
  const slug = uniqueSlug(slugify(trimmed));

  const create = db.transaction(() => {
    const result = db
      .prepare(
        "INSERT INTO workspaces (name, slug) VALUES (?, ?)"
      )
      .run(trimmed, slug);
    const id = Number(result.lastInsertRowid);

    const insertCat = db.prepare(
      "INSERT INTO categories (workspace_id, name, color, icon, kind, description) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const c of SEED_CATEGORIES) {
      insertCat.run(id, c.name, c.color, c.icon, c.kind, c.description);
    }
    return id;
  });

  const id = create();
  const row = getWorkspace(id);
  if (!row) throw new Error("Workspace creation failed");
  return row;
}

export function updateWorkspace(id: number, name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  if (trimmed.length > 60) throw new Error("Workspace name too long");

  const db = getDb();
  const existing = getWorkspace(id);
  if (!existing) throw new Error("Workspace not found");

  let slug = existing.slug;
  if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
    slug = uniqueSlug(slugify(trimmed));
  }

  db.prepare(
    "UPDATE workspaces SET name = ?, slug = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(trimmed, slug, id);

  const updated = getWorkspace(id);
  if (!updated) throw new Error("Workspace update failed");
  return updated;
}

export function deleteWorkspace(id: number): void {
  if (countWorkspaces() <= 1) {
    throw new Error("Cannot delete the only workspace");
  }
  getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}
