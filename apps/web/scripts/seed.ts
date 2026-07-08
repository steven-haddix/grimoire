/**
 * Seed a demo campaign — "The Ashes of Barrowmoor" — with three completed
 * sessions (transcripts + summaries), players, a tracked entity graph, and
 * campaign memories, then build the search index for all of it. Gives the web
 * UI and the Ask Grimoire chat something real to answer questions about.
 *
 * Safe to re-run: an existing campaign with the same name and guild is
 * replaced wholesale.
 *
 * Requires DATABASE_URL (see docker-compose.yml for a local Postgres) and the
 * Discord server id of a guild you admin — campaign pages are only visible to
 * admins of the campaign's guild:
 *
 *   GUILD_ID=<discord server id> bun db:seed
 *   # or: bun apps/web/scripts/seed.ts --guild <discord server id>
 *
 * Without OPENAI_API_KEY the search index is keyword-only (no embeddings);
 * re-run scripts/backfill-search-index.ts later to add semantic vectors.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  botGuilds,
  campaigns,
  entities,
  entityAliases,
  entityFacts,
  memories,
  players,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { indexAllEntities } from "@/lib/extraction/indexing";
import { embeddingsEnabled } from "@/lib/search/embeddings";
import { indexMemory, indexSession } from "@/lib/search/indexer";

const CAMPAIGN_NAME = "The Ashes of Barrowmoor";
const CAMPAIGN_DESCRIPTION =
  "A low-level mystery in the fen town of Barrowmoor, where something beneath " +
  "the grave-mounds has started singing and the grave-tenders keep going missing.";
const CHANNEL_ID = "910000000000000001";

const DM = { name: "DM", discordUserId: "210000000000000000" };
const PLAYERS = [
  { name: "Maya", discordUserId: "210000000000000001", pc: "Wren Underbough" },
  {
    name: "Rob",
    discordUserId: "210000000000000002",
    pc: "Thaldrin Emberforge",
  },
  { name: "Priya", discordUserId: "210000000000000003", pc: "Skamos" },
] as const;

type Line = { speaker: string; content: string };

// Three completed sessions, oldest first. Timestamps are assigned relative to
// "now" at seed time so the campaign always looks recently played.
const SESSION_DATA: Array<{ daysAgo: number; lines: Line[]; summary: string }> =
  [
    {
      daysAgo: 21,
      lines: [
        {
          speaker: "DM",
          content:
            "You crest the causeway at dusk. Barrowmoor sits low in the fen — peat smoke, leaning fences, and beyond the town wall, hundreds of grave-mounds under a grey sky.",
        },
        {
          speaker: "Maya",
          content: "Wren checks the gate. Anyone watching us come in?",
        },
        {
          speaker: "DM",
          content:
            "Two militia in oiled cloaks — Barrow Wardens, by the standing-stone badge. They wave you through but take a long look at your weapons.",
        },
        {
          speaker: "Rob",
          content:
            "Thaldrin gives them a nod. We head for an inn. Which one looks least likely to poison us?",
        },
        {
          speaker: "DM",
          content:
            "The Drowned Rat. A stuffed rat in a tiny rowboat hangs over the door. Inside, the innkeeper — a broad woman with grey braids — is arguing a Warden out of his tab.",
        },
        {
          speaker: "Priya",
          content:
            "Skamos orders the darkest thing they have and asks her name.",
        },
        {
          speaker: "DM",
          content:
            "'Marta,' she says. 'Marta Hollis. And whatever you've heard about rooms being free for heroes, it's a lie.'",
        },
        {
          speaker: "Maya",
          content: "I ask about work. Rumors, bounties, anything.",
        },
        {
          speaker: "DM",
          content:
            "Marta leans in. Three grave-tenders have gone missing from the barrow field this month. The Wardens say wolves. Marta says wolves don't take lanterns and leave the dogs.",
        },
        {
          speaker: "Rob",
          content:
            "Missing grave-tenders. Thaldrin doesn't like that at all. Who pays if we look into it?",
        },
        {
          speaker: "DM",
          content:
            "That would be Aldous Crane, the grave-keeper — the thin fellow in the corner nursing a cider who has been listening this whole time. He offers forty gold a head for his missing tenders, or proof of what took them.",
        },
        {
          speaker: "Priya",
          content:
            "Skamos toasts the deal, loudly, 'to the wolves of Barrowmoor.' Do any Wardens react?",
        },
        {
          speaker: "DM",
          content:
            "One stands up. Sergeant Brasha — she calls Skamos a fen-blown fraud, and it goes downhill from there. Everyone give me initiative.",
        },
        {
          speaker: "Priya",
          content:
            "Starting a brawl within one hour of arriving. New record. Skamos rolled a 17.",
        },
        {
          speaker: "DM",
          content:
            "The brawl is short and mostly embarrassing. A table dies. Marta ends it with a soup ladle and bans Skamos from sitting near the hearth.",
        },
        {
          speaker: "Maya",
          content:
            "While everyone's distracted, Wren lifts the sergeant's coin purse. Sleight of hand: 19.",
        },
        {
          speaker: "DM",
          content:
            "Twelve silver, and a bone whistle carved like a bird. Curious thing for a soldier to carry.",
        },
        {
          speaker: "Rob",
          content:
            "Thaldrin pays Marta for the table and gets us rooms. We start at the barrow field at first light.",
        },
      ],
      summary: [
        "What happened: The party arrived in Barrowmoor and took rooms at the Drowned Rat, where innkeeper Marta Hollis pointed them at real work: three grave-tenders have vanished from the barrow field this month, and the Barrow Wardens' wolf story doesn't hold up. Grave-keeper Aldous Crane hired the party — forty gold a head — to find his missing tenders or proof of what took them.",
        "Combat: One tavern brawl, provoked by Skamos toasting 'the wolves of Barrowmoor' within earshot of Sergeant Brasha. Casualties: one table. Marta ended it with a soup ladle and banned Skamos from the hearth.",
        "Loot & threads: Wren pickpocketed 12 silver and a bone whistle carved like a bird from Sergeant Brasha — why does a Warden carry that? The Wardens are prickly about the barrows. The job starts at first light.",
      ].join("\n\n"),
    },
    {
      daysAgo: 14,
      lines: [
        {
          speaker: "DM",
          content:
            "First light over the barrow field, fog to your knees. Aldous walks you past the newer mounds toward Old Bell Barrow — the big one with the collapsed top.",
        },
        {
          speaker: "Rob",
          content:
            "Thaldrin checks the older graves as we pass. Any signs of digging?",
        },
        {
          speaker: "DM",
          content:
            "Not digging out — digging in. Three mounds have neat tunnels cut into their sides, spoil stacked like someone tidy did it.",
        },
        {
          speaker: "Maya",
          content: "Wren scouts the nearest tunnel with a hooded lantern.",
        },
        { speaker: "DM", content: "Wren — dexterity save, please." },
        { speaker: "Maya", content: "…that's a 4." },
        {
          speaker: "DM",
          content:
            "The tunnel floor gives and you slide into the dark. Ghouls — four of them — unfold from the walls like wet leather. Initiative.",
        },
        {
          speaker: "Priya",
          content:
            "Skamos drops an eldritch blast down the hole after her. 22 to hit, 11 damage.",
        },
        {
          speaker: "DM",
          content:
            "The first ghoul comes apart. But the flare catches Aldous's supply wagon at the tunnel mouth — canvas, lamp oil, the works. It goes up like a festival.",
        },
        {
          speaker: "Priya",
          content: "I want it noted the wagon was parked irresponsibly.",
        },
        {
          speaker: "Rob",
          content:
            "Thaldrin jumps down after Wren, shield first, and presents his holy symbol. Turn undead, DC 15.",
        },
        {
          speaker: "DM",
          content:
            "Two ghouls flee shrieking into a side passage; Wren opens the last one up like a letter. The tunnel keeps going — down, under Old Bell Barrow.",
        },
        { speaker: "Maya", content: "We follow it." },
        {
          speaker: "DM",
          content:
            "It ends at a stone door carved with rows of singing mouths, water sheeting under it. Beyond, faintly, you hear a choir. There's a chapel down there.",
        },
        {
          speaker: "Rob",
          content: "Before we open anything, Thaldrin searches the antechamber.",
        },
        {
          speaker: "DM",
          content:
            "You find a bronze bell the size of a helmet, silvered at the rim, stamped with the Wardens' standing-stone ring. Your religion check says it's a Vesper Bell — its toll puts the restless dead down for a night.",
        },
        {
          speaker: "Maya",
          content: "We are absolutely taking the magic bell.",
        },
        {
          speaker: "DM",
          content:
            "Back on the surface, the wagon is a charcoal sketch of itself and Aldous is doing sums out loud. Marta's cellar stock was on it — potions she meant to sell you at cost.",
        },
        { speaker: "Priya", content: "How much do I owe." },
        {
          speaker: "DM",
          content:
            "Fifteen gold, says Marta later, with a look that could pickle eggs. She still sells Wren three healing potions for fifty gold — which Wren does not have.",
        },
        {
          speaker: "Maya",
          content:
            "Wren borrows 50 gold from Thaldrin for the potions. I'm writing it down. He's writing it down. Everyone is writing it down.",
        },
        {
          speaker: "DM",
          content:
            "You camp at the tunnel mouth. Through the stone door, all night, the choir keeps singing. We'll open it next week.",
        },
      ],
      summary: [
        "What happened: Aldous led the party to the barrow field, where three mounds had been tunneled INTO, not out of. Wren fell into a ghoul den under Old Bell Barrow; the fight ended at a stone door carved with singing mouths — a flooded chapel lies beyond, and something down there sings all night. In the antechamber the party recovered a silvered Vesper Bell, whose toll is said to put the restless dead down for a night.",
        "Combat: Four ghouls in the collapsed tunnel. Thaldrin's turn undead routed two; no serious injuries except Wren's pride (a natural 4 on the dexterity save that started it).",
        "Loot & threads: The Vesper Bell (silvered, Warden-stamped — why was it buried?). Skamos's stray eldritch blast burned Aldous's supply wagon with Marta's potion stock aboard — Skamos owes Marta 15 gold. Wren borrowed 50 gold from Thaldrin for healing potions. The stone door and its choir wait.",
      ].join("\n\n"),
    },
    {
      daysAgo: 7,
      lines: [
        {
          speaker: "DM",
          content:
            "The stone door swings on hidden counterweights. The Sunken Chapel: a drowned nave, pews rotted to ribs, and in the choir loft — the dead. A dozen corpses stand in rows, mouths moving in perfect unison.",
        },
        { speaker: "Priya", content: "Skamos looks for the conductor." },
        {
          speaker: "DM",
          content:
            "At the altar, a gaunt figure in a rotted cassock keeps time with a femur baton. The Pale Chorister. Its skin is like candle drippings, and it does not stop conducting when it looks at you.",
        },
        {
          speaker: "Rob",
          content:
            "Thaldrin sets the Vesper Bell on a pew and readies to strike it. 'One hymn, on my signal.'",
        },
        {
          speaker: "Maya",
          content:
            "Wren sneaks along the flooded aisle toward the loft. Stealth 23.",
        },
        {
          speaker: "DM",
          content:
            "The Chorister flicks its baton and the choir's song sharpens into a wail — necrotic, 18 damage to Skamos and Thaldrin, constitution save for half.",
        },
        {
          speaker: "Priya",
          content:
            "Saved, 9 damage. Skamos answers with hunger of Hadar centered on the loft.",
        },
        {
          speaker: "DM",
          content:
            "Half the choir drowns in the dark. The Chorister snarls — the first sound it's made — and the barrow-mounds above you begin to thump like drums.",
        },
        { speaker: "Rob", content: "NOW. Thaldrin rings the bell." },
        {
          speaker: "DM",
          content:
            "The toll goes through the water and the stone and your teeth. Every corpse in the loft drops like a cut puppet, the drumming above stops, and the Chorister staggers, half its face sloughing.",
        },
        {
          speaker: "Maya",
          content:
            "Wren's been waiting for exactly this. Sneak attack with the silvered dagger — 28 to hit, 31 damage.",
        },
        {
          speaker: "DM",
          content:
            "You put the dagger through its collarbone and it tears itself off the blade, leaving the arm behind. Clutching a waterlogged book — the cover reads 'Litany of Hollow Songs' — it pours itself through a drain grate like smoke.",
        },
        { speaker: "Priya", content: "We chase it!" },
        {
          speaker: "DM",
          content:
            "The grate drops into flooded crypts running every direction. It's gone — for now. But on the altar you find its ledger: the names of the missing grave-tenders, with payments. Signed for by Aldous Crane.",
        },
        {
          speaker: "Rob",
          content: "Aldous sold his own people to that thing?!",
        },
        {
          speaker: "DM",
          content:
            "When you surface, his cottage is empty — hearth cold, a half-packed bag abandoned. The Wardens put a price on his head by nightfall, and Sergeant Brasha buys the party's first round at the Drowned Rat. Marta nearly faints.",
        },
        {
          speaker: "Maya",
          content:
            "Session ledger: rich in reputation, 65 gold in debt between us.",
        },
        {
          speaker: "DM",
          content:
            "The Pale Chorister is still out there — one-armed, furious, and holding the Litany. The choir will re-form. That's where we pick up next time.",
        },
      ],
      summary: [
        "What happened: The party opened the stone door into the Sunken Chapel and found the Pale Chorister — an undead choirmaster conducting a choir of the missing dead. Thaldrin's toll of the Vesper Bell dropped the corpse-choir mid-hymn; Wren's silvered dagger took the Chorister's arm, but it escaped into the flooded crypts with the 'Litany of Hollow Songs'. Its altar ledger named every missing grave-tender — with payments signed for by Aldous Crane, who fled town before nightfall.",
        "Combat: The corpse choir's massed wail hit hard (18 necrotic) before the Vesper Bell silenced it. Skamos's hunger of Hadar erased half the loft; the Chorister survived a 31-damage sneak attack by self-amputating and fleeing.",
        "Loot & threads: The Chorister's ledger implicating Aldous Crane (now a fugitive with a Warden bounty). The Vesper Bell proved itself. The Chorister escaped with the Litany and will rebuild its choir. Sergeant Brasha is suddenly friendly. Party debts stand: Wren owes Thaldrin 50 gold, Skamos owes Marta 15 gold.",
      ].join("\n\n"),
    },
  ];

const MEMORY_DATA: Array<{ category: string; content: string }> = [
  {
    category: "rule",
    content:
      "House rule: a natural 1 on an attack roll draws from the DM's mishap deck.",
  },
  {
    category: "character",
    content:
      "Skamos owes Marta Hollis 15 gold for the supply wagon (and her potion stock) his eldritch blast burned at the barrow field.",
  },
  {
    category: "character",
    content:
      "Wren owes Thaldrin 50 gold, borrowed to buy healing potions from Marta before the Sunken Chapel.",
  },
  {
    category: "lore",
    content:
      "The Vesper Bell's toll forces the restless dead back to stillness for a night. It bears the Barrow Wardens' standing-stone mark, but it was found buried in the antechamber of the Sunken Chapel.",
  },
  {
    category: "meta",
    content:
      "The table plays Thursdays at 7pm. Priya is out the first week of each month.",
  },
];

// Entity graph: identity + aliases + append-only facts, mirroring what the
// session-end extraction pipeline would have produced. `lastSeen` is an index
// into SESSION_DATA. `player` links a PC to the human who plays it.
const ENTITY_DATA: Array<{
  type: "pc" | "npc" | "faction" | "location";
  name: string;
  player?: string;
  aliases?: string[];
  lastSeen?: number;
  facts: Record<string, string>;
}> = [
  {
    type: "pc",
    name: "Wren Underbough",
    player: "Maya",
    aliases: ["Wren"],
    lastSeen: 2,
    facts: {
      description:
        "Quick-fingered halfling rogue and scout; keeps a meticulous ledger of who owes whom.",
      class: "Rogue (halfling)",
      status: "Alive and insufferably pleased about the chapel fight",
      debts: "Owes Thaldrin 50 gold for healing potions",
      notable_deed:
        "Took the Pale Chorister's arm with a silvered-dagger sneak attack in the Sunken Chapel",
    },
  },
  {
    type: "pc",
    name: "Thaldrin Emberforge",
    player: "Rob",
    aliases: ["Thaldrin", "Thal Drin"],
    lastSeen: 2,
    facts: {
      description:
        "Dwarf cleric of Moradin; the party's shield, conscience, and reluctant banker.",
      class: "Cleric (dwarf)",
      status: "Alive",
      goal: "Cleanse the Sunken Chapel and lay the barrow dead to rest",
      notable_deed:
        "Rang the Vesper Bell mid-battle, dropping the corpse choir in one toll",
    },
  },
  {
    type: "pc",
    name: "Skamos",
    player: "Priya",
    aliases: [],
    lastSeen: 2,
    facts: {
      description:
        "Tiefling warlock with excellent aim and catastrophic judgment about what is behind his targets.",
      class: "Warlock (tiefling)",
      status: "Alive; banned from sitting near the hearth at the Drowned Rat",
      debts: "Owes Marta Hollis 15 gold for the burned supply wagon",
      reputation:
        "Started a tavern brawl within an hour of first arriving in Barrowmoor",
    },
  },
  {
    type: "npc",
    name: "Marta Hollis",
    aliases: ["Marta", "the innkeeper"],
    lastSeen: 2,
    facts: {
      description:
        "Innkeeper of the Drowned Rat in Barrowmoor; grey braids, soup ladle, zero patience for heroics.",
      status: "Alive",
      last_known_location: "The Drowned Rat, Barrowmoor",
      relationships:
        "Owed 15 gold by Skamos; first pointed the party at the missing grave-tenders",
    },
  },
  {
    type: "npc",
    name: "Aldous Crane",
    aliases: ["Aldous", "the grave-keeper"],
    lastSeen: 2,
    facts: {
      description:
        "Barrowmoor's grave-keeper; hired the party to find his missing tenders while selling their names to the Pale Chorister.",
      status:
        "Fugitive — exposed by the Chorister's ledger and fled town; Warden bounty on his head",
      last_known_location: "Unknown; cottage abandoned mid-packing",
    },
  },
  {
    type: "npc",
    name: "The Pale Chorister",
    aliases: ["the Chorister", "the Choirmaster"],
    lastSeen: 2,
    facts: {
      description:
        "Undead choirmaster in a rotted cassock, skin like candle drippings; conducts the dead with a femur baton.",
      status:
        "Escaped into the flooded crypts below the Sunken Chapel, missing an arm",
      goal: "Complete the Litany of Hollow Songs and raise the barrow choir",
      weakness: "The Vesper Bell's toll staggers it and drops its choir",
    },
  },
  {
    type: "npc",
    name: "Sergeant Brasha",
    aliases: ["Brasha"],
    lastSeen: 2,
    facts: {
      description:
        "Barrow Wardens sergeant; brawled with Skamos on sight, bought the party's first round after the chapel.",
      status: "Alive; grudging respect for the party",
      mystery:
        "Carried a bone whistle carved like a bird — Wren lifted it, and nobody knows what it is for",
    },
  },
  {
    type: "faction",
    name: "Barrow Wardens",
    aliases: ["the Wardens"],
    lastSeen: 2,
    facts: {
      description:
        "Barrowmoor's militia; badge is a ring of standing stones, and their order once kept the Vesper Bell.",
      status: "Allied with the party since the Sunken Chapel fight",
      goal: "Hunt Aldous Crane and keep the barrow field quiet",
    },
  },
  {
    type: "location",
    name: "Barrowmoor",
    aliases: [],
    lastSeen: 2,
    facts: {
      description:
        "A fen town ringed by hundreds of grave-mounds; peat smoke, leaning fences, and a choir under the ground.",
      status: "Uneasy but celebrating — the choir is silenced for now",
    },
  },
  {
    type: "location",
    name: "The Drowned Rat",
    aliases: ["the Rat"],
    lastSeen: 2,
    facts: {
      description:
        "Marta Hollis's inn, marked by a stuffed rat in a tiny rowboat over the door. The party's base in Barrowmoor.",
      house_rules: "Skamos is banned from sitting near the hearth",
    },
  },
  {
    type: "location",
    name: "The Sunken Chapel",
    aliases: ["the chapel", "Old Bell Barrow"],
    lastSeen: 2,
    facts: {
      description:
        "A flooded chapel beneath Old Bell Barrow, reached by ghoul-cut tunnels; its choir loft held the conducted dead.",
      status:
        "Choir silenced by the Vesper Bell; drain grate leads to unexplored flooded crypts",
    },
  },
];

const SESSION_HOURS = 3.5;

function parseGuildId(): string {
  const argv = process.argv.slice(2);
  const flagIndex = argv.findIndex((a) => a === "--guild");
  const fromFlag =
    flagIndex >= 0
      ? argv[flagIndex + 1]
      : argv
          .find((a) => a.startsWith("--guild="))
          ?.slice("--guild=".length);
  const guildId = (fromFlag ?? process.env.GUILD_ID)?.trim();
  if (!guildId) {
    console.error(
      [
        "Missing guild id. The web UI only shows a campaign to admins of its",
        "Discord guild, so seed with a server you admin:",
        "",
        "  GUILD_ID=<discord server id> bun db:seed",
        "  bun apps/web/scripts/seed.ts --guild <discord server id>",
        "",
        "(Discord: Settings → Advanced → Developer Mode, then right-click your",
        "server → Copy Server ID.)",
      ].join("\n"),
    );
    process.exit(1);
  }
  return guildId;
}

async function replaceExistingCampaign(guildId: string) {
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(eq(campaigns.name, CAMPAIGN_NAME), eq(campaigns.guildId, guildId)),
    );
  for (const campaign of existing) {
    console.log(`Replacing existing seed campaign #${campaign.id}…`);
    await db
      .update(botGuilds)
      .set({ activeCampaignId: null })
      .where(eq(botGuilds.activeCampaignId, campaign.id));
    // Sessions don't cascade from campaigns; delete them first (their
    // transcripts, summaries, and search chunks cascade from the session).
    await db.delete(sessions).where(eq(sessions.campaignId, campaign.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
  }
}

async function main() {
  const guildId = parseGuildId();
  if (!embeddingsEnabled()) {
    console.warn(
      "OPENAI_API_KEY is not set — search index will be keyword-only (no embeddings).",
    );
  }

  await replaceExistingCampaign(guildId);

  const [campaign] = await db
    .insert(campaigns)
    .values({
      guildId,
      name: CAMPAIGN_NAME,
      description: CAMPAIGN_DESCRIPTION,
    })
    .returning({ id: campaigns.id });
  if (!campaign) throw new Error("campaign insert returned no row");

  // Make it the guild's active campaign so the Discord agent path works too;
  // don't clobber a real synced guild's name if the row already exists.
  await db
    .insert(botGuilds)
    .values({
      guildId,
      name: "Grimoire Dev Guild",
      activeCampaignId: campaign.id,
    })
    .onConflictDoUpdate({
      target: botGuilds.guildId,
      set: { activeCampaignId: campaign.id },
    });

  const playerRows = await db
    .insert(players)
    .values(
      PLAYERS.map((p) => ({
        campaignId: campaign.id,
        discordUserId: p.discordUserId,
        displayName: p.name,
      })),
    )
    .returning({ id: players.id, discordUserId: players.discordUserId });
  const playerIdByName = new Map(
    PLAYERS.map((p) => [
      p.name,
      playerRows.find((r) => r.discordUserId === p.discordUserId)?.id ?? null,
    ]),
  );

  const speakerIds = new Map<string, string>([
    [DM.name, DM.discordUserId],
    ...PLAYERS.map((p) => [p.name, p.discordUserId] as const),
  ]);

  const sessionIds: number[] = [];
  for (const data of SESSION_DATA) {
    const startedAt = new Date(
      Date.now() - data.daysAgo * 24 * 60 * 60 * 1000,
    );
    startedAt.setHours(19, 0, 0, 0);
    const endedAt = new Date(
      startedAt.getTime() + SESSION_HOURS * 60 * 60 * 1000,
    );

    const [session] = await db
      .insert(sessions)
      .values({
        guildId,
        channelId: CHANNEL_ID,
        campaignId: campaign.id,
        status: "completed",
        startedAt,
        endedAt,
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error("session insert returned no row");
    sessionIds.push(session.id);

    // Spread transcript lines evenly across the session's runtime.
    const stepMs =
      (endedAt.getTime() - startedAt.getTime()) / (data.lines.length + 1);
    await db.insert(transcripts).values(
      data.lines.map((line, index) => ({
        sessionId: session.id,
        speaker: line.speaker,
        speakerDiscordUserId: speakerIds.get(line.speaker) ?? null,
        content: line.content,
        timestamp: new Date(startedAt.getTime() + (index + 1) * stepMs),
      })),
    );

    await db.insert(summaries).values({
      sessionId: session.id,
      text: data.summary,
      createdAt: endedAt,
    });
  }

  const memoryRows = await db
    .insert(memories)
    .values(
      MEMORY_DATA.map((m) => ({
        campaignId: campaign.id,
        content: m.content,
        category: m.category,
        source: "seed",
      })),
    )
    .returning({ id: memories.id, content: memories.content });

  for (const data of ENTITY_DATA) {
    const [entity] = await db
      .insert(entities)
      .values({
        campaignId: campaign.id,
        type: data.type,
        name: data.name,
        playerId: data.player ? (playerIdByName.get(data.player) ?? null) : null,
        lastSeenSessionId:
          data.lastSeen != null ? (sessionIds[data.lastSeen] ?? null) : null,
      })
      .returning({ id: entities.id });
    if (!entity) throw new Error("entity insert returned no row");

    const aliases = (data.aliases ?? []).filter((a) => a !== data.name);
    if (aliases.length) {
      await db
        .insert(entityAliases)
        .values(aliases.map((alias) => ({ entityId: entity.id, alias })));
    }
    await db.insert(entityFacts).values(
      Object.entries(data.facts).map(([key, value]) => ({
        entityId: entity.id,
        key,
        value,
        source: "dm" as const,
      })),
    );
  }

  console.log("Building search index…");
  for (const sessionId of sessionIds) {
    await indexSession(sessionId);
  }
  for (const memory of memoryRows) {
    await indexMemory({
      id: memory.id,
      campaignId: campaign.id,
      content: memory.content,
    });
  }
  await indexAllEntities(campaign.id);

  console.log(
    [
      "",
      `Seeded campaign #${campaign.id} "${CAMPAIGN_NAME}" for guild ${guildId}:`,
      `  ${SESSION_DATA.length} completed sessions with transcripts + summaries`,
      `  ${MEMORY_DATA.length} memories, ${ENTITY_DATA.length} entities, ${PLAYERS.length} players`,
      "",
      `Open http://localhost:3000/account/c/${campaign.id}/chat and ask:`,
      '  "Who was the innkeeper in Barrowmoor?"',
      '  "Who owes whom money?"',
      '  "What happened last session?"',
    ].join("\n"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
