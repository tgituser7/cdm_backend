import fs from "node:fs";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { startKeepAlive } from "./keepAlive.js";
import { backfillMovieDerivedFields } from "./models/Movie.js";

fs.mkdirSync(config.resDir, { recursive: true });

await mongoose.connect(config.mongoUri);
console.log(`MongoDB connected: ${mongoose.connection.name}`);

// Movies saved before the search/sort fields existed get them now (a no-op once done).
const backfilled = await backfillMovieDerivedFields();
if (backfilled) console.log(`Updated search/sort fields on ${backfilled} movies`);

const server = createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const keepAlive = startKeepAlive();

const shutdown = async () => {
  if (keepAlive) clearInterval(keepAlive);
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
