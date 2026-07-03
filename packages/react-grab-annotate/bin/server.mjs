#!/usr/bin/env node
import { startAnnotateServer, resolveConfig } from "../dist/server.js";

startAnnotateServer(resolveConfig());
