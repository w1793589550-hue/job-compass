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
