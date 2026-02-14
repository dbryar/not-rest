import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const DB_PATH = process.env.DATABASE_PATH || "./library.db";

// ── Data generators ──────────────────────────────────────────────────────

const TITLE_PREFIXES = [
  "The", "A", "Tales of", "Journey to", "Secrets of", "Beyond", "Under",
  "Through", "Lost in", "Return of", "Shadow of", "Rise of", "Fall of",
  "Song of", "Whispers of", "Echoes from", "Heart of", "Edge of",
  "Legend of", "Chronicles of",
];

const TITLE_CORES = [
  "Midnight", "Crystal", "Golden", "Silver", "Iron", "Crimson", "Azure",
  "Emerald", "Obsidian", "Amber", "Ivory", "Copper", "Jade", "Sapphire",
  "Ruby", "Onyx", "Pearl", "Coral", "Marble", "Platinum", "Velvet",
  "Scarlet", "Indigo", "Violet", "Cobalt", "Slate", "Opal", "Granite",
  "Cedar", "Willow",
];

const TITLE_SUFFIXES = [
  "Garden", "Kingdom", "Tower", "Forest", "River", "Mountain", "Valley",
  "Bridge", "Gate", "Storm", "Dawn", "Dusk", "Moon", "Sun", "Star",
  "Harbor", "Shore", "Island", "Prairie", "Canyon", "Reef", "Glacier",
  "Meadow", "Horizon", "Labyrinth", "Fortress", "Sanctuary", "Citadel",
  "Archive", "Threshold",
];

const STANDALONE_TITLES = [
  "Recursion", "Annihilation", "Blindsight", "Neuromancer", "Beloved",
  "Middlemarch", "Persuasion", "Solaris", "Hyperion", "Foundation",
  "Dune", "Fahrenheit 451", "Beloved", "Circe", "Pachinko",
  "Atonement", "Americanah", "Hamnet", "Shuggie Bain", "Klara and the Sun",
  "Piranesi", "Bewilderment", "Matrix", "Cloud Cuckoo Land", "Detransition Baby",
  "The Vanishing Half", "Interior Chinatown", "Deacon King Kong", "Transcendent Kingdom",
  "Mexican Gothic", "The Invisible Life of Addie LaRue", "The Midnight Library",
  "Project Hail Mary", "The Thursday Murder Club", "Anxious People",
  "The Push", "Malibu Rising", "Great Circle", "The Lincoln Highway",
  "Crossroads", "Harlem Shuffle", "Beautiful World Where Are You",
  "No One Is Talking About This", "The Love Songs of W.E.B. Du Bois",
  "The Sentence", "Cloud Atlas", "The Remains of the Day", "Never Let Me Go",
  "The Road", "Blood Meridian",
];

const FIRST_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Edward", "Fiona", "George", "Hannah",
  "Ivan", "Julia", "Karl", "Laura", "Marcus", "Nora", "Oscar", "Patricia",
  "Quinn", "Rachel", "Samuel", "Teresa", "Ursula", "Victor", "Wendy",
  "Xavier", "Yvonne", "Zachary", "Amelia", "Benjamin", "Catherine", "Daniel",
  "Elena", "Frederick", "Gloria", "Henry", "Isabelle", "James", "Katherine",
  "Leonard", "Margaret", "Nathan", "Olivia", "Philip", "Rosa", "Stephen",
  "Theresa", "Uma", "Vincent", "Wanda", "Yusuf", "Zara",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
  "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts",
];

const BOOK_TAGS = [
  "fiction", "non-fiction", "science-fiction", "fantasy", "mystery", "thriller",
  "romance", "historical", "biography", "memoir", "poetry", "drama",
  "horror", "adventure", "young-adult", "childrens", "classic", "contemporary",
  "literary", "graphic-novel", "dystopian", "magical-realism", "philosophy",
  "science", "technology", "self-help", "cooking", "travel", "art", "music",
];

const CD_ARTISTS = [
  "The Blue Notes", "Lunar Frequencies", "Aria Blackwood", "Digital Harvest",
  "The Analog Collective", "Midnight Revival", "Jasmine Okafor", "The Stonewall Five",
  "Neon Cathedral", "River Phoenix Quartet", "Echo Chamber", "The Vintage Sessions",
  "Solar Winds", "Acoustic Drift", "The Basement Tapes Ensemble", "Crimson Tide Orchestra",
  "Urban Decay", "The Wandering Bards", "Phantom Groove", "Celestial Noise",
];

