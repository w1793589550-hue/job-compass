import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ForumStore, maskPhone, normalizePhone } from "../lib/forum-store.mjs";

test("forum store registers phone users without storing raw phone numbers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-compass-forum-"));
  const filePath = join(dir, "forum.json");
  let id = 0;
  const store = new ForumStore({
    filePath,
    phoneHashSecret: "test-secret",
    now: () => new Date("2026-07-03T00:00:00.000Z"),
    idFactory: () => `id-${++id}`,
  });

  const user = await store.createUser({
    phone: "13800138000",
    passwordHash: "hash",
    displayName: "天津求职者",
    role: "candidate",
  });

  assert.equal(user.phoneMasked, "138****8000");
  assert.equal(maskPhone("13800138000"), "138****8000");
  assert.equal(normalizePhone("138 0013 8000"), "13800138000");

  const raw = await readFile(filePath, "utf8");
  assert.equal(raw.includes("13800138000"), false);
  assert.equal(raw.includes("138****8000"), true);

  await assert.rejects(
    () => store.createUser({
      phone: "13800138000",
      passwordHash: "hash",
      displayName: "重复用户",
      role: "candidate",
    }),
    /已经注册/,
  );

  await rm(dir, { recursive: true, force: true });
});

test("forum posts and comments stay pending until an admin approves them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-compass-forum-"));
  const filePath = join(dir, "forum.json");
  let id = 0;
  const store = new ForumStore({
    filePath,
    phoneHashSecret: "test-secret",
    now: () => new Date("2026-07-03T00:00:00.000Z"),
    idFactory: () => `id-${++id}`,
  });

  await store.createUser({
    phone: "13900139000",
    passwordHash: "hash",
    displayName: "HR小李",
    role: "boss",
  });
  const rawUser = await store.userByPhone("13900139000");
  const post = await store.createPost(rawUser, {
    title: "这家公司适合应届生吗",
    body: "我想讨论一下这家公司是否适合应届生投递。",
    topic: "公司核验",
  });

  assert.equal(post.status, "pending");
  assert.deepEqual(await store.list(), []);
  assert.equal((await store.list({ viewerId: rawUser.id })).length, 1);

  await store.moderate({ type: "post", id: post.id, status: "approved" });
  assert.equal((await store.list()).length, 1);

  const comment = await store.createComment(rawUser, post.id, {
    body: "建议先核验招聘主体和社保主体。",
  });
  assert.equal(comment.status, "pending");
  assert.equal((await store.list())[0].comments.length, 0);

  await store.moderate({ type: "comment", id: comment.id, status: "approved" });
  assert.equal((await store.list())[0].comments.length, 1);

  await rm(dir, { recursive: true, force: true });
});

test("forum supports filters, summaries, and report resolution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "job-compass-forum-"));
  const filePath = join(dir, "forum.json");
  let id = 0;
  const store = new ForumStore({
    filePath,
    phoneHashSecret: "test-secret",
    now: () => new Date("2026-07-03T08:00:00.000Z"),
    idFactory: () => `id-${++id}`,
  });

  await store.createUser({
    phone: "13700137000",
    passwordHash: "hash",
    displayName: "求职同学",
    role: "candidate",
  });
  await store.createUser({
    phone: "13600136000",
    passwordHash: "hash",
    displayName: "HR小王",
    role: "boss",
  });
  const candidate = await store.userByPhone("13700137000");
  const boss = await store.userByPhone("13600136000");

  const post = await store.createPost(candidate, {
    title: "这家公司校招流程真实吗",
    body: "我想核验这家公司的校招流程和薪资福利描述是否一致。",
    topic: "公司核验",
  });
  await store.moderate({ type: "post", id: post.id, status: "approved" });

  assert.equal((await store.list({ filters: { topic: "公司核验" } })).length, 1);
  assert.equal((await store.list({ filters: { topic: "面试经验" } })).length, 0);
  assert.equal((await store.list({ filters: { q: "薪资福利" } })).length, 1);
  assert.equal((await store.list({ filters: { role: "candidate" } })).length, 1);
  await assert.rejects(
    () => store.createReport(candidate, {
      type: "post",
      id: post.id,
      reason: "举报自己的内容",
    }),
    /不能举报自己/,
  );

  const report = await store.createReport(boss, {
    type: "post",
    id: post.id,
    reason: "内容需要管理员核对来源",
  });
  assert.equal(report.status, "open");
  await assert.rejects(
    () => store.createReport(boss, {
      type: "post",
      id: post.id,
      reason: "重复举报",
    }),
    /已经举报过/,
  );

  const adminList = await store.list({ admin: true });
  assert.equal(adminList[0].reportCount, 1);
  assert.equal((await store.summary({ admin: true })).openReports, 1);

  await store.moderate({ type: "post", id: post.id, status: "rejected", reason: "证据不足" });
  assert.equal((await store.summary({ admin: true })).openReports, 0);

  await rm(dir, { recursive: true, force: true });
});
