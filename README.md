# 职路：应届生求职工作台

职路不是单页筛选器，而是一套围绕求职者账号持续工作的 Web 产品。用户可以建立求职画像、核验企业与岗位、保存公开来源、维护投递阶段与下一步行动，并在审核制社区中补充经验信息。

## 产品闭环

1. 在“求职画像”中保存城市、身份、专业、岗位与行业偏好。
2. 在“机会核验”中按画像检索公开招聘信息，生成带来源的核验表格。
3. 登录用户的成功核验结果会自动进入“核验历史”，支持回看和 CSV 下载。
4. 确认机会后加入“投递进度”，持续更新待投递、笔试、面试、Offer 等阶段。
5. 首页从真实账号数据生成画像完成度、阶段统计和下一步待办。
6. 求职社区沿用同一账号，帖子与评论先审后发；管理员后台同时展示真实浏览器访问数据和产品使用数据。

## 页面与路由

- `/`：未登录时展示产品入口，登录后展示个人求职工作台。
- `/login`：独立登录与注册页面。
- `/profile`：账号私有的求职画像。
- `/discover`：企业与岗位核验条件工作台。
- `/research`：账号私有的核验历史和来源记录。
- `/applications`：账号私有的投递阶段、截止日期和跟进任务。
- `/foreign`：外企简历方向分析，简历正文不落盘。
- `/forum`：审核制求职社区。
- `/admin`：真实访问统计、产品数据概览与内容审核。
- `/privacy`：账号、求职数据和简历处理说明。

## 技术结构

- `app.py`：FastAPI 路由、会话、表单验证和页面上下文。
- `job_compass/career_store.py`：求职画像、投递记录和核验历史的数据接口，支持 JSON 与 MySQL。
- `job_compass/forum_store.py`：账号、帖子、评论和举报的本地数据层。
- `job_compass/mysql_store.py`：账号与社区的 MySQL 数据层。
- `job_compass/research.py`：联网搜索、DeepSeek 调用和简历读取。
- `job_compass/analytics_store.py`：浏览器上报的真实访问统计。
- `templates/`：Jinja2 服务端页面。
- `public/styles.css`：全站响应式产品界面。
- `mysql_schema.sql`：生产 MySQL 表结构。

本地未配置 MySQL 时，账号、社区、求职数据和访问统计写入 `data/` 下的 JSON 文件。配置 MySQL 后，账号、社区、求职工作台和访问统计都会使用数据库持久化。

## 本地启动

```powershell
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

访问 `http://127.0.0.1:4173/`。Windows 也可以运行 `启动网站.ps1`。

## 配置

在 `.env` 中按需填写：

```text
DEEPSEEK_API_KEY=...
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
FORUM_SESSION_SECRET=...
FORUM_PHONE_HASH_SECRET=...
ADMIN_PASSWORD_HASH=...
MYSQL_URL=mysql://user:password@host:3306/database
```

没有 DeepSeek 或搜索密钥时，站点和账号工作台仍可正常启动，机会核验会明确提示缺少配置。生产部署必须替换会话密钥和管理员密码，并建议配置 MySQL。

## 测试

```powershell
$env:PYTHONPATH = (Get-Location).Path
python tests/test_web_auth.py
python -m ruff check .
```

集成测试覆盖统一账号、私人页面访问控制、画像持久化、投递创建与阶段更新、跟进信息维护、核验历史、CSV 下载、社区审核、管理员统计和多选筛选。

## 数据与隐私

- 手机号只保存带服务端密钥的哈希和脱敏展示值。
- 密码使用 PBKDF2-SHA256 加盐哈希，不保存明文。
- 登录会话使用签名、HttpOnly、SameSite=Lax Cookie。
- 求职画像、投递记录和核验历史归属当前账号，普通用户之间不可互相读取。
- 简历正文只在当前请求中发送给模型分析，不写入本地文件或数据库。
- 浏览统计由真实浏览器页面上报，后台不会使用预填充的演示数字。
