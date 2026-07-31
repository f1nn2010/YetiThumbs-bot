import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Must be imported first from app.js so process.env is ready before config modules load.
dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});
