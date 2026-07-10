import assert from "node:assert/strict";
import middleware, { decodeBasicCredentials } from "../middleware.js";

function basic(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

{
  const decoded = decodeBasicCredentials(Buffer.from("admin:päss🔒", "utf8").toString("base64"));
  assert.equal(decoded, "admin:päss🔒");
}

{
  const oldUser = process.env.ADMIN_USER;
  const oldPass = process.env.ADMIN_PASS;
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASS = "päss🔒";

  try {
    const ok = middleware(new Request("https://example.com/admin/", {
      headers: { Authorization: basic("admin", "päss🔒") },
    }));
    assert.equal(ok, undefined);

    const denied = middleware(new Request("https://example.com/admin/", {
      headers: { Authorization: basic("admin", "wrong") },
    }));
    assert.equal(denied.status, 401);
  } finally {
    if (oldUser == null) delete process.env.ADMIN_USER;
    else process.env.ADMIN_USER = oldUser;
    if (oldPass == null) delete process.env.ADMIN_PASS;
    else process.env.ADMIN_PASS = oldPass;
  }
}

console.log("Admin Basic Auth self-test passed: UTF-8 credentials authenticate and incorrect passwords remain denied.");
