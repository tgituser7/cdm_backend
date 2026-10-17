import fs from "node:fs";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";

fs.mkdirSync(config.uploadsDir, { recursive: true });

await mongoose.connect(config.mongoUri);
console.log(`MongoDB connected: ${mongoose.connection.name}`);

const server = createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
