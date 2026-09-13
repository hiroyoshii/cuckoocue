import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("app guide is public, navigable and survives reload without losing the search draft", async ({ page }, info) => {
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫と引っ越す");
  const nav = page.getByRole("navigation", { name: info.project.name === "mobile" ? "モバイルの主な操作" : "主な操作", exact: true });
  await nav.getByRole("button", { name: "タスク管理" }).click();
  await expect(page).toHaveURL(/view=apps/);
  await expect(page.getByRole("heading", { name: "タスク管理", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Android", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "iOS", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Googleでログイン", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "タスク管理", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await nav.getByRole("button", { name: "探す", exact: true }).click();
  await expect(page.getByLabel("Search query")).toHaveValue("猫と引っ越す");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "タスク管理", exact: true })).toBeVisible();
});
