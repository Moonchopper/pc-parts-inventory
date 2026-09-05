CREATE TABLE `build_items` (
	`build_id` text NOT NULL,
	`part_id` text NOT NULL,
	`slot` text,
	`added_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`build_id`, `part_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_items_part_id_unique` ON `build_items` (`part_id`);--> statement-breakpoint
CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source` text NOT NULL,
	`hostname` text,
	`visibility` text DEFAULT 'unlisted' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_slug_unique` ON `builds` (`slug`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`payload_hash` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`summary` text,
	`received_at` text DEFAULT (current_timestamp) NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imports_payload_hash_unique` ON `imports` (`payload_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`run_at` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`product_id` text NOT NULL,
	`serial` text,
	`condition` text DEFAULT 'used' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'on_shelf' NOT NULL,
	`acquired_at` text,
	`acquired_price_cents` integer,
	`acquired_currency` text DEFAULT 'USD' NOT NULL,
	`acquired_source` text,
	`sold_at` text,
	`sold_price_cents` integer,
	`import_id` text,
	`identity_key` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parts_owner_identity_unique` ON `parts` (`owner_id`,`identity_key`);--> statement-breakpoint
CREATE INDEX `parts_owner_status_idx` ON `parts` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `parts_product_idx` ON `parts` (`product_id`);--> statement-breakpoint
CREATE TABLE `price_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`provider_link_id` text,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`observed_at` text NOT NULL,
	`source_url` text,
	`raw` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_link_id`) REFERENCES `provider_links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `price_quotes_product_observed_idx` ON `price_quotes` (`product_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`part_number` text,
	`upc` text,
	`specs` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_owner_part_number_unique` ON `products` (`owner_id`,`part_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_owner_upc_unique` ON `products` (`owner_id`,`upc`);--> statement-breakpoint
CREATE INDEX `products_owner_category_idx` ON `products` (`owner_id`,`category`);--> statement-breakpoint
CREATE TABLE `provider_links` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`confidence` real NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_links_unique` ON `provider_links` (`product_id`,`provider`,`external_id`);