const CD_TITLES = [
  "Frequencies", "Midnight Sessions", "Blue Hour", "Resonance", "After Dark",
  "Undercurrents", "Signal & Noise", "Daydreams", "Electric Meridian", "Slow Burn",
  "Northern Lights", "The Deep End", "Wayward", "Harmonic Drift", "Tidal",
  "Bloom", "Ember", "Static Haze", "Velvet Underground Sessions", "Chromatic",
];

const DVD_TITLES = [
  "The Last Frontier", "City of Echoes", "Parallel Lines", "Into the Storm",
  "The Observatory", "Night Watch", "Silver Linings", "The Architect",
  "Hidden Figures: Extended", "Beyond the Frame", "Reel Time", "Celluloid Dreams",
  "Director's Vision", "The Final Cut", "Montage", "Frame by Frame",
  "The Screening Room", "Cut to Black", "Rolling Credits", "The Premiere",
];

const DVD_DIRECTORS = [
  "Sarah Chen", "Marcus Webb", "Amira Hassan", "David Park", "Elena Volkov",
  "James Moriarty", "Priya Sharma", "Luis Mendez", "Claire Dubois", "Kenji Tanaka",
];

const BOARDGAME_NAMES = [
  "Settlers of the Isle", "Dominion of Cards", "Wingspan: Oceania", "Terraforming Worlds",
  "Azul: Summer Pavilion", "Spirit Island", "Pandemic Legacy", "Root",
  "Scythe", "Gloomhaven", "Ticket to Ride: Europe", "Catan: Starfarers",
  "Cascadia", "Everdell", "Ark Nova", "Brass: Birmingham",
  "The Crew", "Dune: Imperium", "Lost Ruins of Arnak", "Clank!",
];

const BOARDGAME_PUBLISHERS = [
  "Stonemaier Games", "Leder Games", "Jamey Stegmaier", "Czech Games Edition",
  "Dire Wolf Digital", "Next Move Games", "Greater Than Games", "Plan B Games",
  "Lookout Games", "Roxley Games",
];

const DESCRIPTIONS = [
  "A captivating exploration of human nature set against an unforgettable backdrop.",
  "Brilliantly crafted and deeply moving, this work redefines its genre.",
  "An ambitious and sprawling narrative that rewards patient readers.",
  "Praised by critics for its inventive storytelling and rich characters.",
  "A modern classic that speaks to the universal human experience.",
  "Thought-provoking and beautifully written, with unexpected depth.",
  "A gripping tale that keeps you turning pages late into the night.",
  "Winner of multiple awards, this is essential reading for any collection.",
  "Bold, imaginative, and unlike anything else on the shelves.",
  "A beloved favorite that continues to find new audiences year after year.",
  "Intricate world-building meets compelling character development.",
  "A tour de force that has inspired countless imitators.",
  "Lyrical prose and a haunting storyline make this an unforgettable read.",
  "Combines humor and heartbreak in equal measure.",
  "A page-turner with surprising intellectual depth.",
];

const ADJECTIVES_USERNAME = [
  "leaping", "clever", "swift", "gentle", "bold", "quiet", "bright", "daring",
  "eager", "happy", "lazy", "mighty", "noble", "proud", "wise", "calm",
  "fierce", "keen", "lively", "merry", "ancient", "brave", "cosmic", "dreamy",
  "electric", "frozen", "golden", "hidden", "iron", "jolly",
];

const ANIMALS_USERNAME = [
  "lizard", "falcon", "otter", "fox", "wolf", "bear", "hawk", "deer",
  "hare", "lynx", "crane", "eagle", "panda", "raven", "tiger", "whale",
  "koala", "moose", "robin", "shark", "badger", "bison", "coyote", "dolphin",
  "ferret", "gopher", "heron", "iguana", "jackal", "kiwi",
];

// ── Utility helpers ──────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a library card number in XXXX-XXXX-YY format:
 * 8 random digits followed by 2 letters derived from the username initials.
 */
