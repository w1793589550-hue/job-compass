import test from "node:test";
import assert from "node:assert/strict";
import { mysqlConfigFromEnv } from "../lib/mysql.mjs";

test("mysql config is disabled when no database environment is present", () => {
  assert.equal(mysqlConfigFromEnv({}), null);
});

test("mysql config parses MYSQL_URL connection strings", () => {
  const config = mysqlConfigFromEnv({
    MYSQL_URL: "mysql://job_user:secret%21@example.com:3307/job_compass?ssl=true",
    MYSQL_CONNECTION_LIMIT: "3",
  });
  assert.equal(config.host, "example.com");
  assert.equal(config.port, 3307);
  assert.equal(config.user, "job_user");
  assert.equal(config.password, "secret!");
  assert.equal(config.database, "job_compass");
  assert.equal(config.connectionLimit, 3);
  assert.deepEqual(config.ssl, {});
});

test("mysql config supports separate host credentials", () => {
  const config = mysqlConfigFromEnv({
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3306",
    MYSQL_USER: "job",
    MYSQL_PASSWORD: "pass",
    MYSQL_DATABASE: "job_compass",
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.user, "job");
  assert.equal(config.database, "job_compass");
});
