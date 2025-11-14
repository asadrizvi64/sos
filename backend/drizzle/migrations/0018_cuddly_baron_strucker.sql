ALTER TABLE "prompt_similarity_logs" ALTER COLUMN "similarity_score" SET DATA TYPE numeric(5, 4);--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ALTER COLUMN "action_taken" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "workflow_execution_id" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "node_id" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "prompt" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "prompt_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "similarity_score_percent" integer;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "flagged_content" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "flagged_content_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "threshold" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "method" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "prompt_similarity_logs" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_workflow_execution_id_idx" ON "prompt_similarity_logs" ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_node_id_idx" ON "prompt_similarity_logs" ("node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_similarity_score_idx" ON "prompt_similarity_logs" ("similarity_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_action_taken_idx" ON "prompt_similarity_logs" ("action_taken");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_method_idx" ON "prompt_similarity_logs" ("method");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_organization_id_idx" ON "prompt_similarity_logs" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_workspace_id_idx" ON "prompt_similarity_logs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_trace_id_idx" ON "prompt_similarity_logs" ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_similarity_logs_created_at_idx" ON "prompt_similarity_logs" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prompt_similarity_logs" ADD CONSTRAINT "prompt_similarity_logs_agent_id_code_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "code_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prompt_similarity_logs" ADD CONSTRAINT "prompt_similarity_logs_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "workflow_executions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prompt_similarity_logs" ADD CONSTRAINT "prompt_similarity_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prompt_similarity_logs" ADD CONSTRAINT "prompt_similarity_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
