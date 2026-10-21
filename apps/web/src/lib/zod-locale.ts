import { z } from "zod";
import { de } from "zod/locales";

// Validation messages shown in the UI (e.g. the rule editor) in German.
z.config(de());
