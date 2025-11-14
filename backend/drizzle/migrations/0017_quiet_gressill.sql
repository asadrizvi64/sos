ALTER TABLE "model_cost_logs" ALTER COLUMN "rate_per_1k" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "workflow_execution_id" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "node_id" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "tokens_total" integer;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "usd_cost" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "response" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "model_cost_logs" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_workflow_execution_id_idx" ON "model_cost_logs" ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_node_id_idx" ON "model_cost_logs" ("node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_provider_idx" ON "model_cost_logs" ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_organization_id_idx" ON "model_cost_logs" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_workspace_id_idx" ON "model_cost_logs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_cost_logs_created_at_idx" ON "model_cost_logs" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_cost_logs" ADD CONSTRAINT "model_cost_logs_agent_id_code_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "code_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_cost_logs" ADD CONSTRAINT "model_cost_logs_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "workflow_executions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_cost_logs" ADD CONSTRAINT "model_cost_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_cost_logs" ADD CONSTRAINT "model_cost_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
