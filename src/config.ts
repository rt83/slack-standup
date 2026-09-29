import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** The folder, relative to the working directory, the app reads its configuration from. */
export const CONF_DIR = 'conf';
/** The configuration file inside it. */
export const CONF_FILE = 'app.yaml';

/** An optional text setting: missing, empty (`key:`) and blank all mean "not set". */
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || undefined);

const timeZone = z
  .string()
  .default('UTC')
  .refine(isValidTimeZone, { message: 'must be an IANA time zone, e.g. Asia/Ho_Chi_Minh' });

const serverSchema = z
  .strictObject({
    port: z.number().int().positive().default(3000),
    /** Base URL people's browsers reach this server at; dashboard links are built from it. */
    publicUrl: optionalText,
  })
  .prefault({});

// Strict objects: an unknown key is almost always a typo, and is refused rather than ignored.
const configSchema = z
  .strictObject({
    slack: z.strictObject({
      botToken: z.string().min(1),
      signingSecret: z.string().min(1),
      /** Channel ID finished reports are posted to; unset means they are not posted. */
      updatesChannel: optionalText,
    }),
    redmine: z.strictObject({
      baseUrl: z.url(),
    }),
    server: serverSchema,
    database: z
      .strictObject({
        path: z.string().min(1).default('./data/app.db'),
      })
      .prefault({}),
    reminder: z
      .strictObject({
        /** Cron expression for the missing-update reminder, in `timeZone`; unset means no reminder. */
        cron: optionalText,
      })
      .prefault({}),
    /** The team's time zone. Decides what "today" means everywhere in the app. */
    timeZone,
  })
  .transform((c) => ({
    ...c,
    server: {
      port: c.server.port,
      publicUrl: (c.server.publicUrl ?? `http://localhost:${c.server.port}`).replace(/\/+$/, ''),
    },
  }));

export type Config = Readonly<z.infer<typeof configSchema>>;

/** Validates raw settings once, so nothing else reads them unchecked. */
export function parseConfig(raw: unknown): Config {
  const result = configSchema.safeParse(raw ?? {});
  if (!result.success) {
    throw new Error(`Invalid configuration in ${path.join(CONF_DIR, CONF_FILE)}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * The `server.port` in raw settings, or the default when it is absent or invalid. For the dev
 * proxy, which must work before the rest of the file is filled in.
 */
export function serverPortIn(raw: unknown): number {
  const server = z.object({ server: serverSchema }).safeParse(raw ?? {});
  return (server.success ? server.data : z.object({ server: serverSchema }).parse({})).server.port;
}

/** The parsed contents of `<dir>/app.yaml`, or null when there is no such file. */
export function readConfFile(dir: string): unknown {
  const file = path.join(dir, CONF_FILE);
  return fs.existsSync(file) ? (parseYaml(fs.readFileSync(file, 'utf8')) ?? {}) : null;
}

/** The app's configuration, from `<dir>/app.yaml`. The app passes `conf/` in its working directory. */
export function loadConfigFrom(dir: string): Config {
  const raw = readConfFile(dir);
  if (raw === null) {
    throw new Error(`No configuration at ${path.join(dir, CONF_FILE)}. Copy conf-sample/ to conf/ and fill it in.`);
  }
  return parseConfig(raw);
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
