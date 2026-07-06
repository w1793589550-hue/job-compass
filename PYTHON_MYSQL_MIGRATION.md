# Python + MySQL 迁移说明

当前线上版本仍是 Node 原生 HTTP 服务 + 静态前端脚本。管理员登录问题已经在现有版本内修复，并兼容 `ADMIN_PASSWORD` 与 `ADMIN_PASSWORD_HASH` 两种配置。

用户提出的“整体改成 Python/Java + MySQL，不再使用 .js”属于完整架构迁移，不适合直接在当前线上分支一次性硬切。原因是：

- 首页、外企页、论坛页的交互都依赖浏览器端脚本，包括表单联动、简历解析、结果渲染、表格导出和论坛审核。
- 后端 `server.mjs` 内包含 DeepSeek 调用、Tavily/Brave 检索、PDF/DOCX 解析、额度统计、管理员会话、论坛会话等多块逻辑。
- 如果直接删除 `.js`，页面会失去核心交互，部署后反而不可用。

## 推荐迁移路线

1. 先迁数据库层
   - 用 MySQL 替代 `data/usage.json`、`data/analytics.json`、`data/forum.json`。
   - 保留当前前端和 API 路径，先确保线上数据不再因 Render 重启丢失。

2. 再迁后端语言
   - Python 推荐 FastAPI。
   - Java 推荐 Spring Boot。
   - API 路径保持不变：`/api/generate`、`/api/forum/*`、`/api/admin/*`。

3. 最后迁前端
   - 如果坚持“不使用浏览器端 JS”，需要改成服务端渲染表单 + 页面刷新式交互。
   - 代价是：动态筛选、即时审核、表格导出、结果复制、文件解析进度等体验会下降。
   - 更实际的做法是：后端改 Python/MySQL，前端保留少量必要 JS。

## MySQL 表结构

见 `mysql_schema.sql`。

## 管理员配置

迁移后仍建议保留两种方式：

```text
ADMIN_PASSWORD_HASH=pbkdf2$sha256$310000$...
ADMIN_PASSWORD=仅演示环境使用
ADMIN_SESSION_SECRET=长随机字符串
```

优先使用 `ADMIN_PASSWORD_HASH`。课程答辩或演示环境可以使用 `ADMIN_PASSWORD` 快速配置。
