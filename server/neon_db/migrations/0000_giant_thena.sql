CREATE TABLE "token_prices" (
	"address" varchar(44),
	"priceUsd" numeric NOT NULL,
	"marketCap" numeric NOT NULL,
	"usd24hVol" numeric NOT NULL,
	"usd24hChange" numeric NOT NULL,
	"high24h" numeric NOT NULL,
	"low24h" numeric NOT NULL,
	"fullyDilutedValuation" numeric NOT NULL,
	"totalVolume" numeric NOT NULL,
	"circulatingSupply" numeric NOT NULL,
	"totalSupply" numeric NOT NULL,
	"maxSupply" numeric NOT NULL,
	"ath" numeric NOT NULL,
	"athChangePercentage" numeric NOT NULL,
	"atl" numeric NOT NULL,
	"atlChangePercentage" numeric NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_meta" (
	"address" varchar(44) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"is_native" boolean DEFAULT false NOT NULL,
	"is_wrapped" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"description" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_address" varchar(44) NOT NULL,
	"to_address" varchar(44) NOT NULL,
	"amount" numeric NOT NULL,
	"amountUsd" numeric NOT NULL,
	"time" integer NOT NULL,
	"token_address" varchar(44) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" varchar(44) PRIMARY KEY NOT NULL,
	"balanceCount" integer DEFAULT 0 NOT NULL
);
