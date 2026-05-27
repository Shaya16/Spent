// scripts/docs-seed/fake-data.mjs
//
// Curated fake dataset for docs screenshots. Used only by
// scripts/capture-docs-screenshots.mjs. No real user data.

const today = new Date();

function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Reference: schema in src/server/db/migrations/001_initial.sql
export const banks = [
  { provider: "isracard", label: "Isracard" },
  { provider: "hapoalim", label: "Bank Hapoalim" },
  { provider: "max", label: "Max" },
];

// 16 seeded categories from 001_initial.sql, by 1-based id.
export const categoryIds = {
  Groceries: 1,
  Restaurants: 2,
  Transport: 3,
  Shopping: 4,
  Entertainment: 5,
  Health: 6,
  Education: 7,
  BillsUtilities: 8,
  Subscriptions: 9,
  Travel: 10,
  CashATM: 11,
  Transfers: 12,
  Insurance: 13,
  Home: 14,
  PersonalCare: 15,
};

export const transactions = [
  // This-month coffees
  {
    date: daysAgo(0),
    merchant: "Aroma · Rothschild",
    amount: -14.5,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  {
    date: daysAgo(1),
    merchant: "Cofix · Allenby",
    amount: -7.0,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  {
    date: daysAgo(2),
    merchant: "Aroma · Sarona",
    amount: -14.5,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  // Groceries
  {
    date: daysAgo(3),
    merchant: "Shufersal Deal",
    amount: -284.2,
    cat: categoryIds.Groceries,
    provider: "hapoalim",
  },
  {
    date: daysAgo(8),
    merchant: "Tiv Taam",
    amount: -198.4,
    cat: categoryIds.Groceries,
    provider: "isracard",
  },
  {
    date: daysAgo(15),
    merchant: "Shufersal Deal",
    amount: -312.8,
    cat: categoryIds.Groceries,
    provider: "hapoalim",
  },
  // Transport
  {
    date: daysAgo(4),
    merchant: "Rav-Kav",
    amount: -124.0,
    cat: categoryIds.Transport,
    provider: "isracard",
  },
  {
    date: daysAgo(11),
    merchant: "Gett",
    amount: -42.5,
    cat: categoryIds.Transport,
    provider: "max",
  },
  {
    date: daysAgo(18),
    merchant: "Rav-Kav",
    amount: -124.0,
    cat: categoryIds.Transport,
    provider: "isracard",
  },
  // Bills
  {
    date: daysAgo(6),
    merchant: "Cellcom",
    amount: -89.0,
    cat: categoryIds.BillsUtilities,
    provider: "hapoalim",
  },
  {
    date: daysAgo(9),
    merchant: "Bezeq International",
    amount: -119.0,
    cat: categoryIds.BillsUtilities,
    provider: "hapoalim",
  },
  {
    date: daysAgo(14),
    merchant: "Hot · Pakage",
    amount: -209.0,
    cat: categoryIds.BillsUtilities,
    provider: "hapoalim",
  },
  // Subscriptions
  {
    date: daysAgo(7),
    merchant: "Netflix",
    amount: -49.9,
    cat: categoryIds.Subscriptions,
    provider: "max",
  },
  {
    date: daysAgo(7),
    merchant: "Spotify",
    amount: -19.9,
    cat: categoryIds.Subscriptions,
    provider: "max",
  },
  {
    date: daysAgo(7),
    merchant: "iCloud+",
    amount: -8.9,
    cat: categoryIds.Subscriptions,
    provider: "max",
  },
  // Food delivery
  {
    date: daysAgo(2),
    merchant: "Wolt · Pizza Domino",
    amount: -68.0,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  {
    date: daysAgo(5),
    merchant: "Tenten",
    amount: -120.0,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  // Health
  {
    date: daysAgo(10),
    merchant: "Super-Pharm",
    amount: -94.7,
    cat: categoryIds.Health,
    provider: "hapoalim",
  },
  {
    date: daysAgo(20),
    merchant: "Clalit Pharmacy",
    amount: -34.0,
    cat: categoryIds.Health,
    provider: "hapoalim",
  },
  // Last month
  {
    date: daysAgo(32),
    merchant: "Shufersal Deal",
    amount: -298.4,
    cat: categoryIds.Groceries,
    provider: "hapoalim",
  },
  {
    date: daysAgo(34),
    merchant: "Rav-Kav",
    amount: -124.0,
    cat: categoryIds.Transport,
    provider: "isracard",
  },
  {
    date: daysAgo(37),
    merchant: "Cellcom",
    amount: -89.0,
    cat: categoryIds.BillsUtilities,
    provider: "hapoalim",
  },
  {
    date: daysAgo(40),
    merchant: "Netflix",
    amount: -49.9,
    cat: categoryIds.Subscriptions,
    provider: "max",
  },
  {
    date: daysAgo(45),
    merchant: "Aroma · Dizengoff",
    amount: -14.5,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  {
    date: daysAgo(48),
    merchant: "Wolt · Sushi Bazaar",
    amount: -82.0,
    cat: categoryIds.Restaurants,
    provider: "isracard",
  },
  // Income (positive amount)
  {
    date: daysAgo(28),
    merchant: "Acme Industries · Payroll",
    amount: 18500.0,
    cat: categoryIds.Transfers,
    provider: "hapoalim",
  },
  {
    date: daysAgo(58),
    merchant: "Acme Industries · Payroll",
    amount: 18500.0,
    cat: categoryIds.Transfers,
    provider: "hapoalim",
  },
];

// Optional: monthly budget targets per parent category.
export const budgets = [
  { category_id: categoryIds.Groceries, monthly_target: 1200 },
  { category_id: categoryIds.Restaurants, monthly_target: 800 },
  { category_id: categoryIds.Transport, monthly_target: 500 },
  { category_id: categoryIds.BillsUtilities, monthly_target: 600 },
  { category_id: categoryIds.Subscriptions, monthly_target: 150 },
];
