import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { readingTimeMinutes } from '../src/lib/readingTime';
import { sanitizeStoryHtml } from '../src/lib/sanitize';

/**
 * Deterministic, idempotent seed.
 *
 * Every row uses a FIXED id and an upsert, and every timestamp is a fixed
 * literal, so `npm run db:seed && npm run db:seed` produces byte-identical data
 * and zero duplicates. Downstream verticals write tests against these ids —
 * do not renumber them.
 */

const prisma = new PrismaClient();

/** Fixed clock so publishedAt never drifts between runs. */
const EPOCH = new Date('2025-01-06T09:00:00.000Z');
const day = (n: number) => new Date(EPOCH.getTime() + n * 24 * 60 * 60 * 1000);

/** Same password for every seeded user. Local fixtures only. */
const SEED_PASSWORD = 'password123';

const USERS = [
  {
    id: 'usr_ada',
    email: 'ada@example.com',
    handle: 'ada',
    displayName: 'Ada Whitfield',
    bio: 'Systems thinker. Writing about the seams between software and the people who use it.',
    avatarUrl: null,
  },
  {
    id: 'usr_bo',
    email: 'bo@example.com',
    handle: 'bo',
    displayName: 'Bo Nakamura',
    bio: 'Essays on craft, attention, and slow tools.',
    avatarUrl: null,
  },
  {
    id: 'usr_cass',
    email: 'cass@example.com',
    handle: 'cass',
    displayName: 'Cass Oyelaran',
    bio: 'Reporting on climate, cities and the infrastructure underneath both.',
    avatarUrl: null,
  },
] as const;

const TAGS = [
  { id: 'tag_writing', name: 'Writing', slug: 'writing' },
  { id: 'tag_design', name: 'Design', slug: 'design' },
  { id: 'tag_engineering', name: 'Engineering', slug: 'engineering' },
  { id: 'tag_climate', name: 'Climate', slug: 'climate' },
  { id: 'tag_cities', name: 'Cities', slug: 'cities' },
  { id: 'tag_attention', name: 'Attention', slug: 'attention' },
] as const;

type SeedStory = {
  id: string;
  authorId: string;
  title: string;
  subtitle: string;
  slug: string;
  paragraphs: string[];
  tagIds: string[];
  publishedDayOffset: number;
};

const STORIES: SeedStory[] = [
  {
    id: 'sty_measure',
    authorId: 'usr_ada',
    title: 'The measure of a paragraph',
    subtitle: 'Why sixty-five characters is not an arbitrary number',
    slug: 'the-measure-of-a-paragraph',
    tagIds: ['tag_writing', 'tag_design'],
    publishedDayOffset: 0,
    paragraphs: [
      'A line of text is a physical object before it is a semantic one. The eye tracks it, the neck follows, and somewhere past a certain width the return sweep starts to fail.',
      'Typographers converged on roughly sixty-five characters not because the number is magic but because it is where the failure rate stops climbing. Wider lines lose the reader between the end of one line and the start of the next.',
      'The web spent fifteen years ignoring this, then rediscovered it, then wrapped it in a utility class.',
    ],
  },
  {
    id: 'sty_slow_tools',
    authorId: 'usr_bo',
    title: 'In praise of slow tools',
    subtitle: 'The software that gets out of the way is rarely the fastest',
    slug: 'in-praise-of-slow-tools',
    tagIds: ['tag_attention', 'tag_design'],
    publishedDayOffset: 2,
    paragraphs: [
      'Every tool proposes a pace. A chat client proposes urgency. A text editor proposes patience. Neither is neutral, and neither asks your permission.',
      'The tools I keep are the ones that made me slower in the first week and faster in the first year.',
    ],
  },
  {
    id: 'sty_grid',
    authorId: 'usr_cass',
    title: 'The grid beneath the city',
    subtitle: 'What a heat wave reveals about infrastructure nobody voted for',
    slug: 'the-grid-beneath-the-city',
    tagIds: ['tag_climate', 'tag_cities'],
    publishedDayOffset: 4,
    paragraphs: [
      'Infrastructure is invisible until it fails, which is a design property, not an accident. We build systems to be forgotten and then act surprised at the forgetting.',
      'During the third day of the heat wave, the substation on Delancey drew more power than it had been rated for in 1974, the year its transformers were installed.',
      'The engineers knew. The budget cycle did not.',
    ],
  },
  {
    id: 'sty_drafts',
    authorId: 'usr_ada',
    title: 'Write the bad draft first',
    subtitle: 'On lowering the stakes of the blank page',
    slug: 'write-the-bad-draft-first',
    tagIds: ['tag_writing'],
    publishedDayOffset: 6,
    paragraphs: [
      'The blank page is not intimidating because writing is hard. It is intimidating because the first sentence you write becomes the thing you have to defend.',
      'So write one you have no intention of defending.',
    ],
  },
  {
    id: 'sty_migrations',
    authorId: 'usr_ada',
    title: 'Migrations are a social problem',
    subtitle: 'The schema is the easy part',
    slug: 'migrations-are-a-social-problem',
    tagIds: ['tag_engineering'],
    publishedDayOffset: 8,
    paragraphs: [
      'You can write a migration in an afternoon. Getting six teams to agree on what a "user" is takes a quarter.',
      'The database schema is where organizational disagreements go to become permanent.',
      'Every nullable column is a conversation somebody deferred.',
    ],
  },
  {
    id: 'sty_attention',
    authorId: 'usr_bo',
    title: 'Attention is not a resource you own',
    subtitle: 'Rethinking the metaphor that shapes every feed',
    slug: 'attention-is-not-a-resource-you-own',
    tagIds: ['tag_attention', 'tag_writing'],
    publishedDayOffset: 10,
    paragraphs: [
      'We talk about attention as a budget: spend it, waste it, reclaim it. The metaphor is convenient and slightly wrong.',
      'Attention is closer to weather than to currency. You can prepare for it. You cannot store it.',
    ],
  },
  {
    id: 'sty_transit',
    authorId: 'usr_cass',
    title: 'The bus that arrives on time',
    subtitle: 'Reliability beats speed, and every rider already knows it',
    slug: 'the-bus-that-arrives-on-time',
    tagIds: ['tag_cities'],
    publishedDayOffset: 12,
    paragraphs: [
      'Ask a transit agency what riders want and you will hear "faster service." Ask the riders and you will hear something narrower: they want to know when it is coming.',
      'A bus that is reliably twelve minutes away beats a bus that is sometimes four and sometimes thirty.',
    ],
  },
  {
    id: 'sty_typography',
    authorId: 'usr_bo',
    title: 'Serif on screen, finally',
    subtitle: 'Twenty years of "sans-serif reads better" was a hardware limitation',
    slug: 'serif-on-screen-finally',
    tagIds: ['tag_design', 'tag_writing'],
    publishedDayOffset: 14,
    paragraphs: [
      'The advice to avoid serifs on screen was correct in 2003 and has been quietly wrong since about 2014.',
      'Serifs failed on low-density displays because the thin strokes had nowhere to land. Give them enough pixels and the original argument returns: they guide the eye along the line.',
    ],
  },
];

