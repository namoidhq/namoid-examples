import { expect, test } from "@playwright/test";

test("renter selects a car, shares a licence and deletes details", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText(/DEMO MODE/)).toBeVisible();
  await page.getByRole("button", { name: "Try as a demo renter" }).click();
  await page.getByRole("radio", { name: /A LITTLE MORE ADVENTURE/ }).check();
  await expect(
    page.getByRole("radio", { name: /A LITTLE MORE ADVENTURE/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: /Continue to licence check/ }).click();
  await expect(
    page.getByText("Synthetic driving licence", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Simulate sharing licence/ }).click();
  await expect(
    page.getByRole("heading", { name: "Licence details received." }),
  ).toBeVisible();
  await expect(page.getByText("••••4821", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/rental team still needs to review/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: info.outputPath("rental-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete shared licence details" })
    .click();
  await expect(
    page.getByText("Shared details deleted or expired", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("••••4821", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Try as a demo renter" }),
  ).toBeVisible();
});

test("renter can decline and cancel without completing verification", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try as a demo renter" }).click();
  await page.getByRole("button", { name: /Continue to licence check/ }).click();
  await page.getByRole("button", { name: "Decline and return" }).click();
  await expect(
    page.getByText("Licence check: declined", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Continue to licence check/ }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Cancel this check" }).click();
  await expect(
    page.getByText("Licence check: cancelled", { exact: true }),
  ).toBeVisible();
});
