CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`lead_id` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`booked_by` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `appointments_business_idx` ON `appointments` (`business_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`owner_phone` text,
	`caller_id` text,
	`agent_name` text DEFAULT 'Alex' NOT NULL,
	`agent_instructions` text DEFAULT '' NOT NULL,
	`appointment_minutes` integer DEFAULT 30 NOT NULL,
	`business_hours` text NOT NULL,
	`lead_follow_up_hours` integer DEFAULT 48 NOT NULL,
	`lead_max_attempts` integer DEFAULT 3 NOT NULL,
	`invoice_grace_days` integer DEFAULT 30 NOT NULL,
	`invoice_follow_up_days` integer DEFAULT 7 NOT NULL,
	`invoice_max_attempts` integer DEFAULT 4 NOT NULL,
	`payment_link` text,
	`autopilot` integer DEFAULT true NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`subscription_status` text DEFAULT 'none' NOT NULL,
	`current_period_end` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `call_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `call_messages_call_idx` ON `call_messages` (`call_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`purpose` text NOT NULL,
	`lead_id` text,
	`invoice_id` text,
	`to_phone` text NOT NULL,
	`mode` text DEFAULT 'phone' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`twilio_call_sid` text,
	`outcome` text,
	`history` text DEFAULT '[]' NOT NULL,
	`ended` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `calls_business_idx` ON `calls` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`invoice_number` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text,
	`customer_email` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`promised_pay_date` integer,
	`paid_at` integer,
	`collection_attempts` integer DEFAULT 0 NOT NULL,
	`last_collection_at` integer,
	`notes` text DEFAULT '' NOT NULL,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoices_business_idx` ON `invoices` (`business_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_external_idx` ON `invoices` (`business_id`,`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`source` text,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_contacted_at` integer,
	`next_follow_up_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leads_business_idx` ON `leads` (`business_id`,`status`);--> statement-breakpoint
CREATE TABLE `quickbooks_connections` (
	`business_id` text PRIMARY KEY NOT NULL,
	`realm_id` text NOT NULL,
	`company_name` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token_expires_at` integer NOT NULL,
	`customers_consented` integer DEFAULT false NOT NULL,
	`last_sync_at` integer,
	`last_sync_error` text,
	`last_sync_imported` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);