/** One draft, so authoring surfaces have a non-published fixture to work with. */
const DRAFT_STORY = {
  id: 'sty_draft_notes',
  authorId: 'usr_ada',
  title: 'Notes toward a piece about queues',
  subtitle: 'Unfinished on purpose',
  slug: 'notes-toward-a-piece-about-queues',
  tagIds: ['tag_engineering'],
  paragraphs: [
    'Every queue is a promise that something will be handled later. Most outages are that promise being broken quietly.',
  ],
};

const FOLLOWS = [
  { followerId: 'usr_ada', followingId: 'usr_bo' },
  { followerId: 'usr_ada', followingId: 'usr_cass' },
  { followerId: 'usr_bo', followingId: 'usr_ada' },
  { followerId: 'usr_cass', followingId: 'usr_ada' },
];

const TAG_FOLLOWS = [
  { userId: 'usr_ada', tagId: 'tag_engineering' },
  { userId: 'usr_bo', tagId: 'tag_design' },
  { userId: 'usr_cass', tagId: 'tag_climate' },
];

const CLAPS = [
  { userId: 'usr_bo', storyId: 'sty_measure', count: 12 },
  { userId: 'usr_cass', storyId: 'sty_measure', count: 7 },
  { userId: 'usr_ada', storyId: 'sty_slow_tools', count: 20 },
  { userId: 'usr_ada', storyId: 'sty_grid', count: 5 },
  { userId: 'usr_bo', storyId: 'sty_migrations', count: 9 },
];

const BOOKMARKS = [
  { userId: 'usr_ada', storyId: 'sty_slow_tools' },
  { userId: 'usr_ada', storyId: 'sty_grid' },
  { userId: 'usr_bo', storyId: 'sty_measure' },
  { userId: 'usr_cass', storyId: 'sty_migrations' },
];

const COMMENTS = [
  {
    id: 'cmt_1',
    storyId: 'sty_measure',
    authorId: 'usr_bo',
    parentId: null,
    bodyText: 'The return-sweep point is the one I always forget when I am arguing for wider layouts.',
  },
  {
    id: 'cmt_2',
    storyId: 'sty_measure',
    authorId: 'usr_ada',
    parentId: 'cmt_1',
    bodyText: 'It is the whole ballgame. Everything else about measure is downstream of it.',
  },
  {
    id: 'cmt_3',
    storyId: 'sty_measure',
    authorId: 'usr_cass',
    parentId: null,
    bodyText: 'Curious how this holds up on phones, where the measure is set by the device.',
  },
  {
    id: 'cmt_4',
    storyId: 'sty_grid',
    authorId: 'usr_ada',
    parentId: null,
    bodyText: 'The 1974 transformer detail is the piece of reporting that makes the whole argument land.',
  },
];

