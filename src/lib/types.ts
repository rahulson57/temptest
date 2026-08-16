/**
 * Shared types and CROSS-VERTICAL CONTRACTS.
 *
 * The prop types below are frozen interfaces between verticals:
 *  - FOUNDATIONS ships typed stubs in src/components/social/ that satisfy them.
 *  - The Reading vertical imports those stubs today.
 *  - The Social vertical replaces the implementations behind the SAME props.
 *
 * Changing a *Props shape here breaks another team's compile. Route the change
 * through the coordinator, don't widen it locally.
 */

import type { StoryStatus } from '@prisma/client';

export type { StoryStatus };

/** App-level cap: a single user may give at most this many claps to one story. */
export const MAX_CLAPS_PER_USER = 50;

/** App-level cap: a story may carry at most this many tags. */
export const MAX_TAGS_PER_STORY = 5;

/* ------------------------------------------------------------------ *
 * View models — the safe, serializable shapes crossing server/client
 * boundaries. Never pass a raw Prisma User (it carries passwordHash).
 * ------------------------------------------------------------------ */

/** Public author/user summary. Contains NO credentials. */
export type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
};

/** The signed-in viewer, as resolved by getCurrentUser(). */
export type SessionUser = PublicUser & {
  email: string;
};

export type TagSummary = {
  id: string;
  name: string;
  slug: string;
  /**
   * Whether the viewer follows this tag (false when signed out).
   *
   * OPTIONAL on purpose: story cards and feed rows list tags without resolving
   * follow state, and forcing them to would add a query per card. Tag pages
   * rendering <FollowTagButton> resolve it; everyone else omits it.
   */
  viewerIsFollowing?: boolean;
};

/** A story as rendered in feeds, lists and cards. */
export type StorySummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  coverImageUrl: string | null;
  status: StoryStatus;
  readingTimeMinutes: number;
  publishedAt: string | null;
  author: PublicUser;
  tags: TagSummary[];
  clapCount: number;
  commentCount: number;
};

/**
 * A story on its own page: summary plus sanitized body and viewer state.
 *
 * The three `viewer*` fields are what the story page's social controls need to
 * render correctly on first paint. They are resolved ONCE by whoever loads the
 * story, so no control has to fetch its own state — and they are all false/0
 * when signed out.
 */
export type StoryDetail = StorySummary & {
  bodyHtml: string;
  viewerHasBookmarked: boolean;
  viewerClapCount: number;
  /** Whether the viewer follows this story's author (false when signed out). */
  viewerIsFollowingAuthor: boolean;
};

export type CommentNode = {
  id: string;
  storyId: string;
  parentId: string | null;
  bodyText: string;
  createdAt: string;
  deletedAt: string | null;
  author: PublicUser;
  replies: CommentNode[];
};

/* ------------------------------------------------------------------ *
 * CROSS-VERTICAL COMPONENT CONTRACTS (§5)
 * Stubs live in src/components/social/. Do not change these shapes.
 * ------------------------------------------------------------------ */

export type ClapButtonProps = {
  storyId: string;
  /** Total claps from everyone, for the visible count. */
  initialCount: number;
  /** Claps this viewer has already given (0 when signed out). */
  initialUserCount: number;
  /** Per-user ceiling; defaults to MAX_CLAPS_PER_USER. */
  maxPerUser: number;
};

export type BookmarkButtonProps = {
  storyId: string;
  initialBookmarked: boolean;
};

export type FollowButtonProps = {
  /** The user being followed (not the viewer). */
  userId: string;
  initialFollowing: boolean;
};

export type FollowTagButtonProps = {
  tagId: string;
  initialFollowing: boolean;
};

/* ------------------------------------------------------------------ *
 * Misc shared shapes
 * ------------------------------------------------------------------ */

/** Result of a successful upload, returned by any StorageAdapter. */
export type UploadResult = {
  key: string;
  url: string;
};
