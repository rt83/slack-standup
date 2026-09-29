import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const timeZone = z
  .string()
  .default('UTC')
  .refine(isValidTimeZone, { message: 'must be an IANA time zone, e.g. Asia/Ho_Chi_Minh' });

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_UPDATES_CHANNEL: optionalString,
  REDMINE_BASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: optionalString,
  DB_PATH: z.string().default('./data/app.db'),
  SUBMISSION_REMINDER_CRON: optionalString,
  TZ: timeZone,
});

export interface Config {
  readonly slack: {
    readonly botToken: string;
    readonly signingSecret: string;
    /** Channel finished reports are posted to; unset means reports are not posted. */
    readonly updatesChannel: string | undefined;
  };
  readonly redmineBaseUrl: string;
  readonly port: number;
  /** Base URL people's browsers reach this server at; dashboard links are built from it. */
  readonly publicUrl: string;
  readonly dbPath: string;
  /** Cron expression for the missing-update reminder; unset means no reminder. */
  readonly reminderCron: string | undefined;
  /** The team's time zone. Decides what "today" means everywhere in the app. */
  readonly timeZone: string;
}

/** Reads and validates the environment once, so nothing else touches `process.env`. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const e = result.data;
  return {
    slack: {
      botToken: e.SLACK_BOT_TOKEN,
      signingSecret: e.SLACK_SIGNING_SECRET,
      updatesChannel: e.SLACK_UPDATES_CHANNEL,
    },
    redmineBaseUrl: e.REDMINE_BASE_URL,
    port: e.PORT,
    publicUrl: (e.PUBLIC_URL ?? `http://localhost:${e.PORT}`).replace(/\/+$/, ''),
    dbPath: e.DB_PATH,
    reminderCron: e.SUBMISSION_REMINDER_CRON,
    timeZone: e.TZ,
  };
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