function toHtml(paragraphs: string[]): string {
  // Round-trip through the real sanitizer so seeded rows obey the same
  // invariant as user-written ones: nothing in the DB bypasses sanitize.
  return sanitizeStoryHtml(paragraphs.map((p) => `<p>${p}</p>`).join('\n'));
}

async function main() {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  for (const user of USERS) {
    const data = {
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      passwordHash,
      createdAt: EPOCH,
    } satisfies Omit<Prisma.UserCreateInput, 'id'>;

    await prisma.user.upsert({
      where: { id: user.id },
      // Keep passwordHash out of the update path: bcrypt salts differ per call,
      // so re-hashing on every seed would rewrite the row and defeat idempotency.
      update: {
        email: data.email,
        handle: data.handle,
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      },
      create: { id: user.id, ...data },
    });
  }

  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { id: tag.id },
      update: { name: tag.name, slug: tag.slug },
      create: { id: tag.id, name: tag.name, slug: tag.slug },
    });
  }

  for (const story of STORIES) {
    const bodyHtml = toHtml(story.paragraphs);
    const publishedAt = day(story.publishedDayOffset);
    const shared = {
      authorId: story.authorId,
      title: story.title,
      subtitle: story.subtitle,
      slug: story.slug,
      bodyHtml,
      status: 'PUBLISHED' as const,
      readingTimeMinutes: readingTimeMinutes(bodyHtml),
      publishedAt,
      createdAt: publishedAt,
    };

    await prisma.story.upsert({
      where: { id: story.id },
      update: shared,
      create: { id: story.id, ...shared },
    });

    for (const tagId of story.tagIds) {
      await prisma.storyTag.upsert({
        where: { storyId_tagId: { storyId: story.id, tagId } },
        update: {},
        create: { storyId: story.id, tagId },
      });
    }
  }

  {
    const bodyHtml = toHtml(DRAFT_STORY.paragraphs);
    const shared = {
      authorId: DRAFT_STORY.authorId,
      title: DRAFT_STORY.title,
      subtitle: DRAFT_STORY.subtitle,
      slug: DRAFT_STORY.slug,
      bodyHtml,
      status: 'DRAFT' as const,
      readingTimeMinutes: readingTimeMinutes(bodyHtml),
      publishedAt: null,
      createdAt: day(15),
    };
    await prisma.story.upsert({
      where: { id: DRAFT_STORY.id },
      update: shared,
      create: { id: DRAFT_STORY.id, ...shared },
    });
    for (const tagId of DRAFT_STORY.tagIds) {
      await prisma.storyTag.upsert({
        where: { storyId_tagId: { storyId: DRAFT_STORY.id, tagId } },
        update: {},
        create: { storyId: DRAFT_STORY.id, tagId },
      });
    }
  }

  for (const follow of FOLLOWS) {
    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: follow.followerId,
          followingId: follow.followingId,
        },
      },
      update: {},
      create: { ...follow, createdAt: EPOCH },
    });
  }

  for (const tagFollow of TAG_FOLLOWS) {
    await prisma.tagFollow.upsert({
      where: { userId_tagId: { userId: tagFollow.userId, tagId: tagFollow.tagId } },
      update: {},
      create: { ...tagFollow, createdAt: EPOCH },
    });
  }

  for (const clap of CLAPS) {
    await prisma.clap.upsert({
      where: { userId_storyId: { userId: clap.userId, storyId: clap.storyId } },
      update: { count: clap.count },
      create: { ...clap, createdAt: EPOCH },
    });
  }

  for (const bookmark of BOOKMARKS) {
    await prisma.bookmark.upsert({
      where: { userId_storyId: { userId: bookmark.userId, storyId: bookmark.storyId } },
      update: {},
      create: { ...bookmark, createdAt: EPOCH },
    });
  }

  // Parents before replies: a reply's parentId must already exist.
  for (const comment of [...COMMENTS].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))) {
    await prisma.comment.upsert({
      where: { id: comment.id },
      update: { bodyText: comment.bodyText },
      create: {
        id: comment.id,
        storyId: comment.storyId,
        authorId: comment.authorId,
        parentId: comment.parentId,
        bodyText: comment.bodyText,
        createdAt: EPOCH,
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    stories: await prisma.story.count(),
    tags: await prisma.tag.count(),
    comments: await prisma.comment.count(),
    claps: await prisma.clap.count(),
    bookmarks: await prisma.bookmark.count(),
    follows: await prisma.follow.count(),
  };
  console.log('[seed] done', counts);
  console.log(`[seed] all seeded users share the password: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
