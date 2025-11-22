import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  decimal,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tokenMeta = pgTable("token_meta", {
  address: varchar("address", { length: 44 }).primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  isNative: boolean("is_native").notNull().default(false),
  isWrapped: boolean("is_wrapped").notNull().default(false),
  imageUrl: text("image_url"),
  description: text("description"),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tokenMarketData = pgTable("token_prices", {
  address: varchar("address", { length: 44 }),
  priceUsd: decimal().notNull(),
  marketCap: decimal().notNull(),
  usd24hVol: decimal().notNull(),
  usd24hChange: decimal().notNull(),
  high24h: decimal().notNull(),
  low24h: decimal().notNull(),
  fullyDilutedValuation: decimal().notNull(),
  totalVolume: decimal().notNull(),
  circulatingSupply: decimal().notNull(),
  totalSupply: decimal().notNull(),
  maxSupply: decimal().notNull(),
  ath: decimal().notNull(),
  athChangePercentage: decimal().notNull(),
  atl: decimal().notNull(),
  atlChangePercentage: decimal().notNull(),

  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tokenTransfers = pgTable("token_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAddress: varchar("from_address", { length: 44 }).notNull(),
  toAddress: varchar("to_address", { length: 44 }).notNull(),
  amount: decimal().notNull(),
  amountUsd: decimal().notNull(),
  time: integer("time").notNull(),
  tokenAddress: varchar("token_address", { length: 44 }).notNull(),
});

export const wallets = pgTable("wallets", {
  address: varchar("address", { length: 44 }).primaryKey(),
  balanceCount: integer().notNull().default(0),
});

export const tokenMarketData_tokenMeta_relation = relations(
  tokenMarketData,
  ({ one }) => ({
    tokenMeta: one(tokenMeta, {
      fields: [tokenMarketData.address],
      references: [tokenMeta.address],
    }),
  }),
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
