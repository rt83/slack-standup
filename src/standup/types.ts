/** The two halves of a daily update, in the order they are shown. */
export const SECTIONS = ['did', 'doing'] as const;

export type Section = (typeof SECTIONS)[number];

export const SECTION_TITLES: Readonly<Record<Section, string>> = {
  did: 'What I did',
  doing: 'What I am doing',
};

/**
 * How an issue got onto the form: `assigned` came from the person's open Redmine issues,
 * `added` was picked by hand from the search box.
 */
export const ISSUE_ORIGINS = ['assigned', 'added'] as const;

export type IssueOrigin = (typeof ISSUE_ORIGINS)[number];

/** One issue row as the person filled it in. */
export interface StandupEntry {
  readonly section: Section;
  readonly issueId: number;
  readonly origin: IssueOrigin;
  readonly notes: string;
  /** The status picked in the dropdown; null means "leave it as it is". */
  readonly newStatusId: number | null;
}
