import { startAnnotateServer } from "./server.js";
import type { ServerConfig } from "./types.js";

export { startAnnotateServer } from "./server.js";
export type * from "./types.js";

const DEFAULT_PORT = 5179;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_BASE_DIR = ".react-grab";

const parseArgs = (argv: string[]): Partial<ServerConfig> => {
  const config: Partial<ServerConfig> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--port" && next) config.port = Number(next);
    else if (arg === "--host" && next) config.host = next;
    else if (arg === "--dir" && next) config.rootDir = next;
    else if (arg === "--base-dir" && next) config.baseDir = next;
  }
  return config;
};

export const resolveConfig = (argv: string[] = process.argv.slice(2)): ServerConfig => {
  const fromArgs = parseArgs(argv);
  const port = fromArgs.port ?? (Number(process.env.ANNOTATE_PORT) || DEFAULT_PORT);
  return {
    port,
    host: fromArgs.host ?? process.env.ANNOTATE_HOST ?? DEFAULT_HOST,
    rootDir: fromArgs.rootDir ?? process.env.ANNOTATE_DIR ?? process.cwd(),
    baseDir: fromArgs.baseDir ?? process.env.ANNOTATE_BASE_DIR ?? DEFAULT_BASE_DIR,
  };
};

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startAnnotateServer(resolveConfig());
}
