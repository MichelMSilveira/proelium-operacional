const { test, expect } = require("@playwright/test");

test("bot entra no app Proelium", async ({ page }) => {
  const username = process.env.PROELIUM_TEST_USER;
  const password = process.env.PROELIUM_TEST_PASSWORD;

  test.skip(
    !username || !password,
    "Defina PROELIUM_TEST_USER e PROELIUM_TEST_PASSWORD para o teste autenticado."
  );

  await page.goto("http://localhost:4173", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Entrar no sistema")).toBeVisible({
    timeout: 30000,
  });

  await page.locator('input[name="username"], input[type="text"]').first().fill(username);
  await page.locator('input[name="password"], input[type="password"]').first().fill(password);

  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(
    page.getByText(/Visão geral|Oportunidades|Central operacional/i)
  ).toBeVisible({
    timeout: 30000,
  });

});
