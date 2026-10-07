CREATE TABLE IF NOT EXISTS "schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "time" text NOT NULL,
  "category_id" uuid NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "schedules_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
  CONSTRAINT "schedules_time_format_check"
    CHECK ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedules_time_key" ON "schedules" USING btree ("time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedules_enabled_time_idx" ON "schedules" USING btree ("enabled", "time");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_date" date NOT NULL,
  "schedule_time" text NOT NULL,
  "schedule_id" uuid,
  "category_id" uuid,
  "executed_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "schedule_executions_schedule_id_schedules_id_fk"
    FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL,
  CONSTRAINT "schedule_executions_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_executions_date_time_key"
  ON "schedule_executions" USING btree ("execution_date", "schedule_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_executions_schedule_idx"
  ON "schedule_executions" USING btree ("schedule_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playback_state" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "execution_id" uuid,
  "schedule_id" uuid,
  "category_id" uuid,
  "category_name" text,
  "current_song_id" uuid,
  "playlist_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "current_index" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'WAITING',
  "started_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "playback_state_execution_id_schedule_executions_id_fk"
    FOREIGN KEY ("execution_id") REFERENCES "schedule_executions"("id") ON DELETE SET NULL,
  CONSTRAINT "playback_state_schedule_id_schedules_id_fk"
    FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL,
  CONSTRAINT "playback_state_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
  CONSTRAINT "playback_state_current_song_id_songs_id_fk"
    FOREIGN KEY ("current_song_id") REFERENCES "songs"("id") ON DELETE SET NULL,
  CONSTRAINT "playback_state_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "playback_state_status_check"
    CHECK ("status" IN ('IDLE', 'PLAYING', 'WAITING'))
);
--> statement-breakpoint
INSERT INTO "playback_state" ("id", "playlist_snapshot", "current_index", "status")
VALUES (1, '[]'::jsonb, 0, 'WAITING')
ON CONFLICT ("id") DO NOTHING;
