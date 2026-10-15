// Every error code has a unique, stable number, the SDK agrees with the API, and responses carry it.
import { describe, expect, it } from "vitest";
import { setTestEnv } from "./helpers.ts";

setTestEnv();
const { ERROR_NUMBER, ERROR_STATUS } = await import("../src/server/errors.ts");
const { ERROR_NUMBERS, TabError } = await import("../packages/sdk/src/index.ts");
const { app } = await import("../src/server/app.ts");

describe("error numbers", () => {
  it("every server code has a number, and no two codes share one", () => {
    for (const code of Object.keys(ERROR_STATUS)) expect(ERROR_NUMBER[code as keyof typeof ERROR_NUMBER], code).toBeTypeOf("number");
    const nums = Object.values(ERROR_NUMBER);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("the SDK's table matches the API's for every API code", () => {
    for (const [code, n] of Object.entries(ERROR_NUMBER)) expect(ERROR_NUMBERS[code], code).toBe(n);
    const sdkNums = Object.values(ERROR_NUMBERS);
    expect(new Set(sdkNums).size).toBe(sdkNums.length);
  });

  it("numbers are grouped: 1xxx key, 2xxx tab, 3xxx payment rules, 4xxx request, 5xxx system", () => {
    const group = (c: string) => Math.floor(ERROR_NUMBER[c as keyof typeof ERROR_NUMBER] / 1000);
    expect(group("INVALID_CREDENTIAL")).toBe(1);
    expect(group("TAB_REVOKED")).toBe(2);
    expect(group("INSUFFICIENT_TAB_BALANCE")).toBe(3);
    expect(group("DUPLICATE_REQUEST")).toBe(4);
    expect(group("CHAIN_UNAVAILABLE")).toBe(5);
  });

  it("API error responses carry the number", async () => {
    const res = await app.request("http://localhost/api/v1/tab", { headers: { authorization: "Bearer tab_test_nope" } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toMatchObject({ code: "INVALID_CREDENTIAL", number: 1001 });
  });

  it("SDK TabError fills the number from the code when the API didn't send one", () => {
    expect(new TabError("PAYMENT_EXCEEDS_TAB_LIMIT", "x").number).toBe(3001);
    expect(new TabError("TAB_REVOKED", "x", 403, 2002).number).toBe(2002);
    expect(new TabError("SOMETHING_NEW", "x").number).toBeUndefined();
  });
});