function generateCardNumber(username: string): string {
  let digits = "";
  for (let i = 0; i < 8; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  const parts = username.split("-");
  const initials = (
    (parts[0]?.[0] || "X") + (parts[1]?.[0] || "X")
  ).toUpperCase();
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${initials}`;
}

function generateISBN(): string {
  // Generate a plausible ISBN-13
  let isbn = "978";
  for (let i = 0; i < 9; i++) {
    isbn += Math.floor(Math.random() * 10).toString();
  }
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return isbn + check.toString();
}

function generateBookTitle(): string {
  // 40% chance standalone title, 60% composed
  if (Math.random() < 0.4) {
    return pick(STANDALONE_TITLES);
  }
  return `${pick(TITLE_PREFIXES)} ${pick(TITLE_CORES)} ${pick(TITLE_SUFFIXES)}`;
}

function pastDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().split("T")[0]!;
}

// ── Seed function ────────────────────────────────────────────────────────

function seed() {
  const db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Apply schema
  const schema = readFileSync(
    join(dirname(new URL(import.meta.url).pathname), "schema.sql"),
    "utf-8"
  );
  db.exec(schema);

  // Check if already seeded
  const existingCount = (
    db.prepare("SELECT COUNT(*) as c FROM catalog_items").get() as { c: number }
  ).c;
  if (existingCount > 0) {
    console.log(`Database already contains ${existingCount} catalog items. Skipping seed.`);
    db.close();
    return;
  }

  console.log("Seeding database...");

  // ── Generate ~200 catalog items ──────────────────────────────────────

  const catalogItems: {
    id: string;
    type: string;
    title: string;
    creator: string;
    year: number;
    isbn: string | null;
    description: string;
    tags: string;
    totalCopies: number;
  }[] = [];

  // Add fixed test book for integration tests
  const TEST_BOOK_ID = "00000000-0000-0000-0000-000000000100";
  catalogItems.push({
    id: TEST_BOOK_ID,
    type: "book",
    title: "The Test Pattern Handbook",
    creator: "Demo Author",
    year: 2024,
    isbn: "9780000000001",
    description: "A test book for integration testing and agent demos. This book is always available for reservation.",
    tags: JSON.stringify(["test", "demo", "fiction"]),
    totalCopies: 5,
  });

  // 150 books
  const usedTitles = new Set<string>();
  for (let i = 0; i < 150; i++) {
    let title = generateBookTitle();
    while (usedTitles.has(title)) {
      title = generateBookTitle();
    }
    usedTitles.add(title);

    const author = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const year = randomInt(1920, 2025);
    const totalCopies = randomInt(1, 5);
    const tags = JSON.stringify(pickN(BOOK_TAGS, randomInt(1, 4)));

    catalogItems.push({
      id: crypto.randomUUID(),
      type: "book",
      title,
      creator: author,
      year,
      isbn: generateISBN(),
      description: pick(DESCRIPTIONS),
      tags,
      totalCopies,
    });
  }

  // 20 CDs
  for (let i = 0; i < 20; i++) {
    const totalCopies = randomInt(1, 3);
    catalogItems.push({
      id: crypto.randomUUID(),
      type: "cd",
      title: pick(CD_TITLES) + (i > 0 ? ` Vol. ${i}` : ""),
      creator: pick(CD_ARTISTS),
      year: randomInt(1990, 2025),
      isbn: null,
      description: pick(DESCRIPTIONS),
      tags: JSON.stringify(pickN(["jazz", "rock", "classical", "electronic", "folk", "blues", "pop", "indie", "ambient", "soul"], randomInt(1, 3))),
      totalCopies,
    });
  }

  // 15 DVDs
  for (let i = 0; i < 15; i++) {
    const totalCopies = randomInt(1, 3);
    catalogItems.push({
      id: crypto.randomUUID(),
      type: "dvd",
      title: pick(DVD_TITLES) + (i > 0 ? ` (${randomInt(2010, 2025)})` : ""),
      creator: pick(DVD_DIRECTORS),
      year: randomInt(2000, 2025),
      isbn: null,
      description: pick(DESCRIPTIONS),
      tags: JSON.stringify(pickN(["drama", "comedy", "documentary", "action", "sci-fi", "thriller", "indie", "foreign", "animation", "horror"], randomInt(1, 3))),
      totalCopies,
    });
  }

  // 15 Board games
  for (let i = 0; i < 15; i++) {
    const totalCopies = randomInt(1, 2);
    catalogItems.push({
      id: crypto.randomUUID(),
      type: "boardgame",
      title: pick(BOARDGAME_NAMES) + (i > 10 ? ` (${randomInt(2, 5)}th Ed.)` : ""),
      creator: pick(BOARDGAME_PUBLISHERS),
      year: randomInt(2015, 2025),
      isbn: null,
      description: pick(DESCRIPTIONS),
      tags: JSON.stringify(pickN(["strategy", "cooperative", "family", "party", "deck-building", "euro", "worker-placement", "legacy", "competitive", "solo"], randomInt(1, 3))),
      totalCopies,
    });
  }

  // Insert catalog items
  const insertItem = db.prepare(
    `INSERT INTO catalog_items (id, type, title, creator, year, isbn, description, tags, available, total_copies, available_copies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  db.exec("BEGIN TRANSACTION");
  for (const item of catalogItems) {
    insertItem.run(
      item.id,
      item.type,
      item.title,
      item.creator,
      item.year,
      item.isbn,
      item.description,
      item.tags,
      item.totalCopies,
      item.totalCopies // available_copies starts at total_copies
    );
  }
  db.exec("COMMIT");

  console.log(`  Inserted ${catalogItems.length} catalog items`);

  // ── Generate ~50 patrons ─────────────────────────────────────────────

  interface Patron {
    id: string;
    username: string;
    name: string;
    cardNumber: string;
  }

  const patrons: Patron[] = [];
  const usedUsernames = new Set<string>();

  // Add fixed test user for integration tests and agent demos
  // Card number: 0000-0000-TP (deterministic for testing)
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
  patrons.push({
    id: TEST_USER_ID,
    username: "test-patron",
    name: "Test Patron",
    cardNumber: "0000-0000-TP",
  });
  usedUsernames.add("test-patron");

  // Generate remaining 49 random patrons
  for (let i = 0; i < 49; i++) {
    let username = `${pick(ADJECTIVES_USERNAME)}-${pick(ANIMALS_USERNAME)}`;
    while (usedUsernames.has(username)) {
      username = `${pick(ADJECTIVES_USERNAME)}-${pick(ANIMALS_USERNAME)}`;
    }
    usedUsernames.add(username);

    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const cardNumber = generateCardNumber(username);

    patrons.push({
      id: crypto.randomUUID(),
      username,
      name,
      cardNumber,
    });
  }

  const insertPatron = db.prepare(
    `INSERT INTO patrons (id, username, name, card_number, created_at, is_seed)
     VALUES (?, ?, ?, ?, ?, 1)`
  );

  db.exec("BEGIN TRANSACTION");
  for (const patron of patrons) {
    const createdDaysAgo = randomInt(30, 365);
    insertPatron.run(
      patron.id,
      patron.username,
      patron.name,
      patron.cardNumber,
      pastDate(createdDaysAgo)
    );
  }
  db.exec("COMMIT");

  console.log(`  Inserted ${patrons.length} patrons`);

  // ── Generate ~5000 lending records ───────────────────────────────────

  // Track currently checked out copies per item: item_id -> count
  const checkedOut = new Map<string, number>();

  const insertLending = db.prepare(
    `INSERT INTO lending_history (id, item_id, patron_id, patron_name, checkout_date, due_date, return_date, days_late, is_seed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );

  // Track which patrons have overdue items
  const patronOverdueCount = new Map<string, number>();
  for (const patron of patrons) {
    patronOverdueCount.set(patron.id, 0);
  }

  db.exec("BEGIN TRANSACTION");

  let lendingCount = 0;

  // First, ensure every patron gets at least 2 overdue items
  for (const patron of patrons) {
    const overdueCount = randomInt(2, 4);
    const availableItems = catalogItems.filter((item) => {
      const current = checkedOut.get(item.id) ?? 0;
      return current < item.totalCopies;
    });

    const overdueItems = pickN(availableItems, Math.min(overdueCount, availableItems.length));

    for (const item of overdueItems) {
      const daysAgo = randomInt(20, 60);
      const checkoutDate = pastDate(daysAgo);
      const dueDateObj = new Date(Date.now() - (daysAgo - 14) * 86400000);
      const dueDate = dueDateObj.toISOString().split("T")[0]!;

      insertLending.run(
        crypto.randomUUID(),
        item.id,
        patron.id,
        patron.name,
        checkoutDate,
        dueDate,
        null, // not returned
        0,
        );

      checkedOut.set(item.id, (checkedOut.get(item.id) ?? 0) + 1);
      patronOverdueCount.set(patron.id, (patronOverdueCount.get(patron.id) ?? 0) + 1);
      lendingCount++;
    }
  }

  // Now generate the remaining lending records (~4800 returned records) spread across patrons
  const targetTotal = 5000;
  const remaining = targetTotal - lendingCount;

  for (let i = 0; i < remaining; i++) {
    const patron = pick(patrons);
    const item = pick(catalogItems);

    const daysAgo = randomInt(1, 365);
    const checkoutDate = pastDate(daysAgo);
    const dueDateDaysAgo = daysAgo - 14;
    const dueDate = pastDate(Math.max(dueDateDaysAgo, 0));

    // Most historical records are returned
    const isReturned = Math.random() < 0.95;

    if (isReturned) {
      // Returned: pick a return date after checkout but possibly after due
      const checkoutDaysAgo = daysAgo;
      const returnDaysAgo = randomInt(0, checkoutDaysAgo - 1);
      const returnDate = pastDate(Math.max(returnDaysAgo, 0));

      // Calculate days late
      const dueMs = new Date(dueDate).getTime();
      const returnMs = new Date(returnDate).getTime();
      const daysLate = Math.max(0, Math.floor((returnMs - dueMs) / 86400000));

      insertLending.run(
        crypto.randomUUID(),
        item.id,
        patron.id,
        patron.name,
        checkoutDate,
        dueDate,
        returnDate,
        daysLate,
      );
    } else {
      // Still checked out -- only if copies available
      const current = checkedOut.get(item.id) ?? 0;
      if (current < item.totalCopies) {
        insertLending.run(
          crypto.randomUUID(),
          item.id,
          patron.id,
          patron.name,
          checkoutDate,
          dueDate,
          null,
          0,
        );
        checkedOut.set(item.id, current + 1);
      } else {
        // All copies checked out -- make it a returned record instead
        const returnDaysAgo = randomInt(0, Math.max(daysAgo - 1, 0));
        const returnDate = pastDate(Math.max(returnDaysAgo, 0));
        const dueMs = new Date(dueDate).getTime();
        const returnMs = new Date(returnDate).getTime();
        const daysLate = Math.max(0, Math.floor((returnMs - dueMs) / 86400000));

        insertLending.run(
          crypto.randomUUID(),
          item.id,
          patron.id,
          patron.name,
          checkoutDate,
          dueDate,
          returnDate,
          daysLate,
        );
      }
    }

    lendingCount++;
  }

  db.exec("COMMIT");

  console.log(`  Inserted ${lendingCount} lending records`);

  // ── Update available_copies based on checked-out records ──────────────

  db.exec(`
    UPDATE catalog_items SET
      available_copies = total_copies - COALESCE(
        (SELECT COUNT(*) FROM lending_history
         WHERE item_id = catalog_items.id AND return_date IS NULL), 0
      ),
      available = CASE
        WHEN total_copies - COALESCE(
          (SELECT COUNT(*) FROM lending_history
           WHERE item_id = catalog_items.id AND return_date IS NULL), 0
        ) > 0 THEN 1 ELSE 0
      END
  `);

  console.log("  Updated available_copies for all catalog items");

  // Verify overdue counts
  const overdueVerify = db
    .prepare(
      `SELECT p.username, COUNT(*) as overdue_count
       FROM patrons p
       JOIN lending_history lh ON lh.patron_id = p.id
       WHERE lh.return_date IS NULL AND lh.due_date < date('now')
       GROUP BY p.id
       HAVING overdue_count < 2`
    )
    .all() as { username: string; overdue_count: number }[];

  if (overdueVerify.length > 0) {
    console.warn(`  WARNING: ${overdueVerify.length} patrons have fewer than 2 overdue items`);
  } else {
    console.log("  Verified: all patrons have at least 2 overdue items");
  }

  db.close();
}

if (import.meta.main) {
  seed();
  console.log("Seed complete");
}

export { seed